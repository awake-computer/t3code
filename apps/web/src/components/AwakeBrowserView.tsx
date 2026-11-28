import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AuthPreviewOperateScope, type EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import {
  AWAKE_BROWSER_THREAD_ID,
  type AwakeBrowserLink,
  awakeConsoleBrowserPage,
  awakeConsoleWebLinks,
} from "~/awakeConsole";
import { usePreviewAvailable } from "~/browser/previewRuntime";
import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import { isElectron } from "~/env";
import { useRightPanelSurfaceClose } from "~/hooks/useRightPanelSurfaceClose";
import { setActivePreviewTab, useThreadPreviewState } from "~/previewStateStore";
import {
  type RightPanelSurface,
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "~/rightPanelStore";
import { usePrimaryEnvironment, usePrimaryEnvironmentId } from "~/state/environments";
import { previewEnvironment } from "~/state/preview";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";

import { addBrowserSurface } from "./preview/addBrowserSurface";
import { PreviewPanel } from "./preview/PreviewPanel";
import { usePreviewSession } from "./preview/usePreviewSession";
import { RightPanelTabs } from "./RightPanelTabs";

// With no tab open, the panel shows T3 Code's own empty browser, not its picker of surfaces.
const NO_TAB = "browser:new";
const NO_PENDING: ReadonlySet<string> = new Set();
const NO_TERMINALS: ReadonlyMap<string, string> = new Map();
const nothing = () => {};

let linksHanded = 0;

function shortcutContext() {
  return {
    terminalFocus: false,
    terminalOpen: false,
    previewFocus: false,
    previewOpen: true,
    modelPickerOpen: false,
    isWeb: !isElectron,
    isDesktop: isElectron,
  };
}

/**
 * Awake: the box's browser shown alone, which Awake's console frames beside what the box serves.
 * It's T3 Code's own panel and server browser, under a thread that no thread is (FDD-0060 §16).
 */
export function AwakeBrowserView() {
  const environmentId = usePrimaryEnvironmentId();
  if (environmentId === null) return null;
  return <AwakeBrowser key={environmentId} environmentId={environmentId} />;
}

function AwakeBrowser(props: { readonly environmentId: EnvironmentId }) {
  const threadRef = scopeThreadRef(props.environmentId, AWAKE_BROWSER_THREAD_ID);
  usePreviewSession(threadRef);
  const environment = usePrimaryEnvironment();
  const previewState = useThreadPreviewState(threadRef);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const previewAvailable = usePreviewAvailable(props.environmentId);
  const canOperatePreview = useEnvironmentScope(props.environmentId, AuthPreviewOperateScope);
  const openPreview = useAtomCommand(previewEnvironment.open);
  const surfaceClose = useRightPanelSurfaceClose({ threadRef, terminalLabelsById: NO_TERMINALS });
  const surfaces = useRightPanelStore(
    (state) => selectThreadRightPanelState(state.byThreadKey, threadRef).surfaces,
  );
  const activeSurface = useRightPanelStore((state) =>
    selectActiveRightPanelSurface(state.byThreadKey, threadRef),
  );
  // Framed by Awake's console, the page streams only once the console says it shows the frame.
  const [shown, setShown] = useState(() => awakeConsoleBrowserPage() === undefined);
  const [link, setLink] = useState<AwakeBrowserLink | undefined>(undefined);

  const browserTabs = surfaces.filter((surface) => surface.kind === "preview");
  const shownTab = activeSurface?.kind === "preview" ? activeSurface : null;
  const shownTabId = shownTab?.resourceId ?? previewState.activeTabId;
  const navStatus = shownTabId ? previewState.sessions[shownTabId]?.navStatus : undefined;
  const pageUrl = navStatus === undefined || navStatus._tag === "Idle" ? null : navStatus.url;
  const connected =
    environment?.connection.phase === "connected" && environment.serverConfig !== null;
  // Ready once it knows the browser's tabs, so a link never opens beside a tab it hasn't seen.
  const ready = connected && previewState.listLoaded;
  const serverEpoch = previewState.serverEpoch;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- listens to Awake's console: whether it shows this frame, and the links it hands the box's browser
  useEffect(() => {
    const stopShown = awakeConsoleBrowserPage()?.onShown(setShown);
    const stopLinks = awakeConsoleWebLinks()?.onOpen((url) => {
      linksHanded += 1;
      setLink({ url, id: linksHanded });
    });
    return () => {
      stopShown?.();
      stopLinks?.();
    };
  }, []);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tells Awake's console what the box's browser shows, once it knows the browser's tabs
  useEffect(() => {
    if (ready) awakeConsoleBrowserPage()?.reportPage(pageUrl);
  }, [ready, pageUrl]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- tells Awake's console the browser takes its links, after its first word on what it shows
  useEffect(() => {
    if (ready) void awakeConsoleWebLinks()?.setReady(true).catch(() => undefined);
  }, [ready]);

  const runtimeTabId = (tabId: string) => previewRuntimeTabId(threadRef, serverEpoch, tabId);
  const addBrowser = (profileId?: string) => {
    void addBrowserSurface({ threadRef, openPreview, profileId });
  };
  const activateTab = (surface: RightPanelSurface) => {
    useRightPanelStore.getState().activateSurface(threadRef, surface.id);
    if (surface.kind === "preview" && surface.resourceId) {
      setActivePreviewTab(threadRef, surface.resourceId);
    }
  };
  const moveTab = (surfaceId: string, toIndex: number) => {
    useRightPanelStore.getState().moveSurface(threadRef, surfaceId, toIndex);
  };
  const onLinkOpened = (id: number) => {
    setLink((current) => (current?.id === id ? undefined : current));
  };

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <RightPanelTabs
        mode="embedded"
        awakeAlone
        keybindings={keybindings}
        getShortcutContext={shortcutContext}
        surfaces={browserTabs}
        environmentId={props.environmentId}
        activeSurfaceId={shownTab?.id ?? NO_TAB}
        pendingSurfaceIds={NO_PENDING}
        previewSessions={previewState.sessions}
        desktopByTabId={previewState.desktopByTabId}
        previewRuntimeTabId={runtimeTabId}
        terminalLabelsById={NO_TERMINALS}
        onActivate={activateTab}
        onCloseSurface={surfaceClose.closeSurface}
        onCloseOtherSurfaces={surfaceClose.closeOtherSurfaces}
        onCloseSurfacesToRight={surfaceClose.closeSurfacesToRight}
        onCloseAllSurfaces={surfaceClose.closeAllSurfaces}
        onMoveSurface={moveTab}
        onCopyFilePath={nothing}
        onAddBrowser={() => addBrowser()}
        onAddBrowserInProfile={addBrowser}
        onAddTerminal={nothing}
        onAddDiff={nothing}
        onAddFiles={nothing}
        onAddPullRequest={nothing}
        onAddPullRequests={nothing}
        onAddDevice={nothing}
        browserAvailable={previewAvailable && canOperatePreview}
        terminalAvailable={false}
        diffAvailable={false}
        filesAvailable={false}
        pullRequestAvailable={false}
        pullRequestsAvailable={false}
        deviceAvailable={false}
      >
        <PreviewPanel
          mode="embedded"
          threadRef={threadRef}
          tabId={shownTab?.resourceId ?? null}
          visible={shown}
          awake={{ link, onLinkOpened }}
        />
      </RightPanelTabs>
    </main>
  );
}
