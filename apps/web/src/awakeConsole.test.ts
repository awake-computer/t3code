import { describe, expect, it, vi } from "vite-plus/test";

import {
  BROWSER_READY_MESSAGE,
  consoleBrowserLink,
  consoleThemeMessage,
  isBoxLocalLink,
  isSessionEndedAnswer,
  LANDING_WAIT_MS,
  leftTheIndex,
  SESSION_ENDED_MESSAGE,
  takeBootTheme,
} from "./awakeConsole";

const consoleOrigin = "https://app.awake.computer";
const themeFrom = (origin: string, data: unknown) =>
  consoleThemeMessage({ origin, data }, consoleOrigin);

describe("protocol v1 with Awake's console", () => {
  it("takes the boot theme from the fragment and leaves the rest of it", () => {
    expect(takeBootTheme("#awake-theme=dark")).toEqual({ theme: "dark", hash: "" });
    expect(takeBootTheme("#awake-theme=system&x=1")).toEqual({ theme: "system", hash: "#x=1" });
    expect(takeBootTheme("#awake-theme=sepia")).toEqual({ theme: undefined, hash: "" });
    expect(takeBootTheme("#section")).toEqual({ theme: undefined, hash: "#section" });
    expect(takeBootTheme("")).toEqual({ theme: undefined, hash: "" });
  });

  it("takes a theme only from exactly the console's origin, in v1's shape", () => {
    const v1 = { awake: "chat", theme: "light" };
    expect(themeFrom(consoleOrigin, v1)).toBe("light");
    expect(themeFrom("https://other.example", v1)).toBeUndefined();
    expect(themeFrom(`${consoleOrigin}.other.example`, v1)).toBeUndefined();
    expect(themeFrom("http://app.awake.computer", v1)).toBeUndefined();
    // With no console origin from the server, no message counts.
    expect(consoleThemeMessage({ origin: consoleOrigin, data: v1 }, undefined)).toBeUndefined();
    expect(themeFrom(consoleOrigin, { awake: "chat", theme: "sepia" })).toBeUndefined();
    expect(themeFrom(consoleOrigin, { theme: "dark" })).toBeUndefined();
    expect(themeFrom(consoleOrigin, "dark")).toBeUndefined();
  });

  it("knows the gateway's end of the session, and reports it in v1's shape", () => {
    expect(isSessionEndedAnswer(401, '{"code":"stream.session_ended"}')).toBe(true);
    expect(isSessionEndedAnswer(403, '{"code":"stream.not_allowed"}')).toBe(false);
    expect(isSessionEndedAnswer(200, "stream.session_ended")).toBe(false);
    expect(SESSION_ENDED_MESSAGE).toEqual({
      awake: "chat",
      state: "failed",
      code: "stream.session_ended",
    });
  });

  it("takes a link for its browser only to the box's own addresses, from exactly the console", () => {
    const link = (origin: string, data: unknown) =>
      consoleBrowserLink({ origin, data }, consoleOrigin);
    for (const url of [
      "http://localhost:5173/",
      "https://localhost:8443/checkout?step=2#pay",
      "http://app.localhost:3000/",
      "http://127.0.0.1:8080/",
      "http://127.1.2.3/",
      "http://[::1]:4000/",
    ]) {
      expect(isBoxLocalLink(url)).toBe(true);
      expect(link(consoleOrigin, { awake: "chat", browser: url })).toBe(url);
    }
    for (const url of [
      "http://0.0.0.0:3000/",
      "http://10.0.0.5:3000/",
      "https://example.com/",
      "http://localhost.example.com/",
      "http://user:secret@localhost:5173/",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "localhost:5173",
      `http://localhost/${"x".repeat(2048)}`,
    ]) {
      expect(isBoxLocalLink(url)).toBe(false);
      expect(link(consoleOrigin, { awake: "chat", browser: url })).toBeUndefined();
    }
    const v1 = { awake: "chat", browser: "http://localhost:5173/" };
    expect(link("https://other.example", v1)).toBeUndefined();
    expect(link(consoleOrigin, { browser: "http://localhost:5173/" })).toBeUndefined();
    expect(consoleBrowserLink({ origin: consoleOrigin, data: v1 }, undefined)).toBeUndefined();
    expect(link(consoleOrigin, BROWSER_READY_MESSAGE)).toBeUndefined();
    expect(BROWSER_READY_MESSAGE).toEqual({ awake: "chat", browser: "ready" });
  });

  it("says it's ready for a link once it has left its index, or after its wait", async () => {
    vi.useFakeTimers();
    try {
      const settled = (pathname: () => string) => {
        const state = { done: false };
        void leftTheIndex(pathname).then(() => {
          state.done = true;
        });
        return state;
      };
      let path = "/";
      const landing = settled(() => path);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(landing.done).toBe(false);
      path = "/draft/d1";
      await vi.advanceTimersByTimeAsync(100);
      expect(landing.done).toBe(true);

      const onAThread = settled(() => "/env/thread");
      await vi.advanceTimersByTimeAsync(0);
      expect(onAThread.done).toBe(true);

      const stuck = settled(() => "/");
      await vi.advanceTimersByTimeAsync(LANDING_WAIT_MS - 200);
      expect(stuck.done).toBe(false);
      await vi.advanceTimersByTimeAsync(300);
      expect(stuck.done).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
