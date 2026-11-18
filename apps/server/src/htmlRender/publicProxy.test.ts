// @effect-diagnostics nodeBuiltinImport:off - raw sockets speak SOCKS5 to the proxy.
import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import type * as NodeDns from "node:dns";
import * as NodeDnsPromises from "node:dns/promises";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";

import { publicProxy } from "./publicProxy.ts";

const OWN_PUBLIC_IPV4 = "198.51.100.7";
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeOS>();
  return {
    ...actual,
    networkInterfaces: () => ({
      ...actual.networkInterfaces(),
      "t3-test": [
        {
          address: OWN_PUBLIC_IPV4,
          netmask: "255.255.255.0",
          family: "IPv4",
          mac: "00:00:00:00:00:00",
          internal: false,
          cidr: `${OWN_PUBLIC_IPV4}/24`,
        },
      ],
    }),
  };
});

// Awake: transparent egress has a box's resolver answer a public name with the proxy's own address.
const PROXIED_NAME = "proxied.example.test";
// Clash and Mihomo answer every name from 198.18.0.0/16 in fake-IP mode.
const TEST_DNS: Record<string, ReadonlyArray<{ address: string; family: number }>> = {
  "cdn.fake-ip.test": [{ address: "198.18.2.40", family: 4 }],
  "mixed.fake-ip.test": [
    { address: "93.184.215.14", family: 4 },
    { address: "198.18.2.41", family: 4 },
  ],
  [PROXIED_NAME]: [{ address: "10.43.0.10", family: 4 }],
};
vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeDnsPromises>();
  return {
    ...actual,
    lookup: (host: string, options: NodeDns.LookupOptions) =>
      TEST_DNS[host] ? Promise.resolve(TEST_DNS[host]) : actual.lookup(host, options),
  };
});

const connectThrough = (proxyPort: number, target: Buffer, version = 5) =>
  Effect.callback<{ readonly code: number; readonly socket: NodeNet.Socket }>((resume) => {
    const socket = NodeNet.connect(proxyPort, "127.0.0.1", () => {
      socket.write(Buffer.from([5, 1, 0]));
      socket.write(Buffer.concat([Buffer.from([version, 1, 0]), target]));
    });
    // The proxy may reset a refused connection.
    socket.on("error", () => {});
    let received = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length >= 12) resume(Effect.succeed({ code: received[3]!, socket }));
    });
    socket.on("close", () => resume(Effect.succeed({ code: received[3] ?? -1, socket })));
  });

const ipv4Target = (address: string, port: number) => {
  const target = Buffer.alloc(7);
  target[0] = 1;
  address.split(".").forEach((octet, index) => (target[1 + index] = Number(octet)));
  target.writeUInt16BE(port, 5);
  return target;
};

const ipv6Target = (address: string, port: number) => {
  const target = Buffer.alloc(19);
  target[0] = 4;
  const [head = "", tail = ""] = address.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  groups.forEach((group, index) => target.writeUInt16BE(Number.parseInt(group, 16), 1 + index * 2));
  target.writeUInt16BE(port, 17);
  return target;
};

const toHexPair = (address: string) => {
  const [a = 0, b = 0, c = 0, d = 0] = address.split(".").map(Number);
  return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
};

const domainTarget = (host: string, port: number) => {
  const name = Buffer.from(host, "latin1");
  const target = Buffer.alloc(4 + name.length);
  target[0] = 3;
  target[1] = name.length;
  name.copy(target, 2);
  target.writeUInt16BE(port, 2 + name.length);
  return target;
};

// Awake: a stand-in for a box's Egress Proxy. It answers each CONNECT with `status`, records the
// request's head, and echoes what follows a 200.
const standInProxy = (status: string) =>
  Effect.acquireRelease(
    Effect.callback<{
      readonly server: NodeNet.Server;
      readonly port: number;
      readonly requests: Array<string>;
      readonly sockets: Set<NodeNet.Socket>;
    }>((resume) => {
      const requests: Array<string> = [];
      const sockets = new Set<NodeNet.Socket>();
      const server = NodeNet.createServer((socket) => {
        sockets.add(socket);
        socket.on("error", () => {});
        let head = "";
        const onData = (chunk: Buffer) => {
          head += chunk.toString("latin1");
          const end = head.indexOf("\r\n\r\n");
          if (end === -1) return;
          socket.off("data", onData);
          requests.push(head.slice(0, end));
          socket.write(`HTTP/1.1 ${status}\r\n\r\n`);
          if (status.startsWith("200 ")) socket.pipe(socket);
          else socket.end();
        };
        socket.on("data", onData);
      });
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as NodeNet.AddressInfo;
        resume(Effect.succeed({ server, port: address.port, requests, sockets }));
      });
    }),
    ({ server, sockets }) =>
      Effect.callback<void>((resume) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resume(Effect.void));
      }),
  );

// The environment each render's proxy reads when it starts, for this test alone.
const withEnvironment = (env: Readonly<Record<string, string>>) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      for (const name of ["HTTPS_PROXY", "https_proxy", "NO_PROXY", "no_proxy"]) {
        vi.stubEnv(name, env[name] ?? "");
      }
    }),
    () => Effect.sync(() => vi.unstubAllEnvs()),
  );

const throughProxy = (proxyPort: number, extra: Readonly<Record<string, string>> = {}) =>
  withEnvironment({
    HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
    NO_PROXY: "localhost,127.0.0.1",
    ...extra,
  }).pipe(Effect.andThen(publicProxy));

const echoOf = (socket: NodeNet.Socket, text: string) =>
  Effect.callback<string>((resume) => {
    socket.once("data", (chunk) => resume(Effect.succeed(chunk.toString("latin1"))));
    socket.write(text);
  });

describe("publicProxy through the environment's proxy", () => {
  it.effect("reaches a name it can't resolve through HTTPS_PROXY, by name", () =>
    Effect.gen(function* () {
      const proxy = yield* standInProxy("200 Connection established");
      const port = yield* throughProxy(proxy.port);
      const { code, socket } = yield* connectThrough(
        port,
        domainTarget("pages.example.invalid", 443),
      );
      expect(code).toBe(0);
      expect(yield* echoOf(socket, "hello")).toBe("hello");
      socket.destroy();
      expect(proxy.requests).toEqual([
        "CONNECT pages.example.invalid:443 HTTP/1.1\r\nHost: pages.example.invalid:443",
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect("tunnels a name the box's resolver answers with the proxy's address, by name", () =>
    Effect.gen(function* () {
      const proxy = yield* standInProxy("200 Connection established");
      const port = yield* throughProxy(proxy.port);
      const { code, socket } = yield* connectThrough(port, domainTarget(PROXIED_NAME, 443));
      socket.destroy();
      expect(code).toBe(0);
      expect(proxy.requests).toEqual([
        `CONNECT ${PROXIED_NAME}:443 HTTP/1.1\r\nHost: ${PROXIED_NAME}:443`,
      ]);
    }).pipe(Effect.scoped),
  );

  it.effect("refuses what the proxy refuses", () =>
    Effect.gen(function* () {
      const proxy = yield* standInProxy("403 Forbidden");
      const port = yield* throughProxy(proxy.port);
      const { code, socket } = yield* connectThrough(
        port,
        domainTarget("pages.example.invalid", 443),
      );
      socket.destroy();
      expect(code).toBe(2);
      expect(proxy.requests).toHaveLength(1);
    }).pipe(Effect.scoped),
  );

  it.effect("never sends a local target to the proxy", () =>
    Effect.gen(function* () {
      const proxy = yield* standInProxy("200 Connection established");
      const port = yield* throughProxy(proxy.port, { NO_PROXY: "" });
      for (const target of [
        ipv4Target("127.0.0.1", 80),
        ipv4Target("10.1.2.3", 80),
        ipv6Target("64:ff9b::a00:1", 80),
        domainTarget("localhost", 80),
        domainTarget("app.localhost", 80),
      ]) {
        const { code, socket } = yield* connectThrough(port, target);
        socket.destroy();
        expect(code).toBe(2);
      }
      expect(proxy.requests).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect("reaches NO_PROXY's hosts directly, as before", () =>
    Effect.gen(function* () {
      const proxy = yield* standInProxy("200 Connection established");
      const port = yield* throughProxy(proxy.port, { NO_PROXY: ".internal.invalid" });
      const { code, socket } = yield* connectThrough(
        port,
        domainTarget("api.internal.invalid", 443),
      );
      socket.destroy();
      expect(code).toBe(2);
      expect(proxy.requests).toEqual([]);
    }).pipe(Effect.scoped),
  );

  it.effect("refuses every target when the proxy named isn't one it can use", () =>
    Effect.gen(function* () {
      const port = yield* withEnvironment({ HTTPS_PROXY: "socks5://127.0.0.1:1" }).pipe(
        Effect.andThen(publicProxy),
      );
      const { code, socket } = yield* connectThrough(
        port,
        domainTarget("pages.example.invalid", 443),
      );
      socket.destroy();
      expect(code).toBe(1);
    }).pipe(Effect.scoped),
  );
});

describe("publicProxy", () => {
  it.effect("refuses loopback and private targets, by address or by name", () =>
    Effect.gen(function* () {
      const { port } = yield* publicProxy;
      for (const target of [
        ipv4Target("127.0.0.1", 80),
        ipv4Target("10.1.2.3", 80),
        ipv4Target("169.254.169.254", 80),
        ipv4Target("198.18.0.1", 80),
        domainTarget("localhost", 80),
        ipv6Target("64:ff9b::7f00:1", 80),
        ipv6Target("64:ff9b::a00:1", 80),
        ipv6Target("2002:7f00:1::1", 80),
        ipv6Target("2001::1", 80),
        ipv6Target("::7f00:1", 80),
      ]) {
        const { code, socket } = yield* connectThrough(port, target);
        socket.destroy();
        expect(code).toBe(2);
      }
      const { code, socket } = yield* connectThrough(port, ipv4Target("1.1.1.1", 0));
      socket.destroy();
      expect(code).toBe(7);
    }),
  );

  it.effect("refuses fake-IP names and records hosts whose every address is fake", () =>
    Effect.gen(function* () {
      const { port, fakeIpHosts } = yield* publicProxy;
      for (const host of ["cdn.fake-ip.test", "mixed.fake-ip.test"]) {
        const { code, socket } = yield* connectThrough(port, domainTarget(host, 443));
        socket.destroy();
        expect(code).toBe(2);
      }
      expect([...fakeIpHosts]).toEqual([["cdn.fake-ip.test", "198.18.2.40"]]);
    }),
  );

  it.effect("refuses every address this machine holds, even a public one", () =>
    Effect.gen(function* () {
      const { port } = yield* publicProxy;
      const own = Object.values(NodeOS.networkInterfaces())
        .flatMap((entries) => entries ?? [])
        .filter((entry) => !entry.internal && !entry.address.startsWith("fe80"));
      const targets = own.flatMap((entry) =>
        entry.family === "IPv6"
          ? [ipv6Target(entry.address, 80)]
          : [
              ipv4Target(entry.address, 80),
              ipv6Target(`::ffff:${toHexPair(entry.address)}`, 80),
              ipv6Target(`64:ff9b::${toHexPair(entry.address)}`, 80),
            ],
      );
      for (const target of targets) {
        const { code, socket } = yield* connectThrough(port, target);
        socket.destroy();
        expect(code).toBe(2);
      }
    }),
  );

  it.effect("closes every connection when its scope closes", () =>
    Effect.gen(function* () {
      const socket = yield* Effect.scoped(
        Effect.gen(function* () {
          const { port } = yield* publicProxy;
          return yield* Effect.callback<NodeNet.Socket>((resume) => {
            const client = NodeNet.connect(port, "127.0.0.1", () => {
              client.write(Buffer.from([5, 1, 0]));
              resume(Effect.succeed(client));
            });
            client.on("error", () => {});
          });
        }),
      );
      yield* Effect.callback<void>((resume) => {
        if (socket.closed) return resume(Effect.void);
        socket.once("close", () => resume(Effect.void));
      });
      expect(socket.closed).toBe(true);
    }),
  );
});
