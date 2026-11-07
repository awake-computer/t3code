import { ProviderDriverKind, type ManagedPolicySummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  managedInstanceLocks,
  providerUnavailableLine,
  runtimeModeRefusal,
  runtimeModeUnavailableLine,
  webhookTasksUnavailableLine,
} from "./managedPolicy";

const codex = ProviderDriverKind.make("codex");
const claude = ProviderDriverKind.make("claudeAgent");
const antigravity = ProviderDriverKind.make("antigravity");

const policy: ManagedPolicySummary = {
  organization: "Example Corp",
  lockedSettings: [],
  limits: {
    providers: {
      lockedInstanceFields: {
        [codex]: ["config.binaryPath", "environment.OPENAI_BASE_URL", "environment.HTTPS_PROXY"],
      },
    },
  },
};

describe("managedInstanceLocks", () => {
  it("splits locked instance paths into config keys and environment names", () => {
    const locks = managedInstanceLocks(policy, codex);
    expect(locks && [...locks.configKeys]).toEqual(["binaryPath"]);
    expect(locks && [...locks.environmentNames]).toEqual(["OPENAI_BASE_URL", "HTTPS_PROXY"]);
    expect(locks?.reason).toBe("Managed by Example Corp.");
  });

  it("treats a bare environment path as every variable", () => {
    const ceilingPolicy = {
      ...policy,
      limits: {
        providers: { lockedInstanceFields: { [codex]: ["config.binaryPath", "environment"] } },
      },
    };
    const locks = managedInstanceLocks(ceilingPolicy, codex);
    expect(locks?.wholeEnvironment).toBe(true);
    expect(managedInstanceLocks(policy, codex)?.wholeEnvironment).toBe(false);
  });

  it("locks nothing for drivers the policy does not pin, or without a policy", () => {
    expect(managedInstanceLocks(policy, claude)).toBeUndefined();
    expect(managedInstanceLocks(undefined, codex)).toBeUndefined();
  });
});

describe("providerUnavailableLine", () => {
  const onlyClaude: ManagedPolicySummary = {
    ...policy,
    limits: { providers: { allowedDrivers: [claude] } },
  };

  it("names the organization that keeps a provider out, Antigravity as any other", () => {
    expect(providerUnavailableLine(onlyClaude, antigravity)).toBe("Not allowed by Example Corp");
    expect(providerUnavailableLine(onlyClaude, codex)).toBe("Not allowed by Example Corp");
  });

  it("says nothing of a provider the policy allows, or without a policy", () => {
    expect(providerUnavailableLine(onlyClaude, claude)).toBeUndefined();
    expect(providerUnavailableLine(policy, antigravity)).toBeUndefined();
    expect(providerUnavailableLine(undefined, antigravity)).toBeUndefined();
  });
});

describe("the marks of a mode above the ceiling", () => {
  const supervisedOnly: ManagedPolicySummary = {
    ...policy,
    limits: { maxRuntimeMode: "approval-required" },
  };

  it("names the organization whose ceiling keeps a mode out", () => {
    expect(runtimeModeUnavailableLine(supervisedOnly, "full-access")).toBe(
      "Not allowed by Example Corp",
    );
    expect(runtimeModeRefusal(supervisedOnly, "auto", "Auto")).toBe(
      "Auto is not allowed by Example Corp.",
    );
  });

  it("says nothing of a mode at or under the ceiling, or without one", () => {
    expect(runtimeModeUnavailableLine(supervisedOnly, "approval-required")).toBeUndefined();
    expect(runtimeModeRefusal(supervisedOnly, "approval-required", "Supervised")).toBeUndefined();
    expect(runtimeModeUnavailableLine(policy, "full-access")).toBeUndefined();
    expect(runtimeModeUnavailableLine(undefined, "full-access")).toBeUndefined();
  });
});

describe("webhookTasksUnavailableLine", () => {
  const noWebhooks: ManagedPolicySummary = { ...policy, limits: { webhookTasks: false } };

  it("names Awake Chat in its build, where the lock is Awake's, and the org elsewhere", () => {
    expect(webhookTasksUnavailableLine(noWebhooks, "Awake Chat")).toBe(
      "Webhook tasks are not available in Awake Chat.",
    );
    expect(webhookTasksUnavailableLine(noWebhooks, undefined)).toBe(
      "Webhook tasks are not allowed by Example Corp.",
    );
  });

  it("says nothing while the policy allows webhook tasks, or without a policy", () => {
    expect(webhookTasksUnavailableLine(policy, "Awake Chat")).toBeUndefined();
    expect(webhookTasksUnavailableLine(undefined, "Awake Chat")).toBeUndefined();
  });
});
