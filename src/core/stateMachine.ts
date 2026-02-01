export type AppState =
  | "IDLE_LISTENING"
  | "WAKE_DETECTED"
  | "CAPTURING"
  | "THINKING"
  | "SPEAKING"
  | "ERROR";

type Listener = (state: AppState, prev: AppState) => void;

export class StateMachine {
  private currentState: AppState;
  private listeners: Listener[] = [];
  private log: (message: string) => void;

  constructor(initial: AppState, log: (message: string) => void) {
    this.currentState = initial;
    this.log = log;
  }

  get state() {
    return this.currentState;
  }

  onChange(listener: Listener) {
    this.listeners.push(listener);
  }

  transition(next: AppState, reason: string) {
    const prev = this.currentState;
    if (prev === next) {
      return;
    }
    this.currentState = next;
    this.log(`Transition: ${prev} → ${next} (${reason})`);
    this.listeners.forEach((listener) => listener(next, prev));
  }
}
