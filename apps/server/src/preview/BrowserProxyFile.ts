// @effect-diagnostics nodeBuiltinImport:off - Read at each launch, outside the Effect runtime.
import * as NodeFS from "node:fs";

/**
 * Awake: names a file whose first line names the browser's own proxy. A host may write, change and
 * remove it while T3 runs: it's read at each launch and nothing of it is kept, so the browser
 * follows the file where T3's environment, read once at its start, couldn't.
 */
export const PROXY_FILE_VARIABLE = "T3CODE_SERVER_BROWSER_PROXY_FILE";

const read = (path: string) => {
  try {
    return NodeFS.readFileSync(path, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`${PROXY_FILE_VARIABLE} names ${path}, which can't be read.`, { cause });
  }
};

/**
 * The proxy the file names. None where the variable names no file, or the file isn't there or is
 * blank: the host has named no proxy of the browser's own. A file that's there and can't be read
 * throws, so that no other proxy is taken in the place of the one the host named.
 */
export const proxyFromFile = (env: Readonly<Record<string, string | undefined>>) => {
  const path = env[PROXY_FILE_VARIABLE]?.trim();
  if (!path) return undefined;
  return read(path)?.split("\n", 1)[0]?.trim() || undefined;
};
