import { AwarenessConfig } from "./awarenessConfig";

export type AwarenessTickContext = {
  tickId: number;
  startedAt: number;
  intervalMs: number;
  mode: AwarenessConfig["mode"];
};

type AwarenessTickHandler = (context: AwarenessTickContext) => Promise<void> | void;

export class AwarenessController {
  private config: AwarenessConfig;
  private onTick: AwarenessTickHandler;
  private running = false;
  private timer: number | null = null;
  private tickCounter = 0;
  private runId = 0;

  constructor(config: AwarenessConfig, onTick: AwarenessTickHandler) {
    this.config = config;
    this.onTick = onTick;
  }

  updateConfig(update: Partial<AwarenessConfig>) {
    this.config = { ...this.config, ...update };
  }

  isRunning() {
    return this.running;
  }

  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    this.runId += 1;
    this.tickCounter = 0;
    this.scheduleNext(0);
  }

  stop() {
    this.running = false;
    this.runId += 1;
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number) {
    if (!this.running) {
      return;
    }
    if (this.timer) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick() {
    if (!this.running) {
      return;
    }
    const currentRun = this.runId;
    const context: AwarenessTickContext = {
      tickId: this.tickCounter,
      startedAt: Date.now(),
      intervalMs: this.config.intervalMs,
      mode: this.config.mode
    };
    this.tickCounter += 1;
    await this.onTick(context);
    if (!this.running || this.runId !== currentRun) {
      return;
    }
    this.scheduleNext(this.config.intervalMs);
  }
}
