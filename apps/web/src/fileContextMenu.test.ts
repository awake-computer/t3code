import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildFileContextMenuItems, resolveFileContextMenuAbsolutePath } from "./fileContextMenu";

const BASE_TARGET = {
  environmentId: EnvironmentId.make("environment-local"),
  filePath: "src/index.ts",
  workspaceRoot: "/workspace/project",
};

describe("resolveFileContextMenuAbsolutePath", () => {
  it("strips the repository prefix when the repo root is nested in the workspace", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        ...BASE_TARGET,
        workspaceRoot: "/workspace/project/packages/app",
        repositoryRoot: "/workspace/project",
        filePath: "packages/app/src/index.ts",
      }),
    ).toBe("/workspace/project/packages/app/src/index.ts");
  });

  it("returns null for paths outside the workspace when a repository root is set", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        ...BASE_TARGET,
        workspaceRoot: "/workspace/project/packages/app",
        repositoryRoot: "/workspace/project",
        filePath: "other/src/index.ts",
      }),
    ).toBeNull();
  });

  it("rejects absolute paths without a workspace root, matching diff path resolution", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        ...BASE_TARGET,
        workspaceRoot: undefined,
        filePath: "/absolute/src/index.ts",
      }),
    ).toBeNull();
  });
});

describe("buildFileContextMenuItems", () => {
  it("offers the policy's page alone when the policy sends files to one", () => {
    const capabilities = {
      revealLabel: "Reveal in Finder",
      canOpenDefault: true,
      editorIds: ["vscode", "file-manager"] as const,
    };
    expect(
      buildFileContextMenuItems({
        hasAbsolutePath: true,
        capabilities: { ...capabilities, pageLabel: "IDE" },
      }),
    ).toEqual([{ id: "open-in-page", label: "Open in IDE", icon: "pencil" }]);
    expect(
      buildFileContextMenuItems({ hasAbsolutePath: true, capabilities }).map((item) => item.id),
    ).toEqual(["open", "reveal-in-folder", "open-with"]);
  });
});
