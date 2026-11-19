// @effect-diagnostics nodeBuiltinImport:off - The file is a real one, as a host writes it.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { PROXY_FILE_VARIABLE, proxyFromFile } from "./BrowserProxyFile.ts";
import { browserProxy } from "./PreviewBrowserHost.ts";

const MAIN = "http://egress.awake:3128";
const OWN = "http://egress.awake:3130";
const LOOPBACK = "localhost,127.0.0.1,[::1],*.localhost";

let directory = "";
let file = "";

beforeEach(() => {
  directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-browser-proxy-file-test-"));
  file = NodePath.join(directory, "proxy");
});

afterEach(() => {
  NodeFS.rmSync(directory, { recursive: true, force: true });
});

describe("proxyFromFile", () => {
  it("is named by the variable a host's image sets", () => {
    expect(PROXY_FILE_VARIABLE).toBe("T3CODE_SERVER_BROWSER_PROXY_FILE");
  });

  it("names no proxy where the variable names no file", () => {
    expect(proxyFromFile({})).toBeUndefined();
    expect(proxyFromFile({ [PROXY_FILE_VARIABLE]: "  " })).toBeUndefined();
  });

  it("names no proxy for a file that isn't there, or is blank", () => {
    const env = { [PROXY_FILE_VARIABLE]: file };
    expect(proxyFromFile(env)).toBeUndefined();
    const below = NodePath.join(directory, "gone", "proxy");
    expect(proxyFromFile({ [PROXY_FILE_VARIABLE]: below })).toBeUndefined();
    for (const blank of ["", "\n", "  \t\n\n", `\n${OWN}\n`]) {
      NodeFS.writeFileSync(file, blank);
      expect(proxyFromFile(env)).toBeUndefined();
    }
  });

  it("takes the proxy on the file's first line, and no more of the file", () => {
    const env = { [PROXY_FILE_VARIABLE]: ` ${file} ` };
    for (const text of [OWN, `${OWN}\n`, `  ${OWN} \r\n`, `${OWN}\n${MAIN}\n`]) {
      NodeFS.writeFileSync(file, text);
      expect(proxyFromFile(env)).toBe(OWN);
    }
  });

  it("follows the file as it appears, changes and goes, keeping nothing between reads", () => {
    const env = { [PROXY_FILE_VARIABLE]: file };
    expect(proxyFromFile(env)).toBeUndefined();
    NodeFS.writeFileSync(file, `${OWN}\n`);
    expect(proxyFromFile(env)).toBe(OWN);
    NodeFS.writeFileSync(file, `${MAIN}\n`);
    expect(proxyFromFile(env)).toBe(MAIN);
    NodeFS.rmSync(file);
    expect(proxyFromFile(env)).toBeUndefined();
  });

  it("throws for a file that's there and can't be read, and names it", () => {
    // A directory in the file's place: unlike a mode, it stops root's read too.
    const message = `${PROXY_FILE_VARIABLE} names ${directory}, which can't be read.`;
    expect(() => proxyFromFile({ [PROXY_FILE_VARIABLE]: directory })).toThrow(message);
    NodeFS.writeFileSync(file, OWN);
    const under = NodePath.join(file, "proxy");
    expect(() => proxyFromFile({ [PROXY_FILE_VARIABLE]: under })).toThrow(PROXY_FILE_VARIABLE);
  });
});

describe("browserProxy, with a file for the browser's own proxy", () => {
  it("goes through the file's proxy in HTTPS_PROXY's place, with the same loopback around", () => {
    NodeFS.writeFileSync(file, `${OWN}\n`);
    const env = { HTTPS_PROXY: MAIN, NO_PROXY: "mint.awake", [PROXY_FILE_VARIABLE]: file };
    expect(browserProxy(env)).toEqual({ server: OWN, bypass: LOOPBACK });
    const alone = { [PROXY_FILE_VARIABLE]: file };
    expect(browserProxy(alone)).toEqual({ server: OWN, bypass: LOOPBACK });
  });

  it("goes through HTTPS_PROXY while the file isn't there or is blank", () => {
    const env = { HTTPS_PROXY: MAIN, [PROXY_FILE_VARIABLE]: file };
    expect(browserProxy(env)).toEqual({ server: MAIN, bypass: LOOPBACK });
    NodeFS.writeFileSync(file, "\n");
    expect(browserProxy(env)).toEqual({ server: MAIN, bypass: LOOPBACK });
    expect(browserProxy({ [PROXY_FILE_VARIABLE]: file })).toBeUndefined();
  });

  it("follows the file from one launch to the next", () => {
    const env = { HTTPS_PROXY: MAIN, [PROXY_FILE_VARIABLE]: file };
    const servers: Array<string | undefined> = [browserProxy(env)?.server];
    NodeFS.writeFileSync(file, `${OWN}\n`);
    servers.push(browserProxy(env)?.server);
    NodeFS.writeFileSync(file, "http://egress.awake:3131\n");
    servers.push(browserProxy(env)?.server);
    NodeFS.rmSync(file);
    servers.push(browserProxy(env)?.server);
    expect(servers).toEqual([MAIN, OWN, "http://egress.awake:3131", MAIN]);
  });

  it("takes no proxy when NO_PROXY is *, the file's neither", () => {
    NodeFS.writeFileSync(file, `${OWN}\n`);
    expect(browserProxy({ NO_PROXY: "*", [PROXY_FILE_VARIABLE]: file })).toBeUndefined();
  });

  it("refuses a file it can't read, and takes no other proxy", () => {
    const env = { HTTPS_PROXY: MAIN, [PROXY_FILE_VARIABLE]: directory };
    expect(() => browserProxy(env)).toThrow(PROXY_FILE_VARIABLE);
  });
});
