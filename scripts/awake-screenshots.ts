// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalDate:off globalFetch:off globalTimers:off preferSchemaOverJson:off - a CI script around a built server and a browser, outside any Effect.
// Seeds T3 Code with its own provider fixtures, sets Awake's theme as a box does, and captures
// Awake Chat's main views in Paper and Soft dark at three widths. Every capture is attempted, and
// the run fails if any of them never showed what it waits for.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeUtil from "node:util";
import { chromium, type Page } from "playwright-core";

const repoRoot = NodeURL.fileURLToPath(new URL("..", import.meta.url));
const { values: options } = NodeUtil.parseArgs({
  options: {
    out: { type: "string", default: NodePath.join(repoRoot, "awake-screenshots") },
    theme: { type: "string", default: NodePath.join(repoRoot, "assets/awake/awake-theme.json") },
    "pull-request": { type: "string", default: "pingdotgg/t3code#30498" },
    port: { type: "string", default: "47731" },
  },
});

const T3 = NodePath.join(repoRoot, "apps/server/dist/bin.mjs");
const FIXTURES = NodePath.join(repoRoot, "apps/server/src/provider");
const out = NodePath.resolve(options.out);
const origin = `http://127.0.0.1:${options.port}`;
const [pullRequestRepository = "", pullRequestNumber = ""] = options["pull-request"].split("#");

const USER_MESSAGE =
  "Make the greeting in src/greeting.ts friendlier, then tell me what you changed.";
const REPLY =
  "I made the greeting friendlier: it now welcomes the person by name, in a template string. " +
  "The change is on this branch, so you can review it in the diff before you open a pull request.";
const REPLY_MARK = "review it in the diff";
// A line only the diff shows: the reply never quotes the code.
const DIFF_MARK = "Good to see you";
const SIGNED_OUT_MARK = "in Terminal, then come back here";

// Whether the page shows `text`, inside shadow roots too, where the diff draws its lines.
const deepTextCheck = (text: string) => `(() => {
  const has = (root) =>
    (root.textContent ?? "").includes(${JSON.stringify(text)}) ||
    [...root.querySelectorAll("*")].some((node) => node.shadowRoot !== null && has(node.shadowRoot));
  return has(document.body);
})()`;

const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
] as const;
const THEMES = [
  { name: "paper", colorScheme: "light" },
  { name: "soft-dark", colorScheme: "dark" },
] as const;

const scratch = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "awake-screenshots-"));
const home = NodePath.join(scratch, "home");
const t3Home = NodePath.join(scratch, "t3");
const bin = NodePath.join(scratch, "bin");
const homeRepo = NodePath.join(home, "src", "home");
const pullRequestRepo = NodePath.join(home, "src", "t3code");
for (const dir of [home, t3Home, bin, homeRepo, pullRequestRepo, out]) {
  NodeFS.mkdirSync(dir, { recursive: true });
}

const baseEnv: Record<string, string> = {
  PATH: process.env.PATH ?? "",
  HOME: home,
  T3CODE_HOME: t3Home,
  TMPDIR: scratch,
  LANG: "C.UTF-8",
  T3CODE_TELEMETRY_ENABLED: "false",
};
// The box names the environment, and the server reads pull requests with the job's own token.
const serverEnv: Record<string, string> = {
  ...baseEnv,
  AWAKE_BOX_NAME: "maya-chen",
  ...(process.env.GH_TOKEN ? { GH_TOKEN: process.env.GH_TOKEN } : {}),
};

// Pairing links and session tokens never reach an uploaded log.
const redact = (text: string) =>
  text.replace(/(token=|"credential": ?"|"token": ?")[^\s&#"]+/g, "$1<redacted>");

function run(command: string, args: ReadonlyArray<string>, cwd: string, env = baseEnv): string {
  const result = NodeChildProcess.spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 180_000,
  });
  if (result.status !== 0) {
    const what = [NodePath.basename(command), ...args.slice(0, 2)].join(" ");
    const output = redact(`${result.stdout}${result.stderr}`);
    throw new Error(`${what} exited ${String(result.status)}:\n${output}`);
  }
  return result.stdout;
}

const t3 = (args: ReadonlyArray<string>, env = baseEnv) =>
  run(process.execPath, [T3, ...args], home, env);
const git = (cwd: string, ...args: ReadonlyArray<string>) =>
  run("git", ["-c", "user.name=Maya Chen", "-c", "user.email=maya@example.com", ...args], cwd);
const write = (root: string, file: string, text: string) => {
  NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, file)), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(root, file), text);
};
// The CLI can print log lines before its JSON.
const jsonFrom = <A>(text: string, opening: "{" | "["): A =>
  JSON.parse(text.slice(text.indexOf(opening))) as A;

async function waitFor(check: () => Promise<boolean>, label: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function seedRepositories() {
  write(homeRepo, "README.md", "# Home\n\nA small project for Awake Chat's screenshots.\n");
  write(
    homeRepo,
    "src/greeting.ts",
    'export function greeting(name: string): string {\n  return "Hello " + name;\n}\n',
  );
  git(homeRepo, "init", "--quiet", "--initial-branch=main");
  git(homeRepo, "add", ".");
  git(homeRepo, "commit", "--quiet", "-m", "Add a greeting");
  git(homeRepo, "switch", "--quiet", "--create", "friendlier-greeting");
  write(
    homeRepo,
    "src/greeting.ts",
    [
      "export function greeting(name: string): string {",
      "  return `Hello, ${name}! Good to see you.`;",
      "}",
      "",
    ].join("\n"),
  );
  git(homeRepo, "commit", "--quiet", "-am", "Make the greeting friendlier");
  write(
    homeRepo,
    "README.md",
    '# Home\n\nA small project for Awake Chat\'s screenshots.\n\nCall `greeting("Maya")` to say hello.\n',
  );

  write(pullRequestRepo, "README.md", "# T3 Code\n");
  git(pullRequestRepo, "init", "--quiet", "--initial-branch=main");
  git(pullRequestRepo, "add", ".");
  git(pullRequestRepo, "commit", "--quiet", "-m", "Start");
  const remote = `https://github.com/${pullRequestRepository}.git`;
  git(pullRequestRepo, "remote", "add", "origin", remote);
}

// T3 Code's own test fixtures stand in for the agents: Codex answers one turn, and Claude Code
// reports no sign-in.
function writeProviderSettings() {
  const fixture = (relative: string, name: string, mode = 0o644) => {
    const target = NodePath.join(bin, name);
    NodeFS.copyFileSync(NodePath.join(FIXTURES, relative), target);
    NodeFS.chmodSync(target, mode);
    return target;
  };
  const codex = fixture("testFixtures/codexCollabMockPeer.sh", "codex", 0o755);
  const peerPath = fixture("testFixtures/codexCollabMockPeer.mjs", "codexCollabMockPeer.mjs");
  // The peer calls itself Codex 0.0.0, which T3 Code refuses to run; Awake pins Codex 0.160.0.
  const peer = NodeFS.readFileSync(peerPath, "utf8");
  if (!peer.includes("t3-collab-mock/0.0.0")) throw new Error("The Codex peer's version moved.");
  NodeFS.writeFileSync(peerPath, peer.replace("t3-collab-mock/0.0.0", "t3-collab-mock/0.160.0"));
  const wirePath = fixture("testFixtures/codexMultiAgentWire.json", "codexMultiAgentWire.json");
  const claude = fixture("testing/ProviderInstanceRegistryLive.fixture.mjs", "claude", 0o755);

  const wire = jsonFrom<{
    readonly responses: {
      readonly threadStart: { readonly thread: { readonly id: string } };
      readonly turnStart: { readonly turn: { readonly id: string } };
    };
  }>(NodeFS.readFileSync(wirePath, "utf8"), "{");
  const threadId = wire.responses.threadStart.thread.id;
  const codexScript = NodePath.join(scratch, "codex-script.json");
  NodeFS.writeFileSync(
    codexScript,
    JSON.stringify({
      rootThreadId: threadId,
      notifications: [
        {
          method: "item/completed",
          params: {
            item: {
              type: "agentMessage",
              id: "awake-screenshot-reply",
              text: REPLY,
              phase: "final_answer",
              memoryCitation: null,
            },
            threadId,
            turnId: wire.responses.turnStart.turn.id,
            completedAtMs: Date.now(),
          },
        },
      ],
    }),
  );

  const variable = (name: string, value: string) => ({ name, value, sensitive: false });
  const settingsPath = NodePath.join(t3Home, "userdata", "settings.json");
  NodeFS.mkdirSync(NodePath.dirname(settingsPath), { recursive: true });
  const settings = {
    enableProviderUpdateChecks: false,
    backgroundActivity: { profile: "battery-saver" },
    defaultModelSelection: { instanceId: "claudeAgent", model: "claude-opus-5-5" },
    providerInstances: {
      codex: {
        driver: "codex",
        enabled: true,
        environment: [variable("T3_CODEX_COLLAB_SCRIPT", codexScript)],
        config: { enabled: true, binaryPath: codex },
      },
      claudeAgent: {
        driver: "claudeAgent",
        enabled: true,
        // The fixture is signed out while this file is missing.
        environment: [variable("T3_CLAUDE_LOGIN_MARKER", NodePath.join(scratch, "signed-in"))],
        config: { enabled: true, binaryPath: claude },
      },
    },
  };
  NodeFS.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

async function pullRequestTitle(): Promise<string> {
  const token = process.env.GH_TOKEN;
  const response = await fetch(
    `https://api.github.com/repos/${pullRequestRepository}/pulls/${pullRequestNumber}`,
    {
      headers: {
        accept: "application/vnd.github+json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub answered ${String(response.status)} for the PR.`);
  return ((await response.json()) as { readonly title: string }).title;
}

interface View {
  readonly name: string;
  readonly open: (page: Page) => Promise<void>;
}

function views(input: {
  readonly environmentId: string;
  readonly threadId: string;
  readonly pullRequestTitle: string;
}): ReadonlyArray<View> {
  const openThread = async (page: Page) => {
    await page.goto(`${origin}/${input.environmentId}/${input.threadId}`);
    await page.getByText(REPLY_MARK).first().waitFor({ timeout: 30_000 });
  };
  const pullRequest = new URLSearchParams({
    repository: pullRequestRepository,
    number: pullRequestNumber,
    host: "github.com",
    state: "all",
  });
  return [
    { name: "thread", open: openThread },
    {
      name: "pull-request",
      open: async (page) => {
        await page.goto(`${origin}/pull-requests?${pullRequest.toString()}`);
        await page.getByText(input.pullRequestTitle).first().waitFor({ timeout: 60_000 });
      },
    },
    {
      name: "diff",
      open: async (page) => {
        await openThread(page);
        await page.keyboard.press("Control+d");
        await page
          .getByRole("button", { name: /^Diff scope/ })
          .first()
          .waitFor({ timeout: 30_000 });
        const linesShown = () =>
          page
            .evaluate(deepTextCheck(DIFF_MARK))
            .then((value) => value === true)
            .catch(() => false);
        await waitFor(linesShown, "the diff's lines", 30_000);
      },
    },
    {
      name: "settings",
      open: async (page) => {
        await page.goto(`${origin}/settings/general`);
        await page.getByRole("dialog").first().waitFor({ timeout: 30_000 });
      },
    },
    {
      // The index starts a draft in the latest project, on the default agent: Claude Code.
      name: "signed-out-composer",
      open: async (page) => {
        await page.goto(`${origin}/`);
        await page.waitForURL(/\/draft\//, { timeout: 30_000 });
        await page.getByText(SIGNED_OUT_MARK).first().waitFor({ timeout: 30_000 });
      },
    },
  ];
}

const failures: Array<{ readonly step: string; readonly error: string }> = [];
const pageErrors: Array<string> = [];
const captured: Array<string> = [];
const fail = (step: string, error: unknown) => {
  const message = redact(error instanceof Error ? error.message : String(error));
  failures.push({ step, error: message });
  console.error(`[awake-screenshots] ${step} failed: ${message}`);
};

seedRepositories();
writeProviderSettings();
t3(["project", "add", homeRepo, "--title", "Home"]);
t3(["project", "add", pullRequestRepo, "--title", "T3 Code"]);
// As boxd does on a box's first chat: Awake's palettes, published as the theme "awake".
t3(["theme", "set", NodePath.resolve(options.theme), "--id", "awake"]);

const serverLog = NodeFS.openSync(NodePath.join(out, "server.log"), "w");
const server = NodeChildProcess.spawn(
  process.execPath,
  [T3, "serve", "--host", "127.0.0.1", "--port", options.port, "--no-browser"],
  { cwd: home, env: serverEnv, stdio: ["ignore", "pipe", "pipe"] },
);
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk: Buffer) => NodeFS.writeSync(serverLog, redact(chunk.toString())));
}

try {
  await waitFor(async () => {
    try {
      return (await fetch(`${origin}/`)).ok;
    } catch {
      return false;
    }
  }, "the server to answer");

  let threadId: string;
  try {
    const start = ["thread", "start", homeRepo, USER_MESSAGE, "--title", "Friendlier greeting"];
    const agent = ["--provider", "codex", "--model", "gpt-6-astra", "--wait", "--json"];
    const started = t3([...start, ...agent], serverEnv);
    threadId = jsonFrom<{ readonly threadId: string }>(started, "{").threadId;
  } catch (error) {
    // The thread is still captured, as the run left it.
    fail("the thread's reply", error);
    const listed = t3(["thread", "list", "--project", homeRepo, "--json"], serverEnv);
    const [first] = jsonFrom<ReadonlyArray<{ readonly threadId: string }>>(listed, "[");
    threadId = first?.threadId ?? "";
  }

  const descriptor = (await (await fetch(`${origin}/.well-known/t3/environment`)).json()) as {
    readonly environmentId: string;
  };
  const title = await pullRequestTitle().catch((error: unknown) => {
    fail("reading the pull request's title", error);
    return pullRequestNumber;
  });
  const pairing = jsonFrom<{ readonly pairUrl: string }>(
    t3(["auth", "pairing", "create", "--base-url", origin, "--json"], serverEnv),
    "{",
  );

  const browser = await chromium.launch();
  try {
    const pairingContext = await browser.newContext({ viewport: WIDTHS[0] });
    const pairingPage = await pairingContext.newPage();
    await pairingPage.goto(pairing.pairUrl);
    await pairingPage.waitForURL((url) => !url.pathname.startsWith("/pair"), { timeout: 60_000 });
    // The box's default theme is adopted once the client has the server's settings. The page
    // navigates meanwhile, which can cut a read short.
    const adopted = () =>
      pairingPage
        .evaluate("localStorage.getItem('t3code:theme') === 'awake'")
        .then((value) => value === true)
        .catch(() => false);
    await waitFor(adopted, "Awake's theme to be adopted", 30_000).catch((error: unknown) =>
      fail("adopting Awake's theme", error),
    );
    const storageState = await pairingContext.storageState();
    await pairingContext.close();

    const capture = views({
      environmentId: descriptor.environmentId,
      threadId,
      pullRequestTitle: title,
    });
    for (const theme of THEMES) {
      for (const viewport of WIDTHS) {
        const context = await browser.newContext({
          storageState,
          viewport,
          colorScheme: theme.colorScheme,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => pageErrors.push(redact(error.message)));
        for (const view of capture) {
          const name = `${view.name}-${theme.name}-${String(viewport.width)}.png`;
          try {
            await view.open(page);
            await page.evaluate("document.fonts.ready.then(() => true)");
            await page.waitForTimeout(500);
            await page.screenshot({ path: NodePath.join(out, name), animations: "disabled" });
            captured.push(name);
          } catch (error) {
            fail(name, error);
            const shown = await page
              .evaluate("document.body.innerText.slice(0, 1500)")
              .catch(() => "");
            console.error(`[awake-screenshots] ${page.url()} showed:\n${redact(String(shown))}`);
            await page
              .screenshot({ path: NodePath.join(out, `FAILED-${name}`) })
              .catch(() => undefined);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
} catch (error) {
  fail("seeding the server", error);
} finally {
  server.kill("SIGTERM");
  const summary = { captured, failures, pageErrors };
  NodeFS.writeFileSync(NodePath.join(out, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

const expected = THEMES.length * WIDTHS.length * 5;
console.log(`[awake-screenshots] ${String(captured.length)} of ${String(expected)} captured.`);
if (failures.length > 0 || captured.length !== expected) {
  const log = NodeFS.readFileSync(NodePath.join(out, "server.log"), "utf8").split("\n");
  console.error(`[awake-screenshots] the server's last lines:\n${log.slice(-60).join("\n")}`);
  process.exitCode = 1;
}
