import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { AWAKE_HIDDEN_RELEASE_AFTER, makeLayer, releasesWhileHidden } from "./awakeRelease.ts";

const start = (input: { readonly awake: boolean; readonly embedded: boolean }) =>
  Effect.gen(function* () {
    const hidden = yield* Queue.unbounded<boolean>();
    const releases = yield* Queue.unbounded<boolean>();
    const registry = EnvironmentRegistry.EnvironmentRegistry.of({
      setReleased: (released: boolean) => Queue.offer(releases, released).pipe(Effect.asVoid),
    } as unknown as EnvironmentRegistry.EnvironmentRegistry["Service"]);
    yield* Layer.build(
      makeLayer({ ...input, hidden: Stream.fromQueue(hidden) }).pipe(
        Layer.provide(Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, registry)),
      ),
    );
    return { hidden, releases };
  });

describe("Awake Chat's hidden-tab release", () => {
  it("applies to Awake's build in a tab of its own only", () => {
    expect(AWAKE_HIDDEN_RELEASE_AFTER).toBe("15 minutes");
    expect(releasesWhileHidden({ awake: true, embedded: false })).toBe(true);
    expect(releasesWhileHidden({ awake: true, embedded: true })).toBe(false);
    expect(releasesWhileHidden({ awake: false, embedded: false })).toBe(false);
  });

  it.effect("lets the box go after 15 minutes hidden and takes it back when shown", () =>
    Effect.gen(function* () {
      const { hidden, releases } = yield* start({ awake: true, embedded: false });
      yield* Queue.offerAll(hidden, [false, true]);
      expect(yield* Queue.take(releases)).toBe(false);

      yield* TestClock.adjust("14 minutes");
      expect(yield* Queue.size(releases)).toBe(0);
      yield* TestClock.adjust("1 minute");
      expect(yield* Queue.take(releases)).toBe(true);

      yield* Queue.offer(hidden, false);
      expect(yield* Queue.take(releases)).toBe(false);
    }).pipe(Effect.scoped),
  );

  it.effect("keeps the box while embedded in the console", () =>
    Effect.gen(function* () {
      const { hidden, releases } = yield* start({ awake: true, embedded: true });
      yield* Queue.offerAll(hidden, [false, true]);
      yield* TestClock.adjust("1 hour");
      expect(yield* Queue.size(releases)).toBe(0);
    }).pipe(Effect.scoped),
  );
});
