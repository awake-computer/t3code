// @effect-diagnostics nodeBuiltinImport:off - a digest names the file; no Effect runtime runs here.
import * as NodeCrypto from "node:crypto";

/** A page whose inline script has moved to a file of its own, and that file. */
export interface ExternalizedBootScript {
  readonly html: string;
  /** The script's file, relative to the page's directory; undefined when the page had none. */
  readonly fileName: string | undefined;
  readonly source: string;
}

const INLINE_SCRIPT = /<script>([\s\S]*?)<\/script>/g;

/**
 * Moves a built page's one inline script into a file named by its digest. Awake's gateway takes an
 * inline script by one hash for a whole cell, where older and newer builds run side by side, so
 * the page that needs no hash is one with no inline script.
 */
export function externalizeBootScript(html: string): ExternalizedBootScript {
  const scripts = [...html.matchAll(INLINE_SCRIPT)];
  // Applied twice, the second pass finds the page already done.
  if (scripts.length === 0) return { html, fileName: undefined, source: "" };
  if (scripts.length !== 1) {
    throw new Error(`The page should hold one inline script, not ${scripts.length}.`);
  }
  const [element, source = ""] = scripts[0]!;
  const digest = NodeCrypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
  const fileName = `assets/awake-boot-${digest}.js`;
  return {
    html: html.replace(element, () => `<script src="/${fileName}"></script>`),
    fileName,
    source,
  };
}
