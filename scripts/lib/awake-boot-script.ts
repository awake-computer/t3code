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
 * Moves a built page's one inline script into a file of its own, named by its digest.
 *
 * Awake's gateway serves Awake Chat under a content policy that takes scripts from the page's own
 * host, and an inline one only by a hash it holds for a whole cell. Boxes on an older and a newer
 * build run side by side there, each with its own inline script, so no one hash serves both. A
 * page with no inline script needs none, on any build that follows.
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
