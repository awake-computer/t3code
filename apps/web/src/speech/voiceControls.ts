import { IS_AWAKE_BRAND } from "~/branding";

interface PagePolicy {
  readonly allowsFeature?: (feature: string) => boolean;
}

interface PolicyDocument {
  readonly permissionsPolicy?: PagePolicy;
  readonly featurePolicy?: PagePolicy;
}

/** Whether the page's permissions policy lets it ask for the microphone. No API reads as yes. */
export function pageAllowsMicrophone(page: object | undefined = globalThis.document): boolean {
  const { permissionsPolicy, featurePolicy } = (page ?? {}) as PolicyDocument;
  return (permissionsPolicy ?? featurePolicy)?.allowsFeature?.("microphone") ?? true;
}

/** Awake's build has no voice control on a page that may not ask for the microphone. */
export function voiceControlsShown(
  awake = IS_AWAKE_BRAND,
  allowed = pageAllowsMicrophone(),
): boolean {
  return !awake || allowed;
}
