import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

vi.mock(import("../branding"), async (original) => ({
  ...(await original()),
  IS_AWAKE_BRAND: true,
}));

import { DEFAULT_CODE_FONT_STACK, DEFAULT_SANS_FONT_STACK } from "../appearanceFonts";
import { AWAKE_FONT_FACES } from "../awakeFonts";
import { publishedThemeDefinitions } from "../themePalette";
import { ServerUpdateAction } from "./ServerUpdateAction";
import { SidebarUpdatePill } from "./sidebar/SidebarUpdatePill";

describe("Awake's build", () => {
  it("offers no self-update, since the box's image updates it", async () => {
    await using screen = await render(
      <>
        <ServerUpdateAction
          environmentId={"env-test" as EnvironmentId}
          serverLabel="Test server"
          selfUpdate="boot-service"
          targetVersion="0.0.31"
        />
        <SidebarUpdatePill />
      </>,
    );
    expect(screen.container.querySelector("button")).toBeNull();
    expect(screen.container.textContent).toBe("");
  });

  it("names the palettes the box publishes as awake Match Awake, and leaves others alone", () => {
    const published = (id: string) =>
      ({ id, name: "Awake", appearance: "light", canvas: "#f5f4f2", accent: "#834a2b" }) as never;
    const [awake, other] = publishedThemeDefinitions([published("awake"), published("forest")]);
    expect(awake?.label).toBe("Match Awake");
    expect(other?.label).toBe("Awake");
  });

  it("leads its fonts with NeuraMesh Sans and Geist Mono, bundled in every range", () => {
    expect(DEFAULT_SANS_FONT_STACK.startsWith('"NeuraMesh Sans", ')).toBe(true);
    expect(DEFAULT_CODE_FONT_STACK.startsWith('"Geist Mono Variable", ')).toBe(true);
    const families = AWAKE_FONT_FACES.map((face) => face.family);
    expect(families.filter((family) => family === "NeuraMesh Sans")).toHaveLength(5);
    expect(families.filter((family) => family === "Geist Mono Variable")).toHaveLength(6);
    expect(AWAKE_FONT_FACES.every((face) => face.url.length > 0)).toBe(true);
  });
});
