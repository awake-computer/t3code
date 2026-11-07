import {
  AuthTerminalOperateScope,
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { memo, useRef, useState } from "react";
import { InfoIcon, TerminalIcon, XIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Button, InlineButton } from "../ui/button";
import { formatProviderDriverKindLabel } from "../../providerModels";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { RefreshIcon } from "../ui/refresh-icon";
import { IS_AWAKE_BRAND } from "../../branding";
import { awakeSignInCommand, offersAwakeSignIn } from "../../awakeSignIn";
import { CommandBlock } from "../CommandBlock";

function getIncompatibleVersion(status: ServerProvider) {
  const compatibility = status.compatibilityAdvisory;
  if (status.status === "error" && status.auth.status === "unauthenticated") return null;
  return compatibility?.status === "broken" ||
    (status.status === "ready" && compatibility?.status === "unsupported")
    ? compatibility
    : null;
}

export function getProviderStatusBannerKey(status: ServerProvider | null): string | null {
  if (!status || status.status === "disabled") return null;
  const incompatible = getIncompatibleVersion(status);
  if (incompatible) {
    return [
      status.instanceId,
      incompatible.status,
      status.version ?? "",
      incompatible.message ?? "",
    ].join("\u0000");
  }
  if (status.status === "ready") return null;
  // Antigravity validates credentials at session start; unknown restart auth is not failure.
  if (
    status.driver === "antigravity" &&
    status.installed &&
    status.status === "warning" &&
    status.auth.status === "unknown"
  ) {
    return null;
  }
  return [status.instanceId, status.status, status.auth.status, status.message ?? ""].join(
    "\u0000",
  );
}

export function shouldShowProviderStatusBanner(
  status: ServerProvider | null,
  dismissedBannerKey: string | null,
): boolean {
  const bannerKey = getProviderStatusBannerKey(status);
  return bannerKey !== null && bannerKey !== dismissedBannerKey;
}

export function hasProviderSetup(status: ServerProvider): boolean {
  return (
    status.driver === "antigravity" ||
    status.setup?.canAuthenticate === true ||
    status.setup?.canInstall === true
  );
}

export function getProviderStatusMessage(status: ServerProvider, awake = IS_AWAKE_BRAND): string {
  if (
    status.auth.status !== "unauthenticated" &&
    status.compatibilityAdvisory?.status === "broken" &&
    status.compatibilityAdvisory.message
  ) {
    return status.compatibilityAdvisory.message;
  }
  const providerName = status.displayName?.trim() || formatProviderDriverKindLabel(status.driver);
  // Ahead of the server's own words, which name a sign-in a box's agents don't use.
  if (awake && status.auth.status === "unauthenticated") {
    return `Sign in to ${providerName} in Terminal, then come back here.`;
  }
  if (status.message) return status.message;
  if (!status.installed && hasProviderSetup(status)) {
    return `Open provider setup to install ${formatProviderDriverKindLabel(status.driver)} on this environment.`;
  }
  if (status.auth.status === "unauthenticated") {
    if (hasProviderSetup(status)) {
      return status.driver === "antigravity"
        ? "Open provider setup to sign in with Google."
        : "Open provider setup to sign in.";
    }
    return "Sign in via the CLI to authenticate again.";
  }
  return status.status === "ready"
    ? "No models are available for this provider."
    : status.status === "error"
      ? `${providerName} provider is unavailable.`
      : `${providerName} provider has limited availability.`;
}

export const ProviderStatusBanner = memo(function ProviderStatusBanner({
  environmentId,
  onDismiss,
  onOpenProviderSetup,
  onSignIn,
  status,
}: {
  environmentId: EnvironmentId;
  onDismiss: () => void;
  onOpenProviderSetup?: (instanceId: ProviderInstanceId) => void;
  /** Awake's build: runs the agent's own login in this thread's terminal drawer. */
  onSignIn?: (status: ServerProvider) => Promise<void>;
  status: ServerProvider | null;
}) {
  const canRefresh = useAtomValue(serverEnvironment.refreshProviders.permissionAtom(environmentId));
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    label: "Refresh provider status",
  });
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const refreshingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const signingInRef = useRef(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const refresh = async () => {
    if (!status || !canRefresh || refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    await refreshProviders({
      environmentId,
      input: { instanceId: status.instanceId, refreshModels: true },
    });
    refreshingRef.current = false;
    setIsRefreshing(false);
  };

  const signIn = async () => {
    if (!status || !onSignIn || signingInRef.current) return;
    signingInRef.current = true;
    setIsSigningIn(true);
    // The sign-in reports its own failures; the button only waits for it.
    await onSignIn(status).catch(() => undefined);
    signingInRef.current = false;
    setIsSigningIn(false);
  };

  if (!status || getProviderStatusBannerKey(status) === null) {
    return null;
  }

  const providerName = status.displayName?.trim() || formatProviderDriverKindLabel(status.driver);
  const isUnauthenticated = status.status === "error" && status.auth.status === "unauthenticated";
  const incompatible = getIncompatibleVersion(status);
  const title = isUnauthenticated
    ? `${providerName} is unauthenticated`
    : incompatible
      ? `${providerName} ${status.version ?? ""} is ${incompatible.status === "broken" ? "known to be broken" : "unsupported"}`
      : `${providerName} provider status`;
  const signInCommand =
    isUnauthenticated && serverConfig !== null
      ? awakeSignInCommand(status, serverConfig.settings, serverConfig.environment.platform.os)
      : undefined;
  const signsInHere =
    onSignIn !== undefined &&
    signInCommand !== undefined &&
    canOperateTerminal &&
    offersAwakeSignIn(status);
  const message =
    incompatible?.message ??
    (signsInHere
      ? `Sign in opens a terminal here and runs ${providerName}'s own login.`
      : getProviderStatusMessage(status));
  const isWarning =
    incompatible?.status !== "broken" && (status.status === "warning" || incompatible !== null);
  // Awake's build signs agents in with their own CLI, so it offers no provider setup for it.
  const offersSetup = !(IS_AWAKE_BRAND && isUnauthenticated) && hasProviderSetup(status);

  return (
    <div className="pointer-events-auto mx-auto w-fit max-w-[calc(100%-2rem)] pt-3">
      <Alert
        variant={isWarning ? "warning" : "error"}
        role={incompatible && incompatible.status !== "broken" ? "status" : "alert"}
        surface="glass"
        controlAlignment="first-line"
      >
        <InfoIcon />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-2">
            <Tooltip>
              <TooltipTrigger render={<div className="line-clamp-3" />}>{message}</TooltipTrigger>
              <TooltipPopup side="top" className="whitespace-pre-wrap">
                {message}
              </TooltipPopup>
            </Tooltip>
            {signInCommand === undefined ? null : <CommandBlock command={signInCommand} />}
            <div className="flex flex-wrap items-center justify-end gap-3">
              {onOpenProviderSetup && offersSetup ? (
                <InlineButton onClick={() => onOpenProviderSetup(status.instanceId)}>
                  Open provider setup
                </InlineButton>
              ) : null}
              {signsInHere ? (
                <Button
                  aria-label={`Sign in to ${providerName}`}
                  disabled={isSigningIn}
                  onClick={() => void signIn()}
                  size="xs"
                  variant="outline"
                >
                  <TerminalIcon />
                  Sign in
                </Button>
              ) : null}
              <Button
                aria-label={`Refresh ${providerName} provider status`}
                disabled={!canRefresh || isRefreshing}
                onClick={() => void refresh()}
                size="xs"
                variant="outline"
              >
                <RefreshIcon />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
        </AlertDescription>
        <AlertAction>
          <Button
            aria-label={`Dismiss ${providerName} provider ${status.status}`}
            onClick={onDismiss}
            size="icon-xs"
            variant="ghost-muted"
          >
            <XIcon />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
});
