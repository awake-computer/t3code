import { describe, expect, it } from "vite-plus/test";

import "~/index.css";
import { FRAMED_ATTRIBUTE } from "./awakeConsole";

// Match Awake's canvas and toolbar in Paper, which are the console's sheet and window.
const CANVAS = "#f5f4f2";
const TOOLBAR = "#ebe9e6";

function headerGround(themeId: string, framed: boolean): string {
  const root = document.documentElement;
  const style = root.getAttribute("style");
  const previousThemeId = root.dataset.themeId;
  const header = document.createElement("header");
  header.setAttribute("data-chat-header", "");
  document.body.append(header);
  try {
    root.dataset.themeId = themeId;
    root.toggleAttribute(FRAMED_ATTRIBUTE, framed);
    root.style.setProperty("--app-theme-canvas", CANVAS);
    root.style.setProperty("--app-theme-toolbar", TOOLBAR);
    return getComputedStyle(header).backgroundColor;
  } finally {
    header.remove();
    root.removeAttribute(FRAMED_ATTRIBUTE);
    if (previousThemeId === undefined) delete root.dataset.themeId;
    else root.dataset.themeId = previousThemeId;
    if (style === null) root.removeAttribute("style");
    else root.setAttribute("style", style);
  }
}

describe("Awake's build in a frame of Awake's console", () => {
  it("draws Match Awake's header on the page's ground there, and on the window's elsewhere", () => {
    expect(headerGround("awake", true)).toBe("rgb(245, 244, 242)");
    // In a tab of its own, or under a theme the member or an agent chose, it's T3 Code's own.
    expect(headerGround("awake", false)).toBe("rgb(235, 233, 230)");
    expect(headerGround("forest", true)).toBe("rgb(235, 233, 230)");
  });
});
