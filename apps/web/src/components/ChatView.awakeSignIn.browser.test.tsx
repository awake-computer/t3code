import { createMemoryHistory } from "@tanstack/react-router";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  WS_METHODS,
  type ServerProvider,
  type TerminalOpenInput,
  type TerminalSummary,
  type TerminalWriteInput,
} from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
// The route loads ChatView lazily, and its first transform takes seconds; importing it here
// keeps that out of the test's timeout.
import "~/components/ChatView";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { startMainAppLocationTracking } from "~/components/sidebar/mainAppLocation";
import { knownTerminalSessionsAtom } from "~/state/terminalSessions";
import {
  ENVIRONMENT_ID,
  PROJECT_ID,
  emitTerminalMetadata,
  installFakeEnvironment,
  requestsTo,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

vi.mock(import("~/branding"), async (original) => ({
  ...(await original()),
  IS_AWAKE_BRAND: true,
}));

const CLAUDE = ProviderInstanceId.make("claudeAgent");
const signedOutClaude: ServerProvider = {
  instanceId: CLAUDE,
  driver: ProviderDriverKind.make("claudeAgent"),
  displayName: "Claude Code",
  enabled: true,
  installed: true,
  version: "2.1.289",
  status: "error",
  auth: { status: "unauthenticated" },
  message: "Claude Code is not authenticated. Run `claude auth login` and try again.",
  checkedAt: "2026-11-06T00:00:00.000Z",
  models: [
    { slug: "claude-opus-5-5", name: "Claude Opus 5.5", isCustom: false, capabilities: null },
  ],
  skills: [],
  slashCommands: [],
};

// A box whose one agent, Claude Code, is signed out and picked for new threads.
const signedOutBox = {
  providers: [signedOutClaude],
  settings: { defaultModelSelection: { instanceId: CLAUDE, model: "claude-opus-5-5" } },
  answersTerminals: true,
};

function setup() {
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const draftId = DraftId.make("draft-sign-in");
  const threadId = ThreadId.make("thread-sign-in");
  useComposerDraftStore
    .getState()
    .setProjectDraftThreadId(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), draftId, { threadId });
  return { draftId, threadId };
}

const loginRefreshes = () =>
  requestsTo(WS_METHODS.serverRefreshProviders).filter(
    (input) => (input as { readonly refreshModels?: boolean }).refreshModels === true,
  );

it("runs the agent's own login in the thread's drawer, and reads its status once it ends", async () => {
  using _environment = installFakeEnvironment([], signedOutBox);
  const { draftId, threadId } = setup();
  const router = getRouter(createMemoryHistory({ initialEntries: [`/draft/${draftId}`] }));
  await router.load();
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });

  const signIn = page.getByRole("button", { name: "Sign in to Claude Code" });
  // The banner waits for the server's providers and the draft's agent.
  await expect.element(signIn, { timeout: 10_000 }).toBeVisible();
  await expect
    .element(page.getByText("Sign in opens a terminal here and runs Claude Code's own login."))
    .toBeVisible();
  await signIn.click();

  await vi.waitFor(() => expect(requestsTo(WS_METHODS.terminalWrite)).toHaveLength(1));
  const open = requestsTo(WS_METHODS.terminalOpen)[0] as TerminalOpenInput;
  expect(open).toMatchObject({ threadId, providerInstanceId: CLAUDE });
  expect(requestsTo(WS_METHODS.terminalWrite)).toEqual([
    expect.objectContaining({
      threadId,
      terminalId: open.terminalId,
      data: "claude auth login\r",
    } satisfies TerminalWriteInput),
  ]);
  await vi.waitFor(() =>
    expect(
      document.querySelector('[data-thread-terminal-drawer][data-terminal-owner="drawer"]'),
    ).not.toBeNull(),
  );
  // The button takes clicks again once the login is typed and watched.
  await expect.element(signIn).toBeEnabled();

  const terminal: TerminalSummary = {
    threadId,
    terminalId: open.terminalId,
    cwd: open.cwd,
    worktreePath: null,
    status: "running",
    pid: 4242,
    exitCode: null,
    exitSignal: null,
    hasRunningSubprocess: true,
    label: "claude",
    updatedAt: "2026-11-06T00:00:01.000Z",
  };
  await emitTerminalMetadata({ type: "upsert", terminal });
  await vi.waitFor(() =>
    expect(
      appAtomRegistry
        .get(knownTerminalSessionsAtom(ENVIRONMENT_ID, threadId))
        ?.some((session) => session.state.hasRunningSubprocess),
    ).toBe(true),
  );
  expect(loginRefreshes()).toEqual([]);

  await emitTerminalMetadata({
    type: "upsert",
    terminal: { ...terminal, hasRunningSubprocess: false, updatedAt: "2026-11-06T00:00:02.000Z" },
  });
  await vi.waitFor(() =>
    expect(loginRefreshes()).toEqual([expect.objectContaining({ instanceId: CLAUDE })]),
  );
  // Closing the terminal ends the watch.
  await emitTerminalMetadata({ type: "remove", threadId, terminalId: open.terminalId });
});

it("leaves Settings for the thread it opened over, whose drawer runs the login", async () => {
  using _environment = installFakeEnvironment([], signedOutBox);
  const { draftId } = setup();
  const router = getRouter(createMemoryHistory({ initialEntries: [`/draft/${draftId}`] }));
  await router.load();
  // AppRoot brings its own router.
  await using _app = await render(<AppRoot router={router} />, { router: false });
  using _tracking = { [Symbol.dispose]: startMainAppLocationTracking(router) };
  await expect
    .element(page.getByRole("button", { name: "Sign in to Claude Code" }), { timeout: 10_000 })
    .toBeVisible();
  await router.navigate({ to: "/settings/providers" });

  // Settings names the agent by its driver, and its row and its Status row both offer Sign in.
  const signIn = page.getByRole("button", { name: "Sign in to Claude" }).first();
  await expect.element(signIn, { timeout: 10_000 }).toBeVisible();
  await signIn.click();

  await vi.waitFor(() => expect(router.state.location.pathname).toBe(`/draft/${draftId}`));
  await vi.waitFor(() =>
    expect(requestsTo(WS_METHODS.terminalWrite)).toEqual([
      expect.objectContaining({ data: "claude auth login\r" }),
    ]),
  );
  const open = requestsTo(WS_METHODS.terminalOpen)[0] as TerminalOpenInput;
  expect(open).toMatchObject({ providerInstanceId: CLAUDE });
  await emitTerminalMetadata({
    type: "remove",
    threadId: open.threadId,
    terminalId: open.terminalId,
  });
});
