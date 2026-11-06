import { describe, expect, it } from "vite-plus/test";

import { awakeConsoleOriginFrom } from "./server.ts";

describe("awakeConsoleOriginFrom", () => {
  it("takes exactly an https origin, or http on this machine", () => {
    for (const origin of [
      "https://app.awake.computer",
      "https://app.awake.computer:8443",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://app.awake.localhost",
    ]) {
      expect(awakeConsoleOriginFrom(origin)).toBe(origin);
    }
  });

  it("refuses anything else, so Chat posts nothing and takes no message", () => {
    for (const value of [
      undefined,
      "",
      "*",
      "null",
      "app.awake.computer",
      "https://app.awake.computer/",
      "https://app.awake.computer/console",
      "https://user@app.awake.computer",
      "HTTPS://APP.AWAKE.COMPUTER",
      "http://app.awake.computer",
      42,
    ]) {
      expect(awakeConsoleOriginFrom(value)).toBeUndefined();
    }
  });
});
