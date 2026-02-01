import { describe, expect, it, vi } from "vitest";
import { WebAudioAdapter } from "./WebAudioAdapter";

const createAudioContext = () =>
  ({
    state: "running",
    resume: vi.fn().mockResolvedValue(undefined)
  }) as unknown as AudioContext;

const createAudioElement = () =>
  ({
    play: vi.fn().mockResolvedValue(undefined)
  }) as unknown as HTMLMediaElement;

describe("WebAudioAdapter", () => {
  it("no-ops when setSinkId is unsupported", async () => {
    const adapter = new WebAudioAdapter({
      outputElement: createAudioElement(),
      audioContext: createAudioContext(),
      mediaDevices: null,
      silentAudioElement: createAudioElement() as HTMLAudioElement
    });

    await expect(adapter.setPreferredOutput("device-1")).resolves.toBeUndefined();
  });
});
