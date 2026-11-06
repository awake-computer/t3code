// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite config runs before any Effect runtime.
import * as NodeFS from "node:fs";

import type { Plugin } from "vite-plus";

/** Another name and mark for the app, set at build time by T3CODE_BRAND. Awake's build sets one. */
export type AppBrand = "awake";

export function resolveAppBrand(value: string | undefined): AppBrand | undefined {
  const brand = value?.trim().toLowerCase() ?? "";
  if (brand === "") return undefined;
  if (brand === "awake") return brand;
  throw new Error(`T3CODE_BRAND must be "awake" or unset, got "${value}".`);
}

// Awake's Paper and Soft dark grounds, from its design tokens.
const AWAKE_LIGHT = "#f5f4f2";
const AWAKE_DARK = "#262626";

function awakeReplacements(): ReadonlyArray<readonly [string, string]> {
  const mark = NodeFS.readFileSync(
    new URL("../../../assets/awake/awake-mark.svg", import.meta.url),
    "utf8",
  ).trim();
  const markUrl = `data:image/svg+xml,${encodeURIComponent(mark)}`;
  return [
    ["<title>T3 Code (Beta)</title>", "<title>Awake Chat</title>"],
    ['aria-label="T3 Code splash screen"', 'aria-label="Awake Chat splash screen"'],
    ['src="/apple-touch-icon.png" alt="T3 Code"', `src="${markUrl}" alt="Awake Chat"`],
    [
      '<meta name="theme-color" content="#000000" />',
      `<meta name="theme-color" content="${AWAKE_LIGHT}" />`,
    ],
    ['const LIGHT_BACKGROUND = "#ffffff";', `const LIGHT_BACKGROUND = "${AWAKE_LIGHT}";`],
    ['const DARK_BACKGROUND = "#000000";', `const DARK_BACKGROUND = "${AWAKE_DARK}";`],
    ['background: "#ffffff",', `background: "${AWAKE_LIGHT}",`],
    ['background: "#000000",', `background: "${AWAKE_DARK}",`],
    ["background: #ffffff;", `background: ${AWAKE_LIGHT};`],
    ["background: #000000;", `background: ${AWAKE_DARK};`],
    ["--boot-error-bg: #ffffff;", `--boot-error-bg: ${AWAKE_LIGHT};`],
    ["--boot-error-bg: #000000;", `--boot-error-bg: ${AWAKE_DARK};`],
  ];
}

/** Awake's name, mark and grounds on the page shown before the app mounts. */
export function brandIndexHtml(html: string): string {
  let branded = html;
  for (const [from, to] of awakeReplacements()) {
    // Exactly once each, so a changed index.html fails the build rather than ship half branded.
    if (branded.split(from).length !== 2) {
      throw new Error(`brand-html: index.html should hold ${JSON.stringify(from)} once.`);
    }
    branded = branded.replace(from, () => to);
  }
  return branded;
}

export function brandHtmlPlugin(brand: AppBrand | undefined): Plugin | undefined {
  if (brand === undefined) return undefined;
  return {
    name: "t3code:brand-html",
    transformIndexHtml: { order: "pre", handler: brandIndexHtml },
  };
}
