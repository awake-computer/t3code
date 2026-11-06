import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { vi } from "vite-plus/test";

vi.mock(import("../config.ts"), async (original) => ({
  ...(await original()),
  awakeBuild: true,
}));

import * as ServerConfig from "../config.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";
import * as AnalyticsService from "./AnalyticsService.ts";

it.layer(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer))("Awake's build", (it) => {
  it.effect("sends no usage data unless a setting asks for it, with no policy at all", () =>
    Effect.gen(function* () {
      const sent: Array<string> = [];
      const client = HttpClient.make((request) => {
        sent.push(request.url);
        return Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })),
        );
      });
      const layer = AnalyticsService.layer.pipe(
        Layer.provideMerge(
          ServerConfig.ServerConfig.layerTest(process.cwd(), { prefix: "t3-telemetry-awake-" }),
        ),
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({ T3CODE_POSTHOG_HOST: "http://localhost" }),
          ),
        ),
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(HostProcess.Platform, "linux"),
            Layer.succeed(HostProcess.Architecture, "x64"),
            Layer.succeed(HttpClient.HttpClient, client),
            ManagedPolicy.layerTest(),
          ),
        ),
      );

      yield* Effect.gen(function* () {
        const analytics = yield* AnalyticsService.AnalyticsService;
        yield* analytics.record("test.awake", { index: 1 });
        yield* analytics.flush;
      }).pipe(Effect.provide(layer));

      assert.isTrue(ServerConfig.awakeBuild);
      assert.deepEqual(sent, []);
    }),
  );
});
