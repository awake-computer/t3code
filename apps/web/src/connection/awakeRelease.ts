import { releaseWhileHidden } from "@t3tools/client-runtime/connection";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { IS_AWAKE_BRAND } from "../branding";

/** How long Awake Chat, in a tab of its own, holds its box's connection while hidden. */
export const AWAKE_HIDDEN_RELEASE_AFTER = "15 minutes";

const pageHidden = Stream.callback<boolean>((queue) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const listener = () => Queue.offerUnsafe(queue, document.visibilityState === "hidden");
      document.addEventListener("visibilitychange", listener);
      listener();
      return listener;
    }),
    (listener) =>
      Effect.sync(() => {
        document.removeEventListener("visibilitychange", listener);
      }),
  ).pipe(Effect.asVoid),
);

/** In the console's frame the console decides when Chat runs, so only a tab of its own lets go. */
export function releasesWhileHidden(input: {
  readonly awake: boolean;
  readonly embedded: boolean;
}): boolean {
  return input.awake && !input.embedded;
}

export function makeLayer(input: {
  readonly awake: boolean;
  readonly embedded: boolean;
  readonly hidden: Stream.Stream<boolean>;
}) {
  return Layer.effectDiscard(
    Effect.gen(function* () {
      if (!releasesWhileHidden(input)) return;
      yield* releaseWhileHidden(input.hidden, AWAKE_HIDDEN_RELEASE_AFTER).pipe(Effect.forkScoped);
    }),
  );
}

export const layer = Layer.unwrap(
  Effect.sync(() =>
    makeLayer({
      awake: IS_AWAKE_BRAND && typeof document !== "undefined",
      embedded: typeof window !== "undefined" && window.parent !== window,
      hidden: pageHidden,
    }),
  ),
);
