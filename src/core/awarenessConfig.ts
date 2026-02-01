import { VisionMode } from "./intents";

export const AWARENESS_INTERVAL_RANGE_MS = {
  min: 3000,
  max: 10000
};

export type AwarenessConfig = {
  enabled: boolean;
  intervalMs: number;
  mode: VisionMode;
};

export const createAwarenessConfig = (): AwarenessConfig => ({
  enabled: false,
  intervalMs: 5000,
  mode: "ahead"
});

export const clampAwarenessInterval = (value: number) =>
  Math.min(AWARENESS_INTERVAL_RANGE_MS.max, Math.max(AWARENESS_INTERVAL_RANGE_MS.min, value));
