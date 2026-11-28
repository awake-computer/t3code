import { createFileRoute, redirect } from "@tanstack/react-router";

import { AwakeBrowserView } from "../components/AwakeBrowserView";

// Awake: the box's browser shown alone, which Awake's console frames in its Browser view.
export const Route = createFileRoute("/awake/browser")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: AwakeBrowserView,
});
