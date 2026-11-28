import {
  awakeConsoleOriginFrom,
  type DesktopBridge,
  type EnvironmentId,
  ThreadId,
} from "@t3tools/contracts";

import { IS_AWAKE_BRAND, MATCH_AWAKE_THEME_ID } from "./branding";
import { readThemePreference, setAppearanceMode } from "./hooks/useTheme";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "./state/primaryEnvironment";
import { environmentPresentations } from "./state/presentation";
import { primaryServerConfigAtom, primaryServerSettingsAtom } from "./state/server";

export type ConsoleTheme = "light" | "dark" | "system";

/** The root's mark while the console frames Chat: index.css draws Match Awake's header by it. */
export const FRAMED_ATTRIBUTE = "data-awake-framed";

/** What Chat posts the console when the gateway has ended its session (protocol v1). */
export const SESSION_ENDED_MESSAGE = {
  awake: "chat",
  state: "failed",
  code: "stream.session_ended",
} as const;

export function consoleThemeFrom(value: unknown): ConsoleTheme | undefined {
  return value === "light" || value === "dark" || value === "system" ? value : undefined;
}

/** The theme a boot URL's #awake-theme= names, and the fragment to leave in its place. */
export function takeBootTheme(hash: string): {
  readonly theme: ConsoleTheme | undefined;
  readonly hash: string;
} {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (!params.has("awake-theme")) return { theme: undefined, hash };
  const theme = consoleThemeFrom(params.get("awake-theme"));
  params.delete("awake-theme");
  const rest = params.toString();
  return { theme, hash: rest.length > 0 ? `#${rest}` : "" };
}

/** The theme a message asks for, only when it is protocol v1 from exactly the console's origin. */
export function consoleThemeMessage(
  message: { readonly origin: string; readonly data: unknown },
  consoleOrigin: string | undefined,
): ConsoleTheme | undefined {
  if (consoleOrigin === undefined || message.origin !== consoleOrigin) return undefined;
  const { data } = message;
  if (typeof data !== "object" || data === null) return undefined;
  const fields = data as Record<string, unknown>;
  return fields.awake === "chat" ? consoleThemeFrom(fields.theme) : undefined;
}

/** What Chat posts the console once it can open a link in its browser (protocol v1). */
export const BROWSER_READY_MESSAGE = { awake: "chat", browser: "ready" } as const;

/** The longest link the console may hand Chat's browser. */
const MAX_BROWSER_LINK = 2048;

/**
 * Whether a link is to one of the box's own addresses, http or https with no user or password:
 * localhost, a name under .localhost, 127.0.0.0/8 or [::1] (FDD-0060 §5.4).
 */
export function isBoxLocalLink(value: string): boolean {
  if (value.length > MAX_BROWSER_LINK) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname;
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/** The link a message hands Chat's browser, only protocol v1's from exactly the console's origin. */
export function consoleBrowserLink(
  message: { readonly origin: string; readonly data: unknown },
  consoleOrigin: string | undefined,
): string | undefined {
  if (consoleOrigin === undefined || message.origin !== consoleOrigin) return undefined;
  const { data } = message;
  if (typeof data !== "object" || data === null) return undefined;
  const { awake, browser } = data as Record<string, unknown>;
  return awake === "chat" && typeof browser === "string" && isBoxLocalLink(browser)
    ? browser
    : undefined;
}

/** How long Chat waits to leave its index before it says it's ready anyway, as with no project. */
export const LANDING_WAIT_MS = 10_000;
const LANDING_POLL_MS = 100;

/**
 * Resolves once Chat has left its index, or after LANDING_WAIT_MS. The index starts a draft in the
 * latest project as Chat loads, and a link handed over meanwhile races that navigation and isn't
 * opened, so Chat tells the console it's ready only after.
 */
export function leftTheIndex(
  pathname: () => string = () => window.location.pathname,
  limitMs = LANDING_WAIT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    let polls = Math.ceil(limitMs / LANDING_POLL_MS);
    const check = () => {
      if (pathname() !== "/" || polls <= 0) {
        resolve();
        return;
      }
      polls -= 1;
      setTimeout(check, LANDING_POLL_MS);
    };
    check();
  });
}

let consoleLinks: DesktopBridge["webLinks"] | null | undefined;

/**
 * The console's links in the desktop bridge's shape, so T3 Code's own link coordinator opens them
 * in its browser as it opens a desktop app's. One for the page, and only embedded in the console.
 */
export function awakeConsoleWebLinks(): DesktopBridge["webLinks"] | undefined {
  if (consoleLinks !== undefined) return consoleLinks ?? undefined;
  consoleLinks = null;
  if (!IS_AWAKE_BRAND || window.parent === window) return undefined;
  const parent = window.parent;
  const consoleOrigin = () =>
    awakeConsoleOriginFrom(appAtomRegistry.get(primaryServerConfigAtom)?.awakeConsoleOrigin);
  consoleLinks = {
    onOpen: (listener) => {
      const receive = (event: MessageEvent) => {
        if (event.source !== parent) return;
        const link = consoleBrowserLink(event, consoleOrigin());
        if (link !== undefined) listener(link);
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    },
    setReady: async (ready) => {
      if (!ready) return;
      await leftTheIndex();
      const origin = consoleOrigin();
      if (origin !== undefined) parent.postMessage(BROWSER_READY_MESSAGE, origin);
    },
  };
  return consoleLinks;
}

/** The box's browser shown alone, at a path of Awake's own, which the console frames. */
export const AWAKE_BROWSER_PATH = "/awake/browser";

/**
 * The thread the workspace's browser keeps its tabs under, which no thread of T3 Code's is, as
 * the Pull requests page keeps its panel. The server keeps a tab by thread and never asks whether
 * the thread exists, and an agent's tools reach only its own thread's tabs.
 */
export const AWAKE_BROWSER_THREAD_ID = ThreadId.make("awake-workspace-browser");

/** A link the console handed the browser alone, numbered so the same address can come again. */
export interface AwakeBrowserLink {
  readonly url: string;
  readonly id: number;
}

/** The browser shown alone: the console's latest link, and word back once it has opened. */
export interface AwakeBrowserAlone {
  readonly link: AwakeBrowserLink | undefined;
  readonly onLinkOpened: (id: number) => void;
}

/** How long a console's link waits to take the open tab before it opens a tab of its own. */
export const AWAKE_LINK_HOLD_MS = 5_000;

/** Whether the console shows the browser's frame, only protocol v1's from exactly its origin. */
export function consoleShownMessage(
  message: { readonly origin: string; readonly data: unknown },
  consoleOrigin: string | undefined,
): boolean | undefined {
  if (consoleOrigin === undefined || message.origin !== consoleOrigin) return undefined;
  const { data } = message;
  if (typeof data !== "object" || data === null) return undefined;
  const { awake, shown } = data as Record<string, unknown>;
  return awake === "chat" && typeof shown === "boolean" ? shown : undefined;
}

interface BrowserPageMessage {
  readonly awake: "chat";
  readonly page: string;
}

/** What the browser alone tells the console it shows: its open tab's origin, or "" for none. */
export function browserPageMessage(url: string | null | undefined): BrowserPageMessage {
  let page = "";
  try {
    const parsed = new URL(url ?? "");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") page = parsed.origin;
  } catch {
    // Not an address: the browser shows no page.
  }
  return { awake: "chat", page };
}

interface ConsoleBrowserPage {
  readonly onShown: (listener: (shown: boolean) => void) => () => void;
  readonly reportPage: (url: string | null | undefined) => void;
}

let consoleBrowserPage: ConsoleBrowserPage | null | undefined;

/**
 * Protocol v1 for the browser alone, only where the console frames it: whether the console shows
 * the frame, and what the browser shows, a word only this page sends. One for the page.
 */
export function awakeConsoleBrowserPage(): ConsoleBrowserPage | undefined {
  if (consoleBrowserPage !== undefined) return consoleBrowserPage ?? undefined;
  consoleBrowserPage = null;
  if (!IS_AWAKE_BRAND || window.parent === window) return undefined;
  const parent = window.parent;
  const consoleOrigin = () =>
    awakeConsoleOriginFrom(appAtomRegistry.get(primaryServerConfigAtom)?.awakeConsoleOrigin);
  let reported: string | undefined;
  consoleBrowserPage = {
    onShown: (listener) => {
      const receive = (event: MessageEvent) => {
        if (event.source !== parent) return;
        const shown = consoleShownMessage(event, consoleOrigin());
        if (shown !== undefined) listener(shown);
      };
      window.addEventListener("message", receive);
      return () => window.removeEventListener("message", receive);
    },
    reportPage: (url) => {
      const origin = consoleOrigin();
      const message = browserPageMessage(url);
      if (origin === undefined || message.page === reported) return;
      reported = message.page;
      parent.postMessage(message, origin);
    },
  };
  return consoleBrowserPage;
}

/** Whether an answer from the box's host is the gateway ending this session. */
export function isSessionEndedAnswer(status: number, body: string): boolean {
  return status === 401 && body.includes("stream.session_ended");
}

/** The console's theme applies only while the appearance setting is Match Awake. */
function applyConsoleTheme(theme: ConsoleTheme): void {
  try {
    if (readThemePreference() === MATCH_AWAKE_THEME_ID) setAppearanceMode(theme);
  } catch {
    // Storage the browser refuses leaves the appearance as it is.
  }
}

async function sessionEnded(): Promise<boolean> {
  try {
    const answer = await fetch("/", { credentials: "same-origin", cache: "no-store" });
    return isSessionEndedAnswer(answer.status, await answer.text());
  } catch {
    return false;
  }
}

/**
 * Protocol v1 with Awake's console, in Awake's build: the boot fragment's theme, the console's
 * theme messages while embedded, and word to the console when the gateway ends the session.
 * The console's origin comes from the server; without a valid one, nothing is taken or posted.
 */
export function startAwakeConsoleBridge(): void {
  if (!IS_AWAKE_BRAND) return;
  const boot = takeBootTheme(window.location.hash);
  if (boot.hash !== window.location.hash) {
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", `${pathname}${search}${boot.hash}`);
  }
  // The box's default theme can land after boot, so the console's theme waits for it.
  let latestTheme = boot.theme;
  const apply = () => {
    if (latestTheme !== undefined) applyConsoleTheme(latestTheme);
  };
  apply();
  appAtomRegistry.subscribe(primaryServerSettingsAtom, apply);

  const parent = window.parent;
  if (parent === window) return;
  // Only the console frames Chat, as the gateway's frame-ancestors allow, and its sheet is the
  // page's ground, so Match Awake's header takes that ground here (Awake's FDD-0053 §16).
  document.documentElement.setAttribute(FRAMED_ATTRIBUTE, "");
  const consoleOrigin = () =>
    awakeConsoleOriginFrom(appAtomRegistry.get(primaryServerConfigAtom)?.awakeConsoleOrigin);
  window.addEventListener("message", (event) => {
    if (event.source !== parent) return;
    const theme = consoleThemeMessage(event, consoleOrigin());
    if (theme === undefined) return;
    latestTheme = theme;
    apply();
  });

  let reported = false;
  let connected = false;
  let unwatch = () => {};
  const reportIfEnded = () => {
    void sessionEnded().then((ended) => {
      const origin = consoleOrigin();
      if (!ended || reported || origin === undefined) return;
      reported = true;
      parent.postMessage(SESSION_ENDED_MESSAGE, origin);
    });
  };
  const watch = (environmentId: EnvironmentId | null) => {
    unwatch();
    connected = false;
    if (environmentId === null) return;
    unwatch = appAtomRegistry.subscribe(
      environmentPresentations.presentationAtom(environmentId),
      (presentation) => {
        const now = presentation?.connection.phase === "connected";
        if (connected && !now && !reported) reportIfEnded();
        connected = now;
      },
      { immediate: true },
    );
  };
  appAtomRegistry.subscribe(primaryEnvironmentIdAtom, watch, { immediate: true });
}
