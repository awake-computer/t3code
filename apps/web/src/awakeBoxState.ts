/**
 * What Awake's gateway observes of the box under Chat while Chat reconnects: its own path,
 * `/__awake/box`, answers the cell's record of the box, never a guess. The composer's banner
 * says it.
 */

/** A box's state as the gateway names it. */
export type AwakeBoxStateName =
  | "running"
  | "waking"
  | "asleep"
  | "stopped"
  | "held"
  | "failed"
  | "moved"
  | "gone";

const STATE_NAMES: ReadonlySet<string> = new Set<AwakeBoxStateName>([
  "running",
  "waking",
  "asleep",
  "stopped",
  "held",
  "failed",
  "moved",
  "gone",
]);

export interface AwakeBoxState {
  readonly state: AwakeBoxStateName;
  /** When a tab last asked Awake to wake the box asleep, since it went to sleep, or null. */
  readonly asked: number | null;
  /** Whether this tab's reconnect asks Awake to wake the box. */
  readonly wakes: boolean;
  /** The console's way into Chat for the box, only at exactly the console's origin, or null. */
  readonly open: string | null;
  /** When Chat read it, in milliseconds since the epoch. */
  readonly readAt: number;
  /** When this page first saw the box waking, through every read since, or null. */
  readonly wakingSince: number | null;
}

/** The gateway's own path that answers it. */
export const AWAKE_BOX_PATH = "/__awake/box";

/** How long after an ask a box still asleep is said not to have started waking. */
export const AWAKE_WAKE_PATIENCE_MS = 60_000;

/** The gateway's answer read at readAt, or null for an answer not of its shape. */
export function readAwakeBoxState(
  body: unknown,
  consoleOrigin: string | undefined,
  readAt: number,
): AwakeBoxState | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const { state, asked, wakes, open } = body as Record<string, unknown>;
  if (typeof state !== "string" || !STATE_NAMES.has(state) || typeof wakes !== "boolean") {
    return null;
  }
  const at = typeof asked === "string" ? Date.parse(asked) : Number.NaN;
  return {
    state: state as AwakeBoxStateName,
    asked: Number.isFinite(at) ? at : null,
    wakes,
    open: consoleLink(open, consoleOrigin),
    readAt,
    wakingSince: state === "waking" ? readAt : null,
  };
}

/** How far apart two reads may be for the second to keep when the first saw the box waking. */
export const AWAKE_READS_APART_MS = 10_000;

/**
 * next, keeping when prev first saw the box waking while it still is, if prev was read within
 * AWAKE_READS_APART_MS: an older read is another reconnect's, or a hidden tab's.
 */
export function nextAwakeBoxState(
  prev: AwakeBoxState | null,
  next: AwakeBoxState | null,
): AwakeBoxState | null {
  if (next?.state !== "waking" || prev?.wakingSince == null) return next;
  if (next.readAt - prev.readAt > AWAKE_READS_APART_MS) return next;
  return { ...next, wakingSince: prev.wakingSince };
}

/** open, only when it's a link at exactly the console's origin. */
function consoleLink(open: unknown, consoleOrigin: string | undefined): string | null {
  if (typeof open !== "string" || consoleOrigin === undefined) return null;
  try {
    return new URL(open).origin === consoleOrigin ? open : null;
  } catch {
    return null;
  }
}

/** Asks the gateway what it observes of the box; null when it answers no state. */
export async function fetchAwakeBoxState(
  consoleOrigin: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<AwakeBoxState | null> {
  try {
    const answer = await fetcher(AWAKE_BOX_PATH, { credentials: "same-origin", cache: "no-store" });
    if (!answer.ok) return null;
    return readAwakeBoxState(await answer.json(), consoleOrigin, Date.now());
  } catch {
    return null;
  }
}

/** The composer banner's words for a box that doesn't run. */
export interface AwakeBoxBanner {
  readonly title: string;
  readonly description: string;
  /** Whether Chat waits for the box, rather than sending the member to Awake. */
  readonly waiting: boolean;
}

/**
 * The banner's words for box, named label, from what Awake's gateway observes alone; none for no
 * box, or one running: T3's own words.
 */
export function awakeBoxBanner(box: AwakeBoxState | null, label: string): AwakeBoxBanner | null {
  if (box === null) return null;
  switch (box.state) {
    case "running":
      return null;
    case "waking": {
      const since = box.wakingSince === null ? null : elapsed(box.readAt - box.wakingSince);
      return words(
        `Waking ${label}…`,
        `${since === null ? "" : `Waking for ${since}. `}Chat reconnects once it's awake.`,
        true,
      );
    }
    case "asleep":
      return asleepWords(box, label);
    case "stopped":
      return words(`${label} is stopped`, "Hibernated on purpose. Open it from Awake.", false);
    case "held":
      return words(`${label} is on hold`, "Your org's admin holds it. Awake says why.", false);
    case "failed":
      return words(`${label} didn't start`, "Open it from Awake, which tries again.", false);
    case "moved":
      return words(`${label} moved`, "Its address changed. Open Chat again from Awake.", false);
    case "gone":
      return words(`${label} isn't there`, "Open Awake to see your boxes.", false);
  }
}

/** A box asleep: asked to wake, and how long ago; past AWAKE_WAKE_PATIENCE_MS, not waking. */
function asleepWords(box: AwakeBoxState, label: string): AwakeBoxBanner {
  if (box.asked !== null) {
    const ago = box.readAt - box.asked;
    if (ago >= AWAKE_WAKE_PATIENCE_MS) {
      return words(`${label} didn't start waking`, "Open it from Awake to see why.", false);
    }
    return words(`${label} is asleep`, `Asked Awake to wake it ${elapsed(ago)} ago.`, true);
  }
  if (box.wakes) {
    return words(`${label} is asleep`, "Chat asks Awake to wake it as it reconnects.", true);
  }
  return words(`${label} is asleep`, "Open it from Awake, which wakes it.", false);
}

function words(title: string, description: string, waiting: boolean): AwakeBoxBanner {
  return { title, description, waiting };
}

/** A duration as the banner says it: seconds, then minutes, then hours and minutes. */
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Where the banner's link opens: this tab, or from the console's frame, which can't, a new one. */
export function awakeLinkTarget(): "_self" | "_blank" {
  return typeof window !== "undefined" && window.parent !== window ? "_blank" : "_self";
}
