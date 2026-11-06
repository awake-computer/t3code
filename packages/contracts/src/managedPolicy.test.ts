import { describe, expect, it } from "vite-plus/test";

import { managedEditorUrl } from "./managedPolicy.ts";

describe("managedEditorUrl", () => {
  it("fills every placeholder, encoded, so a path cannot add query parameters", () => {
    const editor = { urlTemplate: "https://ide.example/open?host={host}&path={path}&kind={kind}" };
    expect(
      managedEditorUrl(editor, {
        absolutePath: "/home/maya/my app/a&b=c.ts",
        isFile: true,
        host: "chat-x7k2.cell.example.com",
      }),
    ).toBe(
      "https://ide.example/open?host=chat-x7k2.cell.example.com&path=%2Fhome%2Fmaya%2Fmy%20app%2Fa%26b%3Dc.ts&kind=file",
    );
    expect(
      managedEditorUrl(
        { urlTemplate: "https://ide.example/{path}?f={path}&k={kind}" },
        { absolutePath: "/work", isFile: false, host: "" },
      ),
    ).toBe("https://ide.example/%2Fwork?f=%2Fwork&k=folder");
  });
});
