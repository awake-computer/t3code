import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { releaseWhileHidden } from "./hiddenRelease.ts";
import * as EnvironmentRegistry from "./registry.ts";

const start = Effect.gen(function* () {
  const hidden = yield* Queue.unbounded<boolean>();
  const releases = yield* Queue.unbounded<boolean>();
  const registry = EnvironmentRegistry.EnvironmentRegistry.of({
    setReleased: (released: boolean) => Queue.offer(releases, released).pipe(Effect.asVoid),
  } as unknown as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  yield* releaseWhileHidden(Stream.fromQueue(hidden), "15 minutes").pipe(
    Effect.provideService(EnvironmentRegistry.EnvironmentRegistry, registry),
    Effect.forkScoped,
  );
  // Shown, then hidden in one batch: the shown page's call means the wait has begun.
  yield* Queue.offerAll(hidden, [false, true]);
  expect(yield* Queue.take(releases)).toBe(false);
  return { hidden, releases };
});

describe("releaseWhileHidden", () => {
  it.effect("lets the connections go once the page stays hidden for the whole wait", () =>
    Effect.gen(function* () {
      const { hidden, releases } = yield* start;

      yield* TestClock.adjust("14 minutes");
      expect(yield* Queue.size(releases)).toBe(0);
      yield* TestClock.adjust("1 minute");
      expect(yield* Queue.take(releases)).toBe(true);

      yield* Queue.offer(hidden, false);
      expect(yield* Queue.take(releases)).toBe(false);
    }).pipe(Effect.scoped),
  );

  it.effect("keeps the connections when the page shows before the wait ends", () =>
    Effect.gen(function* () {
      const { hidden, releases } = yield* start;

      yield* TestClock.adjust("14 minutes");
      yield* Queue.offer(hidden, false);
      expect(yield* Queue.take(releases)).toBe(false);
      yield* TestClock.adjust("1 hour");
      expect(yield* Queue.size(releases)).toBe(0);
    }).pipe(Effect.scoped),
  );
});
