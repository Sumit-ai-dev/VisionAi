export type SpeechPriority = "CRITICAL" | "HIGH" | "NORMAL";

export type SpeechQueueItem = {
  text: string;
  priority: SpeechPriority;
  reason: string;
};

type InternalQueueItem = SpeechQueueItem & { seq: number };

const PRIORITY_RANK: Record<SpeechPriority, number> = {
  CRITICAL: 3,
  HIGH: 2,
  NORMAL: 1
};

export class PriorityQueue {
  private items: InternalQueueItem[] = [];
  private sequence = 0;

  enqueue(item: SpeechQueueItem) {
    this.items.push({ ...item, seq: this.sequence++ });
    this.items.sort((a, b) => {
      const priorityDelta = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      return a.seq - b.seq;
    });
  }

  clear() {
    this.items = [];
  }

  dequeue(): SpeechQueueItem | undefined {
    const item = this.items.shift();
    if (!item) {
      return undefined;
    }
    const { seq: _seq, ...rest } = item;
    return rest;
  }

  get size() {
    return this.items.length;
  }
}
