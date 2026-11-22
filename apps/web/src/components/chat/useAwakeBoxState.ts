import { useEffect, useState } from "react";

import { type AwakeBoxState, fetchAwakeBoxState, nextAwakeBoxState } from "../../awakeBoxState";

/** How often Chat asks Awake's gateway about its box while it reconnects and its tab shows. */
export const AWAKE_BOX_POLL_MS = 2_000;

/**
 * What Awake's gateway observes of the box while `active`, asked at once and then every
 * AWAKE_BOX_POLL_MS while the tab shows; null until it answers, and whenever inactive.
 */
export function useAwakeBoxState(
  active: boolean,
  consoleOrigin: string | undefined,
): AwakeBoxState | null {
  const [box, setBox] = useState<AwakeBoxState | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- asks the gateway while Chat reconnects, so the banner says what the box's cell observes
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      if (document.visibilityState !== "hidden") {
        const next = await fetchAwakeBoxState(consoleOrigin);
        if (stopped) return;
        setBox((prev) => nextAwakeBoxState(prev, next));
      }
      if (!stopped) timer = setTimeout(() => void ask(), AWAKE_BOX_POLL_MS);
    };
    // oxlint-disable-next-line react/set-state-in-effect -- State changes only after the gateway answers.
    void ask();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [active, consoleOrigin]);
  return active ? box : null;
}
