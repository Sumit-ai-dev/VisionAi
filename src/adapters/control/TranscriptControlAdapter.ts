import { routeIntent } from "../../core/intentRouter";
import { IntentResult, IntentType } from "../../core/intents";
import { ControlAdapter } from "./ControlAdapter";

export class TranscriptControlAdapter implements ControlAdapter {
  private wakeCallbacks: Array<() => void> = [];
  private resetCallbacks: Array<() => void> = [];

  onWake(callback: () => void): void {
    this.wakeCallbacks.push(callback);
  }

  onReset(callback: () => void): void {
    this.resetCallbacks.push(callback);
  }

  handleTranscript(
    text: string,
    isFinal: boolean,
    wakeActive: boolean
  ): IntentResult | null {
    const result = routeIntent(text, wakeActive);
    if (!isFinal) {
      return null;
    }
    if (result.intent === IntentType.WAKE) {
      this.wakeCallbacks.forEach((callback) => callback());
    }
    return result;
  }
}
