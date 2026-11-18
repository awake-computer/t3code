import { EnvironmentId, ThreadId, TurnItemId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import "~/index.css";
import { render } from "../../../test/render";

const APP_HTML = `<script>
parent.postMessage({ jsonrpc: "2.0", method: "ui/notifications/initialized" }, "*");
</script>`;

vi.mock(import("~/assets/longLivedAssetUrls"), () => ({
  useLongLivedAssetUrl: () => ({
    _tag: "Success",
    url: `data:text/html,${encodeURIComponent(APP_HTML)}`,
    expiresAt: Date.now() + 60 * 60_000,
  }),
}));

vi.mock(import("~/branding"), async (original) => ({
  ...(await original()),
  IS_AWAKE_BRAND: true,
}));

import { McpAppFrame } from "./McpAppFrame";

it("hands an app's frame no camera, microphone or location in Awake's build", async () => {
  await using screen = await render(
    <McpAppFrame
      environmentId={EnvironmentId.make("environment")}
      threadId={ThreadId.make("thread")}
      conversationThreadId={ThreadId.make("thread")}
      itemId={TurnItemId.make("item")}
      revision="1"
      app={{
        attachmentId: "attachment",
        server: "Demo",
        tool: "show",
        resourceUri: "ui://demo/app",
        permissions: { camera: {}, microphone: {}, geolocation: {}, clipboardWrite: {} },
      }}
      onSendMessage={undefined}
    />,
  );
  const frame = screen.getByTitle("Demo app");
  // The origin stays opaque here too: nothing of Awake's widens the sandbox.
  await expect.element(frame).toHaveAttribute("sandbox", "allow-scripts allow-forms");
  await expect.element(frame).toHaveAttribute("allow", "clipboard-write");
});
