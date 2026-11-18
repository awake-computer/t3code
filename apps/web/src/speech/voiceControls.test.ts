import { describe, expect, it, vi } from "vite-plus/test";

import { pageAllowsMicrophone, voiceControlsShown } from "./voiceControls";

const policy = (allowed: boolean) => ({ allowsFeature: vi.fn(() => allowed) });

describe("pageAllowsMicrophone", () => {
  it("is what the page's permissions policy says of the microphone", () => {
    const allows = policy(true);
    expect(pageAllowsMicrophone({ permissionsPolicy: allows })).toBe(true);
    expect(allows.allowsFeature).toHaveBeenCalledWith("microphone");
    expect(pageAllowsMicrophone({ permissionsPolicy: policy(false) })).toBe(false);
  });

  it("reads the older featurePolicy where there is no permissionsPolicy", () => {
    expect(pageAllowsMicrophone({ featurePolicy: policy(false) })).toBe(false);
    expect(pageAllowsMicrophone({ featurePolicy: policy(true) })).toBe(true);
    const older = policy(true);
    const page = { permissionsPolicy: policy(false), featurePolicy: older };
    expect(pageAllowsMicrophone(page)).toBe(false);
    expect(older.allowsFeature).not.toHaveBeenCalled();
  });

  it("reads as allowed in a browser with neither, and with no page at all", () => {
    expect(pageAllowsMicrophone({})).toBe(true);
    expect(pageAllowsMicrophone(undefined)).toBe(true);
    expect(pageAllowsMicrophone({ featurePolicy: {} })).toBe(true);
  });
});

describe("voiceControlsShown", () => {
  it("hides voice in Awake's build alone, and only where the page refuses the microphone", () => {
    expect(voiceControlsShown(true, false)).toBe(false);
    expect(voiceControlsShown(true, true)).toBe(true);
    expect(voiceControlsShown(false, false)).toBe(true);
    expect(voiceControlsShown(false, true)).toBe(true);
  });
});
