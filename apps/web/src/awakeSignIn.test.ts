import {
  combineTerminalSessionState,
  EMPTY_TERMINAL_BUFFER_STATE,
  type KnownTerminalSession,
} from "@t3tools/client-runtime/state/terminal";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ServerProvider,
  type TerminalSummary,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  awakeSignInCommand,
  nextSignInTerminalPhase,
  offersAwakeSignIn,
  useAwakeSignInStore,
} from "./awakeSignIn";

const signedOutClaude: ServerProvider = {
  instanceId: ProviderInstanceId.make("claudeAgent"),
  driver: ProviderDriverKind.make("claudeAgent"),
  displayName: "Claude Code",
  enabled: true,
  installed: true,
  version: "2.1.289",
  status: "error",
  auth: { status: "unauthenticated" },
  message: "Claude Code is not authenticated. Run `claude auth login` and try again.",
  checkedAt: "2026-11-06T00:00:00Z",
  models: [],
  skills: [],
  slashCommands: [],
};
const signedOutCodex: ServerProvider = {
  ...signedOutClaude,
  instanceId: ProviderInstanceId.make("codex"),
  driver: ProviderDriverKind.make("codex"),
  displayName: "Codex",
  version: "0.160.0",
  message: "Codex CLI is not authenticated. Run `codex login` and try again.",
};

describe("awakeSignInCommand", () => {
  it("runs each agent's own login, Codex's with a device code, in Awake's build only", () => {
    expect(awakeSignInCommand(signedOutClaude, DEFAULT_SERVER_SETTINGS, "linux", true)).toBe(
      "claude auth login",
    );
    expect(awakeSignInCommand(signedOutCodex, DEFAULT_SERVER_SETTINGS, "linux", true)).toBe(
      "codex login --device-auth",
    );
    const cursor = { ...signedOutCodex, driver: ProviderDriverKind.make("cursor") };
    expect(awakeSignInCommand(cursor, DEFAULT_SERVER_SETTINGS, "linux", true)).toBeUndefined();
    expect(
      awakeSignInCommand(signedOutClaude, DEFAULT_SERVER_SETTINGS, "linux", false),
    ).toBeUndefined();
  });

  it("signs in with the instance's own binary", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        [signedOutCodex.instanceId]: {
          driver: signedOutCodex.driver,
          config: { binaryPath: "/opt/awake/bin/codex" },
        },
      },
    };
    expect(awakeSignInCommand(signedOutCodex, settings, "linux", true)).toBe(
      "/opt/awake/bin/codex login --device-auth",
    );
  });
});

describe("offersAwakeSignIn", () => {
  it("offers Sign in for a box's agent that is on, installed and signed out", () => {
    expect(offersAwakeSignIn(signedOutClaude, true)).toBe(true);
    expect(offersAwakeSignIn(signedOutCodex, true)).toBe(true);
    expect(offersAwakeSignIn(signedOutClaude, false)).toBe(false);
    expect(
      offersAwakeSignIn(
        { ...signedOutClaude, status: "ready", auth: { status: "authenticated" } },
        true,
      ),
    ).toBe(false);
    expect(offersAwakeSignIn({ ...signedOutClaude, installed: false }, true)).toBe(false);
    expect(offersAwakeSignIn({ ...signedOutClaude, enabled: false }, true)).toBe(false);
    const antigravity = { ...signedOutClaude, driver: ProviderDriverKind.make("antigravity") };
    expect(offersAwakeSignIn(antigravity, true)).toBe(false);
    expect(offersAwakeSignIn(undefined, true)).toBe(false);
  });
});

describe("useAwakeSignInStore", () => {
  it("hands Settings' request to one thread of its environment, once", () => {
    const box = EnvironmentId.make("box");
    useAwakeSignInStore.setState({ request: null });
    useAwakeSignInStore
      .getState()
      .requestSignIn({ environmentId: box, instanceId: signedOutClaude.instanceId });
    expect(useAwakeSignInStore.getState().takeSignInRequest(EnvironmentId.make("other"))).toBe(
      null,
    );
    expect(useAwakeSignInStore.getState().takeSignInRequest(box)).toEqual({
      environmentId: box,
      instanceId: signedOutClaude.instanceId,
    });
    expect(useAwakeSignInStore.getState().takeSignInRequest(box)).toBe(null);
  });
});

const summary: TerminalSummary = {
  threadId: "thread-1",
  terminalId: "term-2",
  cwd: "/home/maya",
  worktreePath: null,
  status: "running",
  pid: 42,
  exitCode: null,
  exitSignal: null,
  hasRunningSubprocess: false,
  label: "Terminal 2",
  updatedAt: "2026-11-06T00:00:00.000Z",
};

function listed(changes: Partial<TerminalSummary>): ReadonlyArray<KnownTerminalSession> {
  const terminal = { ...summary, ...changes };
  return [
    {
      target: {
        environmentId: EnvironmentId.make("box"),
        threadId: ThreadId.make(terminal.threadId),
        terminalId: terminal.terminalId,
      },
      state: combineTerminalSessionState(terminal, EMPTY_TERMINAL_BUFFER_STATE),
    },
  ];
}

describe("nextSignInTerminalPhase", () => {
  it("reads the provider again each time a command in its terminal ends", () => {
    // The server's list can lag the open.
    expect(nextSignInTerminalPhase("pending", null, "term-2")).toEqual({
      phase: "pending",
      commandEnded: false,
    });
    expect(nextSignInTerminalPhase("pending", [], "term-2")).toEqual({
      phase: "pending",
      commandEnded: false,
    });
    expect(nextSignInTerminalPhase("pending", listed({}), "term-2")).toEqual({
      phase: "idle",
      commandEnded: false,
    });
    expect(
      nextSignInTerminalPhase("idle", listed({ hasRunningSubprocess: true }), "term-2"),
    ).toEqual({ phase: "running", commandEnded: false });
    expect(
      nextSignInTerminalPhase("running", listed({ hasRunningSubprocess: true }), "term-2"),
    ).toEqual({ phase: "running", commandEnded: false });
    expect(nextSignInTerminalPhase("running", listed({}), "term-2")).toEqual({
      phase: "idle",
      commandEnded: true,
    });
  });

  it("stops once the terminal is gone, reading the provider if its login was running", () => {
    expect(nextSignInTerminalPhase("running", [], "term-2")).toEqual({
      phase: "done",
      commandEnded: true,
    });
    expect(nextSignInTerminalPhase("idle", [], "term-2")).toEqual({
      phase: "done",
      commandEnded: false,
    });
    expect(
      nextSignInTerminalPhase("running", listed({ status: "exited", exitCode: 0 }), "term-2"),
    ).toEqual({ phase: "done", commandEnded: true });
  });
});
