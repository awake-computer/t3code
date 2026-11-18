import { describe, expect, it } from "@effect/vitest";

import { externalizeBootScript } from "./awake-boot-script.ts";

const page = (head: string) =>
  `<!doctype html>\n<html>\n  <head>\n${head}  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" crossorigin src="/assets/index-abc.js"></script>\n  </body>\n</html>\n`;

describe("externalizeBootScript", () => {
  it("moves the page's one inline script into a file named by its digest", () => {
    const body = '\n      document.documentElement.classList.add("dark");\n    ';
    const built = externalizeBootScript(page(`    <script>${body}</script>\n`));
    expect(built.source).toBe(body);
    expect(built.fileName).toMatch(/^assets\/awake-boot-[0-9a-f]{16}\.js$/);
    expect(built.html).toContain(`    <script src="/${built.fileName}"></script>\n`);
    expect(built.html).not.toContain("<script>");
    // The app's own module script is untouched.
    expect(built.html).toContain('<script type="module" crossorigin src="/assets/index-abc.js">');
    // Another script is another file.
    const other = externalizeBootScript(page("    <script>void 0;</script>\n"));
    expect(other.fileName).not.toBe(built.fileName);
  });

  it("leaves a page with no inline script as it is", () => {
    const html = page("");
    expect(externalizeBootScript(html)).toEqual({ html, fileName: undefined, source: "" });
    const once = externalizeBootScript(page("    <script>void 0;</script>\n"));
    expect(externalizeBootScript(once.html).html).toBe(once.html);
  });

  it("refuses a page with a second inline script, which no file here stands for", () => {
    const head = "    <script>void 0;</script>\n    <script>void 1;</script>\n";
    expect(() => externalizeBootScript(page(head))).toThrow(/one inline script, not 2/);
  });
});
