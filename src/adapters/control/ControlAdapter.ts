import { IntentResult } from "../../core/intents";

export interface ControlAdapter {
  onWake(callback: () => void): void;
  onReset(callback: () => void): void;
  onPushToTalkStart?(callback: () => void): void;
  onPushToTalkEnd?(callback: () => void): void;
  handleTranscript(
    text: string,
    isFinal: boolean,
    wakeActive: boolean
  ): IntentResult | null;
}
