import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const dialog = vi.hoisted(() => ({ answer: vi.fn() }));
vi.mock("./confirmDialog", () => ({ requestConfirmDialog: dialog.answer }));

import { AGENT_LINK_QUESTION, confirmAgentLink } from "./agentLinks";

const href = "https://example.com/release-notes";

describe("confirmAgentLink", () => {
  beforeEach(() => dialog.answer.mockReset());

  it("asks with the link in view, and opens it only on a yes", async () => {
    const open = vi.fn();
    dialog.answer.mockResolvedValueOnce(true);
    expect(await confirmAgentLink(href, open)).toBe(true);
    expect(dialog.answer).toHaveBeenCalledWith(`${AGENT_LINK_QUESTION}\n\n${href}`);
    expect(open).toHaveBeenCalledWith(href);

    open.mockReset();
    dialog.answer.mockResolvedValueOnce(false);
    expect(await confirmAgentLink(href, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it("leaves the link closed when there is no dialog to ask in", async () => {
    const open = vi.fn();
    dialog.answer.mockReturnValueOnce(undefined);
    expect(await confirmAgentLink(href, open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
