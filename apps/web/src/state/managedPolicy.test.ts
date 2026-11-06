import { ProviderDriverKind, type ManagedPolicySummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { managedInstanceLocks, providerUnavailableLine } from "./managedPolicy";

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

  it("names who keeps a provider out: Awake for Antigravity in its build, else the org", () => {
    expect(providerUnavailableLine(onlyClaude, antigravity, "Awake Chat")).toBe(
      "Not available in Awake Chat",
    );
    expect(providerUnavailableLine(onlyClaude, codex, "Awake Chat")).toBe(
      "Not allowed by Example Corp",
    );
    expect(providerUnavailableLine(onlyClaude, antigravity, undefined)).toBe(
      "Not allowed by Example Corp",
    );
  });

  it("says nothing of a provider the policy allows, or without a policy", () => {
    expect(providerUnavailableLine(onlyClaude, claude, "Awake Chat")).toBeUndefined();
    expect(providerUnavailableLine(policy, antigravity, "Awake Chat")).toBeUndefined();
    expect(providerUnavailableLine(undefined, antigravity, "Awake Chat")).toBeUndefined();
  });
});
