import {
  BUILT_IN_BROWSER_PROFILES,
  DEFAULT_BROWSER_PROFILE_ID,
  DEFAULT_PREVIEW_APPEARANCE,
  DEFAULT_PREVIEW_ZOOM_FACTOR,
  EnvironmentId,
  FILL_PREVIEW_VIEWPORT,
  ThreadId,
} from "@t3tools/contracts";
import type { Ref } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";
import { AWAKE_LINK_HOLD_MS, type AwakeBrowserAlone } from "~/awakeConsole";
import { act, fakeTimers, render } from "../../../test/render";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn((_url: string) => undefined),
  openPreviewSession: vi.fn(async (_input: unknown) => ({ _tag: "Success", value: {} })),
  openUrlInPreview: vi.fn(async (_input: unknown) => ({ _tag: "Success", value: undefined })),
  grantControl: () => {},
  url: "http://localhost:5173/",
  noTab: false,
}));

const STUB_BROWSER_DEFAULTS = {
  viewport: FILL_PREVIEW_VIEWPORT,
  zoomFactor: DEFAULT_PREVIEW_ZOOM_FACTOR,
  appearance: DEFAULT_PREVIEW_APPEARANCE,
  autoShowFloatingPreview: true,
  profiles: BUILT_IN_BROWSER_PROFILES,
  profileId: DEFAULT_BROWSER_PROFILE_ID,
};

vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
  useEnvironmentScope: () => true,
}));
vi.mock(import("~/browser/browserDefaults"), async (original) => ({
  ...(await original()),
  useBrowserDefaults: () => STUB_BROWSER_DEFAULTS,
  getBrowserDefaults: () => STUB_BROWSER_DEFAULTS,
  resolveBrowserDefaults: async () => STUB_BROWSER_DEFAULTS,
}));
// The box's browser's one server tab, on the page the console last showed, or no tab at all.
vi.mock(import("~/previewStateStore"), async (original) => ({
  ...(await original()),
  rememberPreviewUrl: () => {},
  useThreadPreviewState: (() => ({
    activeTabId: mocks.noTab ? null : "tab-1",
    serverEpoch: "epoch-1",
    desktopByTabId: {},
    recentlySeenUrls: [],
    listLoaded: true,
    suppressedTabIds: new Set(),
    sessions: mocks.noTab
      ? {}
      : {
          "tab-1": {
            threadId: "awake-workspace-browser",
            tabId: "tab-1",
            runtime: "server",
            navStatus: { _tag: "Success", url: mocks.url, title: "Pricing · Acme" },
            canGoBack: false,
            canGoForward: false,
            updatedAt: "2026-11-28T00:00:00.000Z",
          },
        },
  })) as never,
}));
vi.mock(import("~/state/environments"), async (original) => ({
  ...(await original()),
  useEnvironment: (() => ({ label: "maya-chen" })) as never,
  useEnvironmentHttpBaseUrl: () => "http://127.0.0.1:3773",
  usePrimaryEnvironmentId: () => null,
}));
vi.mock(import("./usePreviewSession"), async (original) => ({
  ...(await original()),
  usePreviewSession: () => {},
}));
vi.mock(import("./useDiscoveredLocalServers"), async (original) => ({
  ...(await original()),
  useDiscoveredLocalServers: () => [],
}));
vi.mock(import("./openPreviewSession"), async (original) => ({
  ...(await original()),
  openPreviewSession: mocks.openPreviewSession as never,
}));
vi.mock(import("~/browser/openFileInPreview"), async (original) => ({
  ...(await original()),
  openUrlInPreview: mocks.openUrlInPreview as never,
}));
// The stream's surface: this view holds the tab once the server says so, as T3 Code's does.
vi.mock(import("~/browser/ServerBrowserSurface"), async (original) => {
  const { useEffect, useImperativeHandle } = await import("react");
  function ServerBrowserSurface(props: {
    readonly visible: boolean;
    readonly onControl?: (control: { readonly controller: "you" } | null) => void;
    readonly ref?: Ref<unknown>;
  }) {
    useImperativeHandle(props.ref, () => ({ navigate: mocks.navigate }));
    const { onControl } = props;
    useEffect(() => {
      mocks.grantControl = () => onControl?.({ controller: "you" });
    }, [onControl]);
    return <div data-testid="server-browser-surface" data-visible={String(props.visible)} />;
  }
  return { ...(await original()), ServerBrowserSurface: ServerBrowserSurface as never };
});

import { PreviewView } from "./PreviewView";

const BROWSER_REF = {
  environmentId: EnvironmentId.make("environment-1"),
  threadId: ThreadId.make("awake-workspace-browser"),
} as const;

function setup(options: { readonly url?: string; readonly noTab?: boolean } = {}) {
  vi.clearAllMocks();
  mocks.grantControl = () => {};
  mocks.url = options.url ?? "http://localhost:5173/";
  mocks.noTab = options.noTab ?? false;
}

function alone(link?: { readonly url: string; readonly id: number }): AwakeBrowserAlone {
  return { link, onLinkOpened: vi.fn() };
}

describe("PreviewView shown alone in Awake's console", () => {
  it("draws no float over chat, and opens none of the box's pages in this browser", async () => {
    setup();
    await using _screen = await render(
      <PreviewView threadRef={BROWSER_REF} tabId="tab-1" visible awake={alone()} />,
    );
    await expect.element(page.getByTestId("server-browser-surface")).toBeInTheDocument();
    const float = page.getByRole("button", { name: "Float preview over chat" });
    await expect.element(float).not.toBeInTheDocument();
    const external = page.getByRole("button", { name: "Open in system browser" });
    await expect.element(external).not.toBeInTheDocument();
  });

  it("still opens a page elsewhere in this browser", async () => {
    setup({ url: "https://github.com/awake-computer" });
    await using _screen = await render(
      <PreviewView threadRef={BROWSER_REF} tabId="tab-1" visible awake={alone()} />,
    );
    const external = page.getByRole("button", { name: "Open in system browser" });
    await expect.element(external).toBeInTheDocument();
  });

  it("takes the console's link in the open tab once this view holds the tab", async () => {
    setup();
    const link = { url: "http://localhost:3000/", id: 1 };
    const awake = alone(link);
    await using _screen = await render(
      <PreviewView threadRef={BROWSER_REF} tabId="tab-1" visible awake={awake} />,
    );
    await expect.element(page.getByTestId("server-browser-surface")).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(awake.onLinkOpened).not.toHaveBeenCalled();

    await act(() => mocks.grantControl());
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).toHaveBeenCalledWith(expect.stringMatching(/^http:\/\/localhost:3000/));
    expect(awake.onLinkOpened).toHaveBeenCalledWith(1);
    expect(mocks.openUrlInPreview).not.toHaveBeenCalled();
  });

  it("opens the console's link in a tab of its own when no tab is open", async () => {
    setup({ noTab: true });
    const awake = alone({ url: "http://localhost:5173/", id: 2 });
    await using _screen = await render(
      <PreviewView threadRef={BROWSER_REF} visible awake={awake} />,
    );
    await vi.waitFor(() => expect(mocks.openPreviewSession).toHaveBeenCalledTimes(1));
    expect(mocks.openPreviewSession).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringMatching(/^http:\/\/localhost:5173/) }),
    );
    expect(awake.onLinkOpened).toHaveBeenCalledWith(2);
  });

  it("opens the console's link in a tab of its own when the tab isn't held in time", async () => {
    setup();
    await using screen = await render(
      <PreviewView threadRef={BROWSER_REF} tabId="tab-1" visible awake={alone()} />,
    );
    await expect.element(page.getByTestId("server-browser-surface")).toBeInTheDocument();
    using _timers = fakeTimers();
    const awake = alone({ url: "http://localhost:3000/", id: 3 });
    await screen.rerender(
      <PreviewView threadRef={BROWSER_REF} tabId="tab-1" visible awake={awake} />,
    );
    await act(() => vi.advanceTimersByTimeAsync(AWAKE_LINK_HOLD_MS - 1));
    expect(mocks.openUrlInPreview).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mocks.openUrlInPreview).toHaveBeenCalledWith(
      expect.objectContaining({ threadRef: BROWSER_REF, url: "http://localhost:3000/" }),
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(awake.onLinkOpened).toHaveBeenCalledWith(3);
  });

  it("opens a link once, however often the view renders", async () => {
    setup();
    const link = { url: "http://localhost:3000/", id: 4 };
    await using screen = await render(
      <PreviewView threadRef={BROWSER_REF} tabId="tab-1" visible awake={alone(link)} />,
    );
    await act(() => mocks.grantControl());
    await vi.waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
    await screen.rerender(
      <PreviewView threadRef={BROWSER_REF} tabId="tab-1" visible awake={alone(link)} />,
    );
    await act(() => mocks.grantControl());
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
});
