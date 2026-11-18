import { userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { ProviderEnabledSwitch, ProviderEnvironmentSection } from "./ProviderInstanceCard";

const savedSecret = {
  name: "FAKE_API_KEY",
  value: "",
  sensitive: true,
  valueRedacted: true,
} as const;

describe("ProviderEnvironmentSection saved secrets", () => {
  it("requires a replacement before renaming or unlocking a stored secret", async () => {
    const onChange = vi.fn();
    await using screen = await render(
      <ProviderEnvironmentSection environment={[savedSecret]} onChange={onChange} />,
    );
    const name = screen.getByRole("textbox", { name: "Environment variable name 1" });
    const value = screen.getByLabelText("Environment variable value 1");
    const lock = screen.getByRole("button", {
      name: "Mark environment variable FAKE_API_KEY as sensitive",
    });

    await expect.element(name).toBeDisabled();
    await expect.element(lock).toBeDisabled();
    await userEvent.fill(value, "unused-draft");
    await userEvent.clear(value);
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
    await expect.element(name).toBeDisabled();
    await expect.element(lock).toBeDisabled();

    await userEvent.fill(value, "fake-replacement");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith([
      { ...savedSecret, value: "fake-replacement", valueRedacted: false },
    ]);
    await expect.element(name).toBeEnabled();
    await expect.element(lock).toBeEnabled();
    await userEvent.fill(name, "RENAMED_KEY");
    await userEvent.tab();
    await userEvent.click(
      screen.getByRole("button", { name: "Mark environment variable RENAMED_KEY as sensitive" }),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { name: "RENAMED_KEY", value: "fake-replacement", sensitive: false, valueRedacted: false },
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Remove environment variable RENAMED_KEY" }),
    );
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("ProviderEnabledSwitch", () => {
  it("says why in the switch's place while a provider the policy forbids is off", async () => {
    const onChange = vi.fn();
    const row = (enabled: boolean, unavailable: string | undefined) => (
      <ProviderEnabledSwitch
        displayName="Antigravity"
        enabled={enabled}
        disabled={false}
        unavailable={unavailable}
        onChange={onChange}
      />
    );
    await using screen = await render(row(false, "Not allowed by Northwind"));
    await expect.element(screen.getByText("Not allowed by Northwind")).toBeVisible();
    expect(screen.container.querySelector('[role="switch"]')).toBeNull();

    // Unstyled here, the switch has no size, so this checks its state rather than clicking it.
    const toggle = screen.getByRole("switch", { name: "Enable Antigravity" });
    await screen.rerender(row(true, "Not allowed by Northwind"));
    await expect.element(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.container.textContent).not.toContain("Not allowed by Northwind");

    await screen.rerender(row(false, undefined));
    await expect.element(toggle).toHaveAttribute("aria-checked", "false");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ProviderEnvironmentSection external settings writes", () => {
  it("keeps a typed unpublished row when an external write redelivers the environment", async () => {
    const onChange = vi.fn();
    await using screen = await render(
      <ProviderEnvironmentSection environment={[]} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Add variable" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Environment variable name 1" }),
      "KEEP_ME_TYPED",
    );
    expect(onChange).not.toHaveBeenCalled();

    // A settings write from elsewhere on the instance redelivers a redacted, stored variable.
    await screen.rerender(
      <ProviderEnvironmentSection
        environment={[{ name: "OTHER_VAR", value: "", sensitive: true, valueRedacted: true }]}
        onChange={onChange}
      />,
    );

    await expect
      .element(screen.getByRole("textbox", { name: "Environment variable name 2" }))
      .toHaveValue("KEEP_ME_TYPED");
  });

  it("does not duplicate a redacted published row on the sibling reseed", async () => {
    const onChange = vi.fn();
    await using screen = await render(
      <ProviderEnvironmentSection environment={[]} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Add variable" }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Environment variable name 1" }),
      "STORE_ME",
    );
    await userEvent.fill(screen.getByLabelText("Environment variable value 1"), "fake-secret");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith([
      { name: "STORE_ME", value: "fake-secret", sensitive: true, valueRedacted: false },
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Add variable" }));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Environment variable name 2" }),
      "UNPUBLISHED_ONE",
    );

    // The stored secret comes back redacted, so the rows reseed without matching the echo.
    await screen.rerender(
      <ProviderEnvironmentSection
        environment={[{ name: "STORE_ME", value: "", sensitive: true, valueRedacted: true }]}
        onChange={onChange}
      />,
    );

    await expect
      .element(screen.getByRole("textbox", { name: "Environment variable name 1" }))
      .toHaveValue("STORE_ME");
    await expect
      .element(screen.getByRole("textbox", { name: "Environment variable name 2" }))
      .toHaveValue("UNPUBLISHED_ONE");
  });

  it("keeps a committed but unpublishable row across an external write", async () => {
    const onChange = vi.fn();
    await using screen = await render(
      <ProviderEnvironmentSection environment={[]} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Add variable" }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Environment variable name 1" }),
      "KEEP-ME",
    );
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();

    await screen.rerender(
      <ProviderEnvironmentSection
        environment={[{ name: "OTHER_VAR", value: "", sensitive: true, valueRedacted: true }]}
        onChange={onChange}
      />,
    );
    await expect
      .element(screen.getByRole("textbox", { name: "Environment variable name 2" }))
      .toHaveValue("KEEP-ME");
  });

  it("drops an acknowledged row when an external write removes it", async () => {
    const onChange = vi.fn();
    await using screen = await render(
      <ProviderEnvironmentSection environment={[]} onChange={onChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Add variable" }));
    await userEvent.fill(
      screen.getByRole("textbox", { name: "Environment variable name 1" }),
      "PUBLISH_ME",
    );
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith([{ name: "PUBLISH_ME", value: "", sensitive: true }]);

    // The server echo acknowledges the publish and keeps the rows; nothing is republished.
    await screen.rerender(
      <ProviderEnvironmentSection
        environment={[{ name: "PUBLISH_ME", value: "", sensitive: true }]}
        onChange={onChange}
      />,
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    const acknowledged = screen.getByRole("textbox", { name: "Environment variable name 1" });

    // Another client deletes the variable. The row must not come back.
    await screen.rerender(<ProviderEnvironmentSection environment={[]} onChange={onChange} />);
    await expect.element(acknowledged).not.toBeInTheDocument();
  });
});
