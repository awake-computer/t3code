import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

vi.mock(import("../branding"), async (original) => ({
  ...(await original()),
  IS_AWAKE_BRAND: true,
}));

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
});
