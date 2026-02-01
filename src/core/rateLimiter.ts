import { SpeechPriority } from "./priorityQueue";

export type RateLimitDecision = {
  allowed: boolean;
  reason: string;
};

export class RateLimiter {
  private lastSpokenAt = 0;
  private hazardCooldowns = new Map<string, number>();
  private cooldownMs: number;
  private hazardRepeatMs: number;

  constructor(cooldownMs = 8000, hazardRepeatMs = 20000) {
    this.cooldownMs = cooldownMs;
    this.hazardRepeatMs = hazardRepeatMs;
  }

  shouldSpeak(priority: SpeechPriority, hazardKey?: string): RateLimitDecision {
    const now = Date.now();

    if (hazardKey) {
      const lastHazard = this.hazardCooldowns.get(hazardKey) ?? 0;
      if (now - lastHazard < this.hazardRepeatMs) {
        return { allowed: false, reason: "suppressed repeated hazard" };
      }
    }

    if (priority !== "CRITICAL" && now - this.lastSpokenAt < this.cooldownMs) {
      return { allowed: false, reason: "suppressed by cooldown" };
    }

    return { allowed: true, reason: "allowed" };
  }

  recordSpeak(priority: SpeechPriority, hazardKey?: string) {
    const now = Date.now();
    if (priority !== "CRITICAL") {
      this.lastSpokenAt = now;
    } else {
      this.lastSpokenAt = Math.max(this.lastSpokenAt, now);
    }
    if (hazardKey) {
      this.hazardCooldowns.set(hazardKey, now);
    }
  }
}
