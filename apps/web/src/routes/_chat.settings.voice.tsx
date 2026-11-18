import { createFileRoute, redirect } from "@tanstack/react-router";

import { VoiceSettingsPanel } from "../components/settings/VoiceSettingsPanel";
import { voiceControlsShown } from "../speech/voiceControls";

export const Route = createFileRoute("/_chat/settings/voice")({
  beforeLoad: () => {
    if (!voiceControlsShown()) throw redirect({ to: "/settings/general", replace: true });
  },
  component: VoiceSettingsPanel,
});
