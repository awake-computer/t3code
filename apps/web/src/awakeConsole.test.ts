import { describe, expect, it } from "vite-plus/test";

import {
  consoleThemeMessage,
  isSessionEndedAnswer,
  SESSION_ENDED_MESSAGE,
  takeBootTheme,
} from "./awakeConsole";

const consoleOrigin = "https://app.awake.computer";
const themeFrom = (origin: string, data: unknown, allowed: string | undefined = consoleOrigin) =>
  consoleThemeMessage({ origin, data }, allowed);

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
    expect(themeFrom(consoleOrigin, v1, undefined)).toBeUndefined();
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
});
