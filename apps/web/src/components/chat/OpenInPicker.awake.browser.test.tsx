import { EnvironmentId, type EditorId } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import type { RemoteOpenState } from "../../remoteOpen";

const state = vi.hoisted(() => ({ remote: { mode: "local-exec" } as RemoteOpenState }));

vi.mock(import("../../branding"), async (original) => ({
  ...(await original()),
  IS_AWAKE_BRAND: true,
}));
vi.mock(import("../../state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: (() => true) as never,
  useEnvironmentScope: (() => true) as never,
}));
vi.mock(import("../../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: (() => vi.fn()) as never,
}));
vi.mock(import("../../state/environments"), async (original) => ({
  ...(await original()),
  useEnvironment: (() => ({ label: "maya-chen" })) as never,
}));
vi.mock(import("../../remoteOpen"), async (original) => ({
  ...(await original()),
  useRemoteOpenState: () => state.remote,
  useRemoteCapableEditors: () => ["vscode"] as readonly EditorId[],
}));

import { OpenInPicker } from "./OpenInPicker";

const picker = (
  <OpenInPicker
    environmentId={EnvironmentId.make("box")}
    keybindings={DEFAULT_RESOLVED_KEYBINDINGS}
    availableEditors={["vscode"]}
    openInCwd="/home/maya/src/app"
    displayMode="panel"
  />
);

describe("Awake's build, Open in", () => {
  it("offers no desktop editor without limits.editor, as a box has none", async () => {
    state.remote = { mode: "local-exec" };
    await using screen = await render(picker);
    expect(screen.container.querySelector('[aria-label="Open in editor"]')).toBeNull();
    expect(screen.container.querySelector('[aria-label="Choose editor"]')).toBeNull();
    expect(screen.container.textContent).toBe("");
  });

  it("opens the policy's page alone with limits.editor set", async () => {
    state.remote = {
      mode: "editor-url",
      editor: "vscode",
      urlTemplate: "https://app.example/ide#host={host}&path={path}&kind={kind}",
      host: "chat-x7k2.cell.example.com",
      label: "IDE",
    };
    await using screen = await render(picker);
    expect(screen.container.querySelector('[aria-label="Open in IDE"]')).not.toBeNull();
    expect(screen.container.querySelector('[aria-label="Choose editor"]')).toBeNull();
  });
});
