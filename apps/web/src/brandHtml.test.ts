// @effect-diagnostics nodeBuiltinImport:off - reads the real index.html from disk.
import * as NodeFSP from "node:fs/promises";

import { describe, expect, it } from "vite-plus/test";

import { brandHtmlPlugin, brandIndexHtml, resolveAppBrand } from "../vite/brandHtml";

describe("brandIndexHtml", () => {
  it("puts Awake's name, mark and grounds on the page before the app mounts", async () => {
    const html = await NodeFSP.readFile(new URL("../index.html", import.meta.url), "utf8");
    const branded = brandIndexHtml(html);
    expect(branded).toContain("<title>Awake Code</title>");
    expect(branded).toContain('alt="Awake Code"');
    expect(branded).toContain('src="data:image/svg+xml,');
    expect(branded).toContain('const LIGHT_BACKGROUND = "#f5f4f2";');
    expect(branded).toContain('const DARK_BACKGROUND = "#262626";');
    expect(branded).not.toContain("T3 Code");
    expect(branded).not.toContain("#ffffff");
  });

  it("refuses a page it cannot brand whole", () => {
    expect(() => brandIndexHtml("<title>T3 Code (Beta)</title>")).toThrow(/index.html should hold/);
  });
});

describe("resolveAppBrand", () => {
  it("builds T3 Code unless the build names Awake, and refuses any other brand", () => {
    expect(resolveAppBrand(undefined)).toBeUndefined();
    expect(resolveAppBrand(" ")).toBeUndefined();
    expect(brandHtmlPlugin(resolveAppBrand(undefined))).toBeUndefined();
    expect(resolveAppBrand("awake")).toBe("awake");
    expect(() => resolveAppBrand("acme")).toThrow(/T3CODE_BRAND/);
  });
});
