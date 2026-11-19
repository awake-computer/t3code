// @effect-diagnostics nodeBuiltinImport:off - Read at each launch, outside the Effect runtime.
import * as NodeFS from "node:fs";

/**
 * Awake: names a file whose first line names the browser's own proxy. A host may write, change and
 * remove it while T3 runs: it's read at each launch and nothing of it is kept, so the browser
 * follows the file where T3's environment, read once at its start, couldn't.
 */
export const PROXY_FILE_VARIABLE = "T3CODE_SERVER_BROWSER_PROXY_FILE";

// A link to nothing has the file's name, so the file isn't missing: it's one that can't be read.
const named = (path: string) => {
  try {
    return NodeFS.lstatSync(path, { throwIfNoEntry: false }) !== undefined;
  } catch {
    return true;
  }
};

// The file's text: undefined where nothing has its name, null where what has it can't be read.
const read = (path: string) => {
  try {
    // Asked first: reading a FIFO would wait for its writer, and hold the server with it.
    return NodeFS.statSync(path).isFile() ? NodeFS.readFileSync(path, "utf8") : null;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === "ENOENT" && !named(path) ? undefined : null;
  }
};

const isHttpUrl = (line: string) => {
  if (!line.startsWith("http://") || /\s/.test(line)) return false;
  try {
    return new URL(line).hostname !== "";
  } catch {
    return false;
  }
};

const refusal = (path: string, why: string) =>
  new Error(`${PROXY_FILE_VARIABLE} names ${path}, ${why}. No other proxy is taken in its place.`);

/**
 * The proxy the file's first line names, an http:// URL. None where the variable names no file, or
 * the file isn't there or is blank: the host has named no proxy of the browser's own. A file that
 * can't be read, or a line that's no such URL, throws: the host named a proxy there, and no other
 * is taken in its place.
 */
export const proxyFromFile = (env: Readonly<Record<string, string | undefined>>) => {
  const path = env[PROXY_FILE_VARIABLE]?.trim();
  if (!path) return undefined;
  const text = read(path);
  if (text === undefined) return undefined;
  if (text === null) throw refusal(path, "which can't be read");
  const line = text.split("\n", 1)[0]?.trim() ?? "";
  if (line === "") return undefined;
  if (!isHttpUrl(line)) throw refusal(path, "whose first line isn't an http:// URL");
  return line;
};
