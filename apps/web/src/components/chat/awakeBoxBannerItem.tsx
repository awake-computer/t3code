import { type AwakeBoxBanner, type AwakeBoxState, awakeLinkTarget } from "../../awakeBoxState";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/**
 * T3 Code's banner for the box's own connection, in Awake's words for what its gateway observes:
 * a box waking keeps T3 Code's actions, and one Chat can't wake adds the way back to Awake.
 */
export function withAwakeBox(
  item: ComposerBannerStackItem,
  words: AwakeBoxBanner,
  box: AwakeBoxState | null,
): ComposerBannerStackItem {
  const open = box?.open ?? null;
  if (words.waiting || open === null) {
    return { ...item, title: words.title, description: words.description };
  }
  const link = <a href={open} target={awakeLinkTarget()} rel="noopener noreferrer" />;
  return {
    ...item,
    title: words.title,
    description: words.description,
    actions: (
      <>
        <Button size="xs" variant="ghost" render={link}>
          Open in Awake
        </Button>
        {item.actions}
      </>
    ),
  };
}
