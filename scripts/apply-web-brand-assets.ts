#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Argument, Command, Flag } from "effect/cli";
import { externalizeBootScript } from "./lib/awake-boot-script.ts";
import {
  resolveWebAssetBrandForChannel,
  resolveWebIconOverrides,
  WEB_ASSET_CHANNELS,
  type WebAssetBrand,
} from "./lib/brand-assets.ts";

const WEB_ASSET_BRANDS = [
  "development",
  "nightly",
  "production",
  "awake",
] as const satisfies ReadonlyArray<WebAssetBrand>;

export const applyWebBrandAssets = Effect.fn("applyWebBrandAssets")(function* (
  brand: WebAssetBrand,
  targetDirectory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const repoRoot = yield* path.fromFileUrl(new URL("..", import.meta.url));
  const target = path.resolve(repoRoot, targetDirectory);

  yield* Effect.forEach(
    resolveWebIconOverrides(brand, target),
    (override) =>
      fs.copyFile(path.join(repoRoot, override.sourceRelativePath), override.targetRelativePath),
    { concurrency: "unbounded" },
  );
  if (brand !== "awake") return;

  // Awake's page loads its boot script from a file, so the gateway that serves it needs no hash
  // for an inline one (scripts/lib/awake-boot-script.ts).
  const indexPath = path.join(target, "index.html");
  const page = externalizeBootScript(yield* fs.readFileString(indexPath));
  if (page.fileName === undefined) return;
  const scriptPath = path.join(target, page.fileName);
  yield* fs.makeDirectory(path.dirname(scriptPath), { recursive: true });
  yield* fs.writeFileString(scriptPath, page.source);
  yield* fs.writeFileString(indexPath, page.html);
});

export const applyWebBrandAssetsCommand = Command.make(
  "apply-web-brand-assets",
  {
    brand: Argument.Literals("brand", WEB_ASSET_BRANDS).pipe(
      Argument.withDescription("Asset brand to copy into the hosted web output directory."),
      Argument.optional,
    ),
    channel: Flag.Literals("channel", WEB_ASSET_CHANNELS).pipe(
      Flag.withDescription("Hosted release channel to map to a web asset brand."),
      Flag.optional,
    ),
    targetDirectory: Argument.String("target-directory").pipe(
      Argument.withDescription("Output directory that contains the hosted web build assets."),
      Argument.optional,
    ),
  },
  ({ brand, channel, targetDirectory }) =>
    applyWebBrandAssets(
      Option.getOrElse(brand, () =>
        Option.match(channel, {
          onNone: () => "production" as const,
          onSome: resolveWebAssetBrandForChannel,
        }),
      ),
      Option.getOrElse(targetDirectory, () => "apps/web/dist"),
    ),
).pipe(Command.withDescription("Copy web brand assets into a built hosted web app."));

if (import.meta.main) {
  Command.run(applyWebBrandAssetsCommand, { version: "0.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
