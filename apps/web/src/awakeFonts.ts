import geistMonoCyrillic from "../../../assets/awake/fonts/geist-mono/geist-mono-cyrillic-wght-normal.woff2";
import geistMonoCyrillicExt from "../../../assets/awake/fonts/geist-mono/geist-mono-cyrillic-ext-wght-normal.woff2";
import geistMonoLatin from "../../../assets/awake/fonts/geist-mono/geist-mono-latin-wght-normal.woff2";
import geistMonoLatinExt from "../../../assets/awake/fonts/geist-mono/geist-mono-latin-ext-wght-normal.woff2";
import geistMonoSymbols from "../../../assets/awake/fonts/geist-mono/geist-mono-symbols2-wght-normal.woff2";
import geistMonoVietnamese from "../../../assets/awake/fonts/geist-mono/geist-mono-vietnamese-wght-normal.woff2";
import sansCyrillic from "../../../assets/awake/fonts/neuramesh-sans/neuramesh-sans-cyrillic-wght-normal.woff2";
import sansCyrillicExt from "../../../assets/awake/fonts/neuramesh-sans/neuramesh-sans-cyrillic-ext-wght-normal.woff2";
import sansLatin from "../../../assets/awake/fonts/neuramesh-sans/neuramesh-sans-latin-wght-normal.woff2";
import sansLatinExt from "../../../assets/awake/fonts/neuramesh-sans/neuramesh-sans-latin-ext-wght-normal.woff2";
import sansVietnamese from "../../../assets/awake/fonts/neuramesh-sans/neuramesh-sans-vietnamese-wght-normal.woff2";

import { IS_AWAKE_BRAND } from "./branding";

// Unicode ranges as Awake's design system splits them, so a page fetches latin and little else.
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
const CYRILLIC = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
const CYRILLIC_EXT = "U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F";
const VIETNAMESE =
  "U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB";
const SYMBOLS = "U+2000-2001,U+2004-2008,U+200A,U+23B8-23BD,U+2500-259F";

/** The faces of the two families appearanceFonts.ts leads with in Awake's build. */
export const AWAKE_FONT_FACES: ReadonlyArray<{
  readonly family: string;
  readonly url: string;
  readonly unicodeRange: string;
}> = [
  { family: "NeuraMesh Sans", url: sansLatin, unicodeRange: LATIN },
  { family: "NeuraMesh Sans", url: sansLatinExt, unicodeRange: LATIN_EXT },
  { family: "NeuraMesh Sans", url: sansCyrillic, unicodeRange: CYRILLIC },
  { family: "NeuraMesh Sans", url: sansCyrillicExt, unicodeRange: CYRILLIC_EXT },
  { family: "NeuraMesh Sans", url: sansVietnamese, unicodeRange: VIETNAMESE },
  { family: "Geist Mono Variable", url: geistMonoLatin, unicodeRange: LATIN },
  { family: "Geist Mono Variable", url: geistMonoLatinExt, unicodeRange: LATIN_EXT },
  { family: "Geist Mono Variable", url: geistMonoCyrillic, unicodeRange: CYRILLIC },
  { family: "Geist Mono Variable", url: geistMonoCyrillicExt, unicodeRange: CYRILLIC_EXT },
  { family: "Geist Mono Variable", url: geistMonoVietnamese, unicodeRange: VIETNAMESE },
  { family: "Geist Mono Variable", url: geistMonoSymbols, unicodeRange: SYMBOLS },
];

/** Registers the faces in Awake's build; a browser fetches each file only when text needs it. */
export function installAwakeFonts(): void {
  if (!IS_AWAKE_BRAND || typeof FontFace === "undefined") return;
  for (const face of AWAKE_FONT_FACES) {
    const source = `url("${face.url}") format("woff2-variations")`;
    document.fonts.add(
      new FontFace(face.family, source, {
        weight: "100 900",
        style: "normal",
        display: "swap",
        unicodeRange: face.unicodeRange,
      }),
    );
  }
}
