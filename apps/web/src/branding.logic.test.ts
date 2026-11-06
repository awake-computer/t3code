import { describe, expect, it } from "vite-plus/test";

import { awakeDocumentTitle } from "./branding.logic";

describe("awakeDocumentTitle", () => {
  const app = "Awake Chat";

  it("leads with the open thread, then the box, then names the app alone", () => {
    expect(awakeDocumentTitle({ thread: "Fix the flaky test", box: "payments-api", app })).toBe(
      "Fix the flaky test · Awake Chat",
    );
    expect(awakeDocumentTitle({ thread: undefined, box: "payments-api", app })).toBe(
      "payments-api · Awake Chat",
    );
    expect(awakeDocumentTitle({ thread: "  ", box: "payments-api", app })).toBe(
      "payments-api · Awake Chat",
    );
    expect(awakeDocumentTitle({ thread: undefined, box: undefined, app })).toBe("Awake Chat");
  });
});
