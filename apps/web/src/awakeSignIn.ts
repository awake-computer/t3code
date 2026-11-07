import type { KnownTerminalSession } from "@t3tools/client-runtime/state/terminal";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ExecutionEnvironmentPlatformOs,
  ProviderInstanceId,
  ServerProvider,
  ServerSettings,
  ThreadId,
} from "@t3tools/contracts";
import { create } from "zustand";

import { IS_AWAKE_BRAND } from "./branding";
import { resolveOnboardingProviderLoginCommand } from "./onboarding/providerReadiness.logic";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { serverEnvironment } from "./state/server";
import { knownTerminalSessionsAtom } from "./state/terminalSessions";

/**
 * Whether Awake's build offers Sign in for this provider: an agent a box runs, installed and on,
 * that reports no sign-in. Each signs in with its own CLI, never Chat's managed sign-in, which the
 * policy locks (FDD-0053 §6.5).
 */
export function offersAwakeSignIn(
  provider: ServerProvider | null | undefined,
  awake = IS_AWAKE_BRAND,
): provider is ServerProvider {
  return (
    awake &&
    provider != null &&
    (provider.driver === "claudeAgent" || provider.driver === "codex") &&
    provider.enabled &&
    provider.status !== "disabled" &&
    provider.installed &&
    provider.auth.status === "unauthenticated"
  );
}

/**
 * The CLI's own sign-in for Awake's build, with the instance's binary. A box has no browser of its
 * own: Claude Code prints a link and takes back the code its page shows, and Codex uses a device
 * code, since its default flow waits for a browser on the box's localhost.
 */
export function awakeSignInCommand(
  provider: ServerProvider,
  settings: ServerSettings,
  platform: ExecutionEnvironmentPlatformOs,
  awake = IS_AWAKE_BRAND,
): string | undefined {
  if (!awake) return undefined;
  if (provider.driver === "claudeAgent") {
    return resolveOnboardingProviderLoginCommand(provider, settings, platform);
  }
  if (provider.driver === "codex") {
    return `${resolveOnboardingProviderLoginCommand(provider, settings, platform)} --device-auth`;
  }
  return undefined;
}

/** A sign-in asked for where no thread shows, as in Settings, for the thread shown next to run. */
export interface AwakeSignInRequest {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
}

interface AwakeSignInStoreState {
  readonly request: AwakeSignInRequest | null;
  readonly requestSignIn: (request: AwakeSignInRequest) => void;
  /** Hands the request to a thread of its environment, once. */
  readonly takeSignInRequest: (environmentId: EnvironmentId) => AwakeSignInRequest | null;
}

export const useAwakeSignInStore = create<AwakeSignInStoreState>()((set, get) => ({
  request: null,
  requestSignIn: (request) => set({ request }),
  takeSignInRequest: (environmentId) => {
    const { request } = get();
    if (request === null || request.environmentId !== environmentId) return null;
    set({ request: null });
    return request;
  },
}));

/** A sign-in terminal before the server lists it, at its prompt, or running a command. */
export type SignInTerminalPhase = "pending" | "idle" | "running";

/**
 * The sign-in terminal's next phase from the terminals the server lists, null until it sends
 * them, and whether a command in it just ended. `done` once the terminal is gone.
 */
export function nextSignInTerminalPhase(
  phase: SignInTerminalPhase,
  sessions: ReadonlyArray<KnownTerminalSession> | null,
  terminalId: string,
): { readonly phase: SignInTerminalPhase | "done"; readonly commandEnded: boolean } {
  if (sessions === null) return { phase, commandEnded: false };
  const session = sessions.find((entry) => entry.target.terminalId === terminalId);
  // The list can lag the open, so the terminal is gone only once it has been listed.
  if (session === undefined) {
    return phase === "pending"
      ? { phase, commandEnded: false }
      : { phase: "done", commandEnded: phase === "running" };
  }
  if (session.state.status === "exited" || session.state.status === "error") {
    return { phase: "done", commandEnded: phase === "running" };
  }
  if (session.state.hasRunningSubprocess) return { phase: "running", commandEnded: false };
  return { phase: "idle", commandEnded: phase === "running" };
}

/**
 * Reads the provider's status again each time a command in its sign-in terminal ends, so a
 * finished sign-in shows without a refresh, until the terminal closes. It outlives the view
 * that started it, since a sign-in can end after the member has moved to another thread.
 */
export function watchSignInTerminal(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly terminalId: string;
  readonly instanceId: ProviderInstanceId;
}): void {
  let phase: SignInTerminalPhase = "pending";
  let done = false;
  let unsubscribe: (() => void) | null = null;
  unsubscribe = appAtomRegistry.subscribe(
    knownTerminalSessionsAtom(input.environmentId, input.threadId),
    (sessions) => {
      if (done) return;
      const next = nextSignInTerminalPhase(phase, sessions, input.terminalId);
      if (next.commandEnded) {
        void runAtomCommand(
          appAtomRegistry,
          serverEnvironment.refreshProviders,
          {
            environmentId: input.environmentId,
            input: { instanceId: input.instanceId, refreshModels: true },
          },
          { label: "Refresh provider status", reportFailure: false },
        );
      }
      if (next.phase !== "done") {
        phase = next.phase;
        return;
      }
      done = true;
      unsubscribe?.();
    },
    { immediate: true },
  );
  // The first, immediate reading can already find the terminal gone.
  if (done) unsubscribe();
}
