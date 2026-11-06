import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberHandle from "effect/FiberHandle";
import * as Stream from "effect/Stream";

import * as EnvironmentRegistry from "./registry.ts";

/**
 * Releases the registry's connections once the page has stayed hidden for `after`, and takes
 * them back as soon as it shows again. `hidden` starts with the page's current state.
 */
export const releaseWhileHidden = Effect.fn("connection.releaseWhileHidden")(function* (
  hidden: Stream.Stream<boolean>,
  after: Duration.Input,
) {
  const registry = yield* EnvironmentRegistry.EnvironmentRegistry;
  const wait = yield* FiberHandle.make<void>();
  // Showing the page cancels the wait; a release already under way finishes first.
  const release = Effect.sleep(after).pipe(
    Effect.andThen(Effect.uninterruptible(registry.setReleased(true))),
  );
  yield* hidden.pipe(
    Stream.changes,
    Stream.runForEach((isHidden) =>
      isHidden
        ? FiberHandle.run(wait, release).pipe(Effect.asVoid)
        : FiberHandle.clear(wait).pipe(Effect.andThen(registry.setReleased(false))),
    ),
  );
});
