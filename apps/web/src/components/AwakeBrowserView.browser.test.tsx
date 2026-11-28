import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AWAKE_BROWSER_THREAD_ID, type AwakeBrowserAlone } from "~/awakeConsole";
import { useRightPanelStore } from "~/rightPanelStore";
import { act, render } from "../../test/render";

interface PanelProps {
  readonly visible: boolean;
  readonly tabId?: string | null;
  readonly awake?: AwakeBrowserAlone;
}

interface TabsProps {
  readonly awakeAlone?: boolean;
  readonly activeSurfaceId: string | null;
  readonly surfaces: ReadonlyArray<{ readonly kind: string }>;
  readonly children: ReactNode;
}

const mocks = vi.hoisted(() => ({
  shown: (_shown: boolean) => {},
  link: (_url: string) => {},
  reportPage: vi.fn((_url: string | null | undefined) => {}),
  setReady: vi.fn(async (_ready: boolean) => {}),
  panel: vi.fn((_props: unknown) => {}),
  tabs: vi.fn((_props: unknown) => {}),
  listLoaded: true,
}));

// Framed by Awake's console: its word on whether it shows the frame, and the links it hands it.
vi.mock(import("~/awakeConsole"), async (original) => ({
  ...(await original()),
  awakeConsoleBrowserPage: () => ({
    onShown: (listener: (shown: boolean) => void) => {
      mocks.shown = listener;
      return () => {};
    },
    reportPage: mocks.reportPage,
  }),
  awakeConsoleWebLinks: () => ({
    onOpen: (listener: (url: string) => void) => {
      mocks.link = listener;
      return () => {};
    },
    setReady: mocks.setReady,
  }),
}));
vi.mock(import("~/state/environments"), async (original) => ({
  ...(await original()),
  usePrimaryEnvironmentId: () => EnvironmentId.make("environment-1"),
  usePrimaryEnvironment: (() => ({
    environmentId: EnvironmentId.make("environment-1"),
    connection: { phase: "connected" },
    serverConfig: {},
  })) as never,
}));
vi.mock(import("~/previewStateStore"), async (original) => ({
  ...(await original()),
  useThreadPreviewState: (() => ({
    activeTabId: "tab-1",
    serverEpoch: "epoch-1",
    desktopByTabId: {},
    recentlySeenUrls: [],
    listLoaded: mocks.listLoaded,
    suppressedTabIds: new Set(),
    sessions: {
      "tab-1": {
        threadId: "awake-workspace-browser",
        tabId: "tab-1",
        runtime: "server",
        navStatus: { _tag: "Success", url: "http://localhost:5173/pricing", title: "Pricing" },
        canGoBack: false,
        canGoForward: false,
        updatedAt: "2026-11-28T00:00:00.000Z",
      },
    },
  })) as never,
}));
vi.mock(import("./preview/usePreviewSession"), async (original) => ({
  ...(await original()),
  usePreviewSession: () => {},
}));
vi.mock(import("~/browser/previewRuntime"), async (original) => ({
  ...(await original()),
  usePreviewAvailable: () => true,
}));
vi.mock(import("~/state/session"), async (original) => ({
  ...(await original()),
  useEnvironmentScope: () => true,
}));
vi.mock(import("~/hooks/useRightPanelSurfaceClose"), async (original) => ({
  ...(await original()),
  useRightPanelSurfaceClose: () => ({
    closeSurface: () => {},
    closeOtherSurfaces: () => {},
    closeSurfacesToRight: () => {},
    closeAllSurfaces: () => {},
  }),
}));
vi.mock(import("./preview/PreviewPanel"), async (original) => ({
  ...(await original()),
  PreviewPanel: ((props: PanelProps) => {
    mocks.panel(props);
    return <div data-testid="panel" data-visible={String(props.visible)} />;
  }) as never,
}));
vi.mock(import("./RightPanelTabs"), async (original) => ({
  ...(await original()),
  RightPanelTabs: ((props: TabsProps) => {
    mocks.tabs(props);
    return <div data-testid="tabs">{props.children}</div>;
  }) as never,
}));

import { AwakeBrowserView } from "./AwakeBrowserView";

const BROWSER_KEY = scopedThreadKey(
  scopeThreadRef(EnvironmentId.make("environment-1"), AWAKE_BROWSER_THREAD_ID),
);
const lastPanel = () => mocks.panel.mock.lastCall?.[0] as PanelProps | undefined;
const lastTabs = () => mocks.tabs.mock.lastCall?.[0] as TabsProps | undefined;

function setup(options: { readonly listLoaded?: boolean; readonly tabs?: boolean } = {}) {
  vi.clearAllMocks();
  mocks.listLoaded = options.listLoaded ?? true;
  const surfaces =
    options.tabs === false
      ? []
      : [
          { id: "browser:tab-1", kind: "preview", resourceId: "tab-1" },
          { id: "terminal", kind: "terminal", terminalIds: ["t1"], activeTerminalId: "t1" },
        ];
  useRightPanelStore.setState({
    byThreadKey: {
      // T3 Code's own sync leaves a ref it follows closed; alone, the panel shows it anyway.
      [BROWSER_KEY]: {
        isOpen: false,
        activeSurfaceId: surfaces.length > 0 ? "browser:tab-1" : null,
        surfaces,
      },
    },
  } as never);
}

describe("the box's browser shown alone", () => {
  it("streams only once Awake's console says it shows the frame", async () => {
    setup();
    await using _screen = await render(<AwakeBrowserView />);
    const panel = page.getByTestId("panel");
    await expect.element(panel).toHaveAttribute("data-visible", "false");
    await act(() => mocks.shown(true));
    await expect.element(panel).toHaveAttribute("data-visible", "true");
    await act(() => mocks.shown(false));
    await expect.element(panel).toHaveAttribute("data-visible", "false");
  });

  it("tells the console the page it shows before it says it takes links", async () => {
    setup();
    await using _screen = await render(<AwakeBrowserView />);
    await vi.waitFor(() => expect(mocks.setReady).toHaveBeenCalledWith(true));
    expect(mocks.reportPage).toHaveBeenCalledWith("http://localhost:5173/pricing");
    const [reported] = mocks.reportPage.mock.invocationCallOrder;
    const [ready] = mocks.setReady.mock.invocationCallOrder;
    expect(reported).toBeLessThan(ready ?? 0);
  });

  it("says nothing to the console before it knows the browser's tabs", async () => {
    setup({ listLoaded: false });
    await using _screen = await render(<AwakeBrowserView />);
    await expect.element(page.getByTestId("panel")).toBeInTheDocument();
    expect(mocks.reportPage).not.toHaveBeenCalled();
    expect(mocks.setReady).not.toHaveBeenCalled();
  });

  it("hands the console's link to the browser, and lets it go once it has opened", async () => {
    setup();
    await using _screen = await render(<AwakeBrowserView />);
    await expect.element(page.getByTestId("panel")).toBeInTheDocument();
    await act(() => mocks.link("http://localhost:3000/"));
    const link = lastPanel()?.awake?.link;
    expect(link?.url).toBe("http://localhost:3000/");
    await act(() => mocks.link("http://localhost:3000/"));
    const again = lastPanel()?.awake?.link;
    expect(again?.url).toBe("http://localhost:3000/");
    expect(again?.id).not.toBe(link?.id);
    await act(() => lastPanel()?.awake?.onLinkOpened(again?.id ?? 0));
    expect(lastPanel()?.awake?.link).toBeUndefined();
  });

  it("shows the browser's tabs alone, and T3 Code's own empty browser with none", async () => {
    setup();
    await using screen = await render(<AwakeBrowserView />);
    await expect.element(page.getByTestId("panel")).toBeInTheDocument();
    expect(lastTabs()?.awakeAlone).toBe(true);
    expect(lastTabs()?.surfaces.map((surface) => surface.kind)).toEqual(["preview"]);
    expect(lastTabs()?.activeSurfaceId).toBe("browser:tab-1");
    expect(lastPanel()?.tabId).toBe("tab-1");

    setup({ tabs: false });
    await screen.rerender(<AwakeBrowserView />);
    await vi.waitFor(() => expect(lastTabs()?.activeSurfaceId).toBe("browser:new"));
    expect(lastTabs()?.surfaces).toEqual([]);
    expect(lastPanel()?.tabId).toBeNull();
  });
});
