import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { applyWebBrandAssets } from "./apply-web-brand-assets.ts";

const WEB_ICON_FILENAMES = [
  "apple-touch-icon.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon.ico",
  "icon-192x192.png",
  "icon-512x512.png",
];

it.layer(NodeServices.layer)("apply-web-brand-assets", (it) => {
  it.effect("copies the icons into an absolute target directory as given", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const targetDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "apply-web-brand-assets-",
      });

      yield* applyWebBrandAssets("production", targetDirectory);

      assert.deepStrictEqual(
        (yield* fs.readDirectory(targetDirectory)).toSorted(),
        WEB_ICON_FILENAMES,
      );
    }),
  );

  it.effect("moves the boot script of Awake's page into a file the page loads", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const targetDirectory = yield* fs.makeTempDirectoryScoped({
        prefix: "apply-web-brand-assets-",
      });
      const indexPath = path.join(targetDirectory, "index.html");
      const boot = "\n      window.booted = true;\n    ";
      yield* fs.writeFileString(
        indexPath,
        `<html><head><script>${boot}</script></head><body></body></html>`,
      );

      yield* applyWebBrandAssets("awake", targetDirectory);

      const html = yield* fs.readFileString(indexPath);
      assert.notInclude(html, "<script>");
      const [script] = yield* fs.readDirectory(path.join(targetDirectory, "assets"));
      assert.match(script ?? "", /^awake-boot-[0-9a-f]{16}\.js$/);
      assert.include(html, `<script src="/assets/${script}"></script>`);
      assert.strictEqual(
        yield* fs.readFileString(path.join(targetDirectory, "assets", script ?? "")),
        boot,
      );
      // A second pass, as a rerun of the step would make, changes nothing.
      yield* applyWebBrandAssets("awake", targetDirectory);
      assert.strictEqual(yield* fs.readFileString(indexPath), html);
    }),
  );

  it.effect("resolves an empty target directory to the repo root", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const repoRoot = yield* path.fromFileUrl(new URL("..", import.meta.url));
      const destinations = WEB_ICON_FILENAMES.map((filename) => path.join(repoRoot, filename));
      // readDirectory does not follow symlinks, so a dangling link counts as an existing entry.
      // Names are lowercased so a case-insensitive filesystem cannot hide a differently cased file.
      const existingEntries = new Set(
        (yield* fs.readDirectory(repoRoot)).map((entry) => entry.toLowerCase()),
      );
      for (const destination of destinations) {
        assert.isFalse(
          existingEntries.has(path.basename(destination)),
          `${destination} already exists`,
        );
      }
      yield* Effect.addFinalizer(() =>
        Effect.forEach(destinations, (destination) => fs.remove(destination, { force: true })).pipe(
          Effect.orDie,
        ),
      );

      yield* applyWebBrandAssets("production", "");

      for (const destination of destinations) {
        assert.isTrue(yield* fs.exists(destination));
      }
    }),
  );
});
