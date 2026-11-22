import { describe, expect, it, vi } from "vite-plus/test";

import {
  AWAKE_BOX_PATH,
  AWAKE_READS_APART_MS,
  AWAKE_WAKE_PATIENCE_MS,
  type AwakeBoxState,
  awakeBoxBanner,
  elapsed,
  fetchAwakeBoxState,
  nextAwakeBoxState,
  readAwakeBoxState,
} from "./awakeBoxState";

const consoleOrigin = "https://app.awake.computer";
const open = `${consoleOrigin}/chat?box=box_01kafy3xz1fbr8gq8mws8b8hbf`;
const readAt = Date.parse("2026-11-22T09:00:34Z");
const box = (
  state: AwakeBoxState["state"],
  more: Partial<Pick<AwakeBoxState, "asked" | "wakes" | "wakingSince">> = {},
): AwakeBoxState => ({
  state,
  asked: null,
  wakes: false,
  open,
  readAt,
  wakingSince: state === "waking" ? readAt : null,
  ...more,
});

describe("what Awake's gateway observes of the box", () => {
  it("reads the gateway's answer in its shape", () => {
    const answer = { state: "asleep", asked: "2026-11-22T09:00:30Z", wakes: true, open };
    const asked = Date.parse("2026-11-22T09:00:30Z");
    expect(readAwakeBoxState(answer, consoleOrigin, readAt)).toEqual(
      box("asleep", { asked, wakes: true }),
    );
    const noTime = readAwakeBoxState({ ...answer, asked: "yesterday" }, consoleOrigin, readAt);
    expect(noTime?.asked).toBeNull();
    const waking = { state: "waking", wakes: false, open };
    expect(readAwakeBoxState(waking, consoleOrigin, readAt)).toEqual(box("waking"));
  });

  it("keeps when it first saw the box waking, across reads close together", () => {
    const first = box("waking", { wakingSince: readAt - 30_000 });
    const later = { ...box("waking"), readAt: readAt + 2_000, wakingSince: readAt + 2_000 };
    expect(nextAwakeBoxState(first, later)?.wakingSince).toBe(readAt - 30_000);
    const apart = { ...later, readAt: readAt + AWAKE_READS_APART_MS + 1 };
    expect(nextAwakeBoxState(first, apart)?.wakingSince).toBe(later.wakingSince);
    expect(nextAwakeBoxState(first, box("running"))?.wakingSince).toBeNull();
    expect(nextAwakeBoxState(first, null)).toBeNull();
    expect(nextAwakeBoxState(null, later)).toBe(later);
  });

  it("refuses an answer of any other shape", () => {
    const bodies = [null, [], "waking", { state: "sleeping", wakes: false }, { state: "asleep" }];
    for (const body of bodies) {
      expect(readAwakeBoxState(body, consoleOrigin, readAt)).toBeNull();
    }
  });

  it("links back only to exactly the console's origin", () => {
    const at = (link: unknown, origin: string | undefined) =>
      readAwakeBoxState({ state: "stopped", wakes: false, open: link }, origin, readAt)?.open;
    expect(at(open, consoleOrigin)).toBe(open);
    expect(at("https://app.awake.computer.evil.test/chat", consoleOrigin)).toBeNull();
    expect(at("javascript:alert(1)", consoleOrigin)).toBeNull();
    expect(at(42, consoleOrigin)).toBeNull();
    expect(at(open, undefined)).toBeNull();
  });

  it("asks the gateway's own path, and takes no answer but its own", async () => {
    const answer = JSON.stringify({ state: "asleep", wakes: true, open });
    const answered = vi.fn(async () => new Response(answer));
    const got = await fetchAwakeBoxState(consoleOrigin, answered as unknown as typeof fetch);
    expect(got?.state).toBe("asleep");
    expect(answered).toHaveBeenCalledWith(AWAKE_BOX_PATH, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const refused = async () => new Response("<html>", { status: 403 });
    expect(await fetchAwakeBoxState(consoleOrigin, refused as unknown as typeof fetch)).toBeNull();
    const failing = async () => Promise.reject(new TypeError("offline"));
    expect(await fetchAwakeBoxState(consoleOrigin, failing as unknown as typeof fetch)).toBeNull();
  });
});

describe("the banner's words", () => {
  it("says the box is waking only when the gateway does, and how long this page saw it", () => {
    expect(awakeBoxBanner(box("waking", { wakingSince: readAt - 34_000 }), "maya-chen")).toEqual({
      title: "Waking maya-chen…",
      description: "Waking for 34 s. Chat reconnects once it's awake.",
      waiting: true,
    });
    for (const more of [{ wakes: true }, { asked: readAt - 4_000 }]) {
      expect(awakeBoxBanner(box("asleep", more), "maya-chen")?.title).toBe("maya-chen is asleep");
    }
  });

  it("says a box asleep was asked to wake, and when, while Chat waits", () => {
    expect(awakeBoxBanner(box("asleep", { asked: readAt - 4_000 }), "maya-chen")).toEqual({
      title: "maya-chen is asleep",
      description: "Asked Awake to wake it 4 s ago.",
      waiting: true,
    });
    expect(awakeBoxBanner(box("asleep", { wakes: true }), "maya-chen")).toEqual({
      title: "maya-chen is asleep",
      description: "Chat asks Awake to wake it as it reconnects.",
      waiting: true,
    });
  });

  it("says a box asked to wake a minute ago and still asleep didn't start waking", () => {
    const late = box("asleep", { asked: readAt - AWAKE_WAKE_PATIENCE_MS, wakes: true });
    expect(awakeBoxBanner(late, "maya-chen")).toEqual({
      title: "maya-chen didn't start waking",
      description: "Open it from Awake to see why.",
      waiting: false,
    });
  });

  it("sends the member to Awake for a box Chat can't wake", () => {
    for (const state of ["asleep", "stopped", "held", "failed", "moved", "gone"] as const) {
      const words = awakeBoxBanner(box(state), "maya-chen");
      expect(words?.waiting).toBe(false);
      expect(words?.title).toContain("maya-chen");
      expect(words?.description).toMatch(/Awake/);
    }
  });

  it("keeps T3 Code's own words for a box that runs, and for no answer", () => {
    expect(awakeBoxBanner(box("running"), "maya-chen")).toBeNull();
    expect(awakeBoxBanner(null, "maya-chen")).toBeNull();
  });

  it("says a wait in seconds, then minutes, then hours", () => {
    expect(elapsed(-5_000)).toBe("0 s");
    expect(elapsed(59_000)).toBe("59 s");
    expect(elapsed(90_000)).toBe("2 min");
    expect(elapsed(59 * 60_000)).toBe("59 min");
    expect(elapsed(60 * 60_000)).toBe("1 h");
    expect(elapsed(65 * 60_000)).toBe("1 h 5 min");
  });
});
