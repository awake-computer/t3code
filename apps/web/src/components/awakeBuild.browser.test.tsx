import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";

vi.mock(import("../branding"), async (original) => ({
  ...(await original()),
  IS_AWAKE_BRAND: true,
}));

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
});
