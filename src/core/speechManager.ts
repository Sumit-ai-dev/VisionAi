import { PriorityQueue, SpeechPriority, SpeechQueueItem } from "./priorityQueue";

type SpeechManagerCallbacks = {
  send: (text: string) => void;
  cancel: () => void;
  onStart: (item: SpeechQueueItem) => void;
};

export class SpeechManager {
  private queue = new PriorityQueue();
  private speaking = false;
  private callbacks: SpeechManagerCallbacks;

  constructor(callbacks: SpeechManagerCallbacks) {
    this.callbacks = callbacks;
  }

  isSpeaking() {
    return this.speaking;
  }

  speak(text: string, priority: SpeechPriority, reason: string) {
    if (priority === "CRITICAL" && this.speaking) {
      this.interruptAndSpeak(text, reason);
      return;
    }
    this.queue.enqueue({ text, priority, reason });
    this.flushQueue();
  }

  interruptAndSpeak(text: string, reason: string) {
    this.queue.clear();
    if (this.speaking) {
      this.callbacks.cancel();
      this.speaking = false;
    }
    this.queue.enqueue({ text, priority: "CRITICAL", reason });
    this.flushQueue();
  }

  handleSpeechDone() {
    this.speaking = false;
    this.flushQueue();
  }

  private flushQueue() {
    if (this.speaking) {
      return;
    }
    const next = this.queue.dequeue();
    if (!next) {
      return;
    }
    this.speaking = true;
    this.callbacks.onStart(next);
    this.callbacks.send(next.text);
  }
}
