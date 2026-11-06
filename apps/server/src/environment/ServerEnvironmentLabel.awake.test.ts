import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

vi.mock(import("../config.ts"), async (original) => ({
  ...(await original()),
  awakeBuild: true,
}));

import { resolveAwakeBoxName } from "./ServerEnvironmentLabel.ts";

const withEnv = (env: Record<string, string>) =>
  Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ env }));

it.effect("names the environment after its box in Awake's build, and nothing else", () =>
  Effect.gen(function* () {
    const named = yield* resolveAwakeBoxName.pipe(withEnv({ AWAKE_BOX_NAME: " payments-api " }));
    assert.strictEqual(named, "payments-api");
    assert.isNull(yield* resolveAwakeBoxName.pipe(withEnv({ AWAKE_BOX_NAME: "   " })));
    assert.isNull(yield* resolveAwakeBoxName.pipe(withEnv({})));
  }),
);
