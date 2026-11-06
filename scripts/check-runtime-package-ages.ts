// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalDate:off globalFetch:off preferSchemaOverJson:off - a CI check of an unpacked archive, outside any Effect.
/**
 * Fails unless every package in an unpacked CLI archive's node_modules was published on npm at or
 * before --published-before: Awake's 14-day rule for the runtime install, checked on what shipped.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

interface Installed {
  readonly name: string;
  readonly version: string;
}

const USAGE = "usage: check-runtime-package-ages.ts --dir <dir> --published-before <time>";

function option(flag: string): string {
  const index = process.argv.indexOf(flag);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined) throw new Error(USAGE);
  return value;
}

function packageDirectories(modules: string, entry: string): ReadonlyArray<string> {
  if (!entry.startsWith("@")) return [NodePath.join(modules, entry)];
  const scope = NodePath.join(modules, entry);
  const scoped = NodeFS.readdirSync(scope, { withFileTypes: true }).filter((d) => d.isDirectory());
  return scoped.map((dirent) => NodePath.join(scope, dirent.name));
}

function collect(modules: string, found: Map<string, Installed>): void {
  if (!NodeFS.existsSync(modules)) return;
  for (const entry of NodeFS.readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    for (const dir of packageDirectories(modules, entry.name)) {
      const manifestPath = NodePath.join(dir, "package.json");
      if (NodeFS.existsSync(manifestPath)) {
        const text = NodeFS.readFileSync(manifestPath, "utf8");
        const { name, version } = JSON.parse(text) as Record<string, unknown>;
        if (typeof name === "string" && typeof version === "string") {
          found.set(`${name}@${version}`, { name, version });
        }
      }
      collect(NodePath.join(dir, "node_modules"), found);
    }
  }
}

async function publishTimes(name: string): Promise<Readonly<Record<string, string>>> {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`npm answered ${response.status} for ${name}.`);
  const document = (await response.json()) as { readonly time?: Record<string, string> };
  return document.time ?? {};
}

const root = option("--dir");
const limit = Date.parse(option("--published-before"));
if (Number.isNaN(limit)) throw new Error(USAGE);

const found = new Map<string, Installed>();
for (const entry of NodeFS.readdirSync(root, { withFileTypes: true })) {
  if (entry.isDirectory()) collect(NodePath.join(root, entry.name, "node_modules"), found);
}
// An empty list means the wrong directory, not a clean archive.
if (found.size === 0) throw new Error(`No packages under ${root}/*/node_modules.`);

const names = [...new Set([...found.values()].map((installed) => installed.name))].sort();
const times = new Map<string, Readonly<Record<string, string>>>();
for (let start = 0; start < names.length; start += 8) {
  const batch = names.slice(start, start + 8);
  const results = await Promise.all(batch.map(publishTimes));
  for (const [index, name] of batch.entries()) times.set(name, results[index] ?? {});
}

const rows = [...found.values()].map((installed) => ({
  ...installed,
  published: times.get(installed.name)?.[installed.version],
}));
rows.sort((a, b) => (b.published ?? "~").localeCompare(a.published ?? "~"));
for (const row of rows) console.log(`${row.published ?? "unknown"}  ${row.name}@${row.version}`);

const isLate = (published: string | undefined) =>
  published !== undefined && Date.parse(published) > limit;
const unknown = rows.filter((row) => row.published === undefined);
const late = rows.filter((row) => isLate(row.published));
const newest = rows.find((row) => row.published !== undefined)?.published ?? "never";
console.log(`${rows.length} packages, limit ${new Date(limit).toISOString()}, newest ${newest}.`);
for (const row of unknown) console.error(`No npm publish time for ${row.name}@${row.version}.`);
for (const row of late) {
  console.error(`${row.name}@${row.version} was published ${row.published}, after the limit.`);
}
if (unknown.length > 0 || late.length > 0) process.exitCode = 1;
