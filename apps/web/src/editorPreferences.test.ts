import {
  AuthOrchestrationOperateScope,
  EnvironmentAuthorizationError,
  EnvironmentId,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/reactivity";
import { assert, beforeEach, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  allowed: new Set<string>(),
  run: vi.fn(),
  getPreference: vi.fn(),
  setPreference: vi.fn(),
  remote: { mode: "local-exec" } as { readonly mode: string } & Record<string, unknown>,
  openPage: vi.fn(),
}));

vi.mock("react", () => ({ useCallback: (callback: unknown) => callback }));
vi.mock("./remoteOpen", () => ({
  useRemoteOpenState: () => state.remote,
  openManagedEditorUrl: state.openPage,
}));
vi.mock("./state/shell", () => ({ shellEnvironment: { openInEditor: "openInEditor" } }));
vi.mock("./state/use-atom-command", () => ({ useAtomCommand: () => state.run }));
vi.mock("./state/session", () => ({
  readEnvironmentScope: (environmentId: string, scope: string) =>
    scope === AuthOrchestrationOperateScope && state.allowed.has(environmentId),
}));
vi.mock("./hooks/useLocalStorage", () => ({
  getLocalStorageItem: state.getPreference,
  setLocalStorageItem: state.setPreference,
  useLocalStorage: vi.fn(),
}));

import { useOpenInPreferredEditor } from "./editorPreferences";

const primary = EnvironmentId.make("primary");
const secondary = EnvironmentId.make("secondary");

beforeEach(() => {
  state.allowed.clear();
  state.run.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  state.getPreference.mockReset().mockReturnValue(null);
  state.setPreference.mockReset();
  state.remote = { mode: "local-exec" };
  state.openPage.mockReset().mockResolvedValue(true);
});

it("opens files and folders on the policy's page, with no editor on the environment", async () => {
  state.remote = {
    mode: "editor-url",
    editor: "vscode",
    urlTemplate: "https://app.example/ide#host={host}&path={path}&kind={kind}",
    host: "chat.example",
  };
  const open = useOpenInPreferredEditor(secondary, []);
  expect(await open("/work/src/main.ts:12:3")).toMatchObject({ _tag: "Success", value: "vscode" });
  expect(state.openPage).toHaveBeenLastCalledWith(
    "https://app.example/ide#host=chat.example&path=%2Fwork%2Fsrc%2Fmain.ts&kind=file",
  );
  await open("/work/logs", "folder");
  expect(state.openPage).toHaveBeenLastCalledWith(
    "https://app.example/ide#host=chat.example&path=%2Fwork%2Flogs&kind=folder",
  );
  expect(state.run).not.toHaveBeenCalled();
});

it("does not use another environment's grant or change preferences when denied", async () => {
  state.allowed.add(primary);
  const open = useOpenInPreferredEditor(secondary, ["vscode"]);
  const result = await open("/work/readme.md");
  assert(result._tag === "Failure");
  const error = Cause.squash(result.cause);
  expect(error).toBeInstanceOf(EnvironmentAuthorizationError);
  expect(error).toMatchObject({ requiredScope: AuthOrchestrationOperateScope });
  expect(state.run).not.toHaveBeenCalled();
  expect(state.getPreference).not.toHaveBeenCalled();
  expect(state.setPreference).not.toHaveBeenCalled();
});

it("checks revocation and regrant when a retained editor callback is invoked", async () => {
  state.allowed.add(secondary);
  const open = useOpenInPreferredEditor(secondary, ["vscode"]);
  state.allowed.delete(secondary);
  expect((await open("/work/readme.md:5"))._tag).toBe("Failure");
  expect(state.run).not.toHaveBeenCalled();

  state.allowed.add(secondary);
  expect(await open("/work/readme.md:5")).toMatchObject({ _tag: "Success", value: "vscode" });
  expect(state.run).toHaveBeenCalledExactlyOnceWith({
    environmentId: secondary,
    input: { cwd: "/work/readme.md:5", editor: "vscode" },
  });
  expect(state.setPreference).toHaveBeenCalledTimes(1);
});
