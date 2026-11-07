import type {
  EnvironmentId,
  ProviderInstanceId,
  ServerConfig,
  ServerProvider,
  ThreadId,
} from "@t3tools/contracts";
import { useEffect, useRef } from "react";

import {
  awakeSignInCommand,
  offersAwakeSignIn,
  useAwakeSignInStore,
  watchSignInTerminal,
} from "../../awakeSignIn";
import { useStableCallback } from "../../hooks/useStableCallback";

/**
 * Awake's Sign in, for the thread on screen: the provider's own CLI login, run in a new terminal
 * in this thread's drawer. Also runs a sign-in Settings asked for, once this thread shows.
 */
export function useAwakeSignIn(input: {
  readonly environmentId: EnvironmentId;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly serverConfig: Pick<ServerConfig, "environment" | "settings"> | null;
  /** Only the thread on screen signs in: not one under Settings, nor a side chat. */
  readonly enabled: boolean;
  readonly runProviderSignIn: (
    command: string,
    providerInstanceId: ProviderInstanceId,
  ) => Promise<{ readonly threadId: ThreadId; readonly terminalId: string } | null>;
}): (provider: ServerProvider) => Promise<void> {
  const { environmentId, providers, serverConfig, enabled, runProviderSignIn } = input;
  const startingRef = useRef(false);

  const startSignIn = async (provider: ServerProvider) => {
    if (!enabled || serverConfig === null || startingRef.current) return;
    const command = awakeSignInCommand(
      provider,
      serverConfig.settings,
      serverConfig.environment.platform.os,
    );
    if (command === undefined) return;
    startingRef.current = true;
    const started = await runProviderSignIn(command, provider.instanceId).catch(() => null);
    startingRef.current = false;
    if (started !== null) {
      watchSignInTerminal({ environmentId, ...started, instanceId: provider.instanceId });
    }
  };
  const startSignInStable = useStableCallback(startSignIn);

  const request = useAwakeSignInStore((state) => state.request);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- runs the sign-in Settings asked for once this thread shows, so its drawer opens where the member is
  useEffect(() => {
    if (request === null || !enabled || serverConfig === null) return;
    const provider = providers.find((entry) => entry.instanceId === request.instanceId);
    if (provider === undefined) return;
    if (useAwakeSignInStore.getState().takeSignInRequest(environmentId) === null) return;
    // A provider signed in meanwhile needs nothing more.
    if (offersAwakeSignIn(provider)) void startSignInStable(provider);
  }, [enabled, environmentId, providers, request, serverConfig, startSignInStable]);

  return startSignInStable;
}
