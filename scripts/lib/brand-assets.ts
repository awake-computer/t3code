export const BRAND_ASSET_PATHS = {
  developmentIconComposerProject: "assets/dev/app-icon.icon",
  developmentIosIconPng: "assets/dev/blueprint-ios-1024.png",
  developmentUniversalIconPng: "assets/dev/blueprint-universal-1024.png",

  productionIconComposerProject: "assets/prod/app-icon.icon",
  productionIosIconPng: "assets/prod/black-ios-1024.png",
  productionMacIconPng: "assets/prod/black-macos-1024.png",
  productionLinuxIconPng: "assets/prod/black-universal-1024.png",
  productionWindowsIconIco: "assets/prod/t3-black-windows.ico",
  productionWebFaviconIco: "assets/prod/t3-black-web-favicon.ico",
  productionWebFavicon16Png: "assets/prod/t3-black-web-favicon-16x16.png",
  productionWebFavicon32Png: "assets/prod/t3-black-web-favicon-32x32.png",
  productionWebAppleTouchIconPng: "assets/prod/t3-black-web-apple-touch-180.png",

  nightlyIconComposerProject: "assets/nightly/app-icon.icon",
  nightlyIosIconPng: "assets/nightly/nightly-ios-1024.png",
  nightlyMacIconPng: "assets/nightly/nightly-macos-1024.png",
  nightlyLinuxIconPng: "assets/nightly/nightly-universal-1024.png",
  nightlyWindowsIconIco: "assets/nightly/nightly-windows.ico",
  nightlyWebFaviconIco: "assets/nightly/nightly-web-favicon.ico",
  nightlyWebFavicon16Png: "assets/nightly/nightly-web-favicon-16x16.png",
  nightlyWebFavicon32Png: "assets/nightly/nightly-web-favicon-32x32.png",
  nightlyWebAppleTouchIconPng: "assets/nightly/nightly-web-apple-touch-180.png",

  developmentDesktopIconPng: "assets/dev/blueprint-macos-1024.png",
  developmentWindowsIconIco: "assets/dev/blueprint-windows.ico",
  developmentWebFaviconIco: "assets/dev/blueprint-web-favicon.ico",
  developmentWebFavicon16Png: "assets/dev/blueprint-web-favicon-16x16.png",
  developmentWebFavicon32Png: "assets/dev/blueprint-web-favicon-32x32.png",
  developmentWebAppleTouchIconPng: "assets/dev/blueprint-web-apple-touch-180.png",

  // Awake's build (awake-computer/t3code), drawn from Awake's mark in assets/awake/awake-mark.svg.
  awakeWebFaviconIco: "assets/awake/awake-web-favicon.ico",
  awakeWebFavicon16Png: "assets/awake/awake-web-favicon-16x16.png",
  awakeWebFavicon32Png: "assets/awake/awake-web-favicon-32x32.png",
  awakeWebAppleTouchIconPng: "assets/awake/awake-web-apple-touch-180.png",
  awakeWebManifest: "assets/awake/manifest.webmanifest",
} as const;

export type WebAssetBrand = "development" | "nightly" | "production" | "awake";

export const WEB_ASSET_CHANNELS = ["latest", "nightly"] as const;

export type WebAssetChannel = (typeof WEB_ASSET_CHANNELS)[number];

export function resolveWebAssetBrandForChannel(channel: WebAssetChannel): WebAssetBrand {
  return channel === "nightly" ? "nightly" : "production";
}

export interface IconOverride {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

const WEB_ICON_TARGET_FILENAMES = {
  faviconIco: "favicon.ico",
  favicon16Png: "favicon-16x16.png",
  favicon32Png: "favicon-32x32.png",
  appleTouchIconPng: "apple-touch-icon.png",
} as const;

const WEB_ICON_SOURCE_PATHS_BY_BRAND = {
  development: {
    faviconIco: BRAND_ASSET_PATHS.developmentWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
  },
  nightly: {
    faviconIco: BRAND_ASSET_PATHS.nightlyWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.nightlyWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.nightlyWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.nightlyWebAppleTouchIconPng,
  },
  production: {
    faviconIco: BRAND_ASSET_PATHS.productionWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
  },
  awake: {
    faviconIco: BRAND_ASSET_PATHS.awakeWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.awakeWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.awakeWebFavicon32Png,
    appleTouchIconPng: BRAND_ASSET_PATHS.awakeWebAppleTouchIconPng,
  },
} as const satisfies Record<WebAssetBrand, Record<keyof typeof WEB_ICON_TARGET_FILENAMES, string>>;

// Only a brand that renames the app replaces the web manifest; the others keep public/'s. Awake's
// also ships the licences of the fonts its client bundles beside them.
interface ExtraWebFile {
  readonly source: string;
  readonly target: string;
}

const WEB_EXTRA_FILES_BY_BRAND: Partial<Record<WebAssetBrand, ReadonlyArray<ExtraWebFile>>> = {
  awake: [
    { source: BRAND_ASSET_PATHS.awakeWebManifest, target: "manifest.webmanifest" },
    {
      source: "assets/awake/fonts/neuramesh-sans/LICENSE-NeuraMeshSans-OFL.txt",
      target: "LICENSE-NeuraMeshSans-OFL.txt",
    },
    {
      source: "assets/awake/fonts/geist-mono/LICENSE-OFL.txt",
      target: "LICENSE-GeistMono-OFL.txt",
    },
  ],
};

export function resolveWebIconOverrides(
  brand: WebAssetBrand,
  targetDirectory: string,
): ReadonlyArray<IconOverride> {
  const sourcePaths = WEB_ICON_SOURCE_PATHS_BY_BRAND[brand];
  return [
    ...(WEB_EXTRA_FILES_BY_BRAND[brand] ?? []).map((file) => ({
      sourceRelativePath: file.source,
      targetRelativePath: `${targetDirectory}/${file.target}`,
    })),
    {
      sourceRelativePath: sourcePaths.faviconIco,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.faviconIco}`,
    },
    {
      sourceRelativePath: sourcePaths.favicon16Png,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.favicon16Png}`,
    },
    {
      sourceRelativePath: sourcePaths.favicon32Png,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.favicon32Png}`,
    },
    {
      sourceRelativePath: sourcePaths.appleTouchIconPng,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.appleTouchIconPng}`,
    },
  ];
}

export const DEVELOPMENT_ICON_OVERRIDES = resolveWebIconOverrides("development", "dist/client");

export const DEVELOPMENT_PUBLIC_ICON_OVERRIDES = resolveWebIconOverrides(
  "development",
  "apps/web/public",
);
