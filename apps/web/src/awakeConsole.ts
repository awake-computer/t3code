import { awakeConsoleOriginFrom, type EnvironmentId } from "@t3tools/contracts";

import { IS_AWAKE_BRAND, MATCH_AWAKE_THEME_ID } from "./branding";
import { readThemePreference, setAppearanceMode } from "./hooks/useTheme";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { primaryEnvironmentIdAtom } from "./state/primaryEnvironment";
import { environmentPresentations } from "./state/presentation";
import { primaryServerConfigAtom, primaryServerSettingsAtom } from "./state/server";

export type ConsoleTheme = "light" | "dark" | "system";

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
