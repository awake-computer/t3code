import { requestConfirmDialog } from "./confirmDialog";

/** The question Awake's build asks before it follows a link an agent wrote into a thread. */
export const AGENT_LINK_QUESTION = "Open this link? An agent wrote it, so check where it goes.";

function openInNewTab(href: string): void {
  window.open(href, "_blank", "noopener,noreferrer");
}

/** Asks first, and opens the link only on a yes; with no dialog to ask in, it stays closed. */
export async function confirmAgentLink(href: string, open = openInNewTab): Promise<boolean> {
  const confirmed = await requestConfirmDialog(`${AGENT_LINK_QUESTION}\n\n${href}`);
  if (confirmed !== true) return false;
  open(href);
  return true;
}
