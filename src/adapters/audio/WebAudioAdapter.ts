import { AudioAdapter, AudioDebugState, DeviceInfo } from "./AudioAdapter";

type WebAudioAdapterOptions = {
  outputElement: HTMLMediaElement;
  audioContext?: AudioContext;
  mediaDevices?: MediaDevices | null;
  silentAudioElement?: HTMLAudioElement;
};

const SILENT_AUDIO_SOURCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

const supportsSetSinkId = (element: HTMLMediaElement | null) =>
  Boolean(element && "setSinkId" in element);

export class WebAudioAdapter implements AudioAdapter {
  private outputElement: HTMLMediaElement;
  private audioContext: AudioContext;
  private mediaDevices: MediaDevices | null;
  private silentAudioElement: HTMLAudioElement;
  private preferredInputId: string | null = null;
  private preferredOutputId: string | null = null;
  private audioUnlocked = false;

  constructor(options: WebAudioAdapterOptions) {
    this.outputElement = options.outputElement;
    this.audioContext = options.audioContext ?? new AudioContext();
    this.mediaDevices =
      options.mediaDevices ??
      (typeof navigator !== "undefined" ? navigator.mediaDevices ?? null : null);
    this.silentAudioElement = options.silentAudioElement
      ? options.silentAudioElement
      : new Audio(SILENT_AUDIO_SOURCE);
    this.silentAudioElement.volume = 0;
  }

  getDebugState(): AudioDebugState {
    return {
      audioUnlocked: this.audioUnlocked,
      outputSelectionSupported: supportsSetSinkId(this.outputElement),
      preferredInputId: this.preferredInputId,
      preferredOutputId: this.preferredOutputId
    };
  }

  async getInputDevices(): Promise<DeviceInfo[]> {
    if (!this.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await this.mediaDevices.enumerateDevices();
    const isAudioInput = (
      device: MediaDeviceInfo
    ): device is MediaDeviceInfo & { kind: "audioinput" } =>
      device.kind === "audioinput";
    return devices
      .filter(isAudioInput)
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label,
        kind: device.kind,
        groupId: device.groupId
      }));
  }

  async getOutputDevices(): Promise<DeviceInfo[]> {
    if (!this.mediaDevices?.enumerateDevices) {
      return [];
    }
    const devices = await this.mediaDevices.enumerateDevices();
    const isAudioOutput = (
      device: MediaDeviceInfo
    ): device is MediaDeviceInfo & { kind: "audiooutput" } =>
      device.kind === "audiooutput";
    return devices
      .filter(isAudioOutput)
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label,
        kind: device.kind,
        groupId: device.groupId
      }));
  }

  async setPreferredInput(deviceId: string | null): Promise<void> {
    this.preferredInputId = deviceId;
  }

  async setPreferredOutput(deviceId: string | null): Promise<void> {
    this.preferredOutputId = deviceId;
    if (!deviceId) {
      return;
    }
    if (!supportsSetSinkId(this.outputElement)) {
      return;
    }
    const output = this.outputElement as HTMLMediaElement & {
      setSinkId?: (deviceId: string) => Promise<void>;
    };
    await output.setSinkId?.(deviceId);
  }

  async ensureAudioUnlocked(): Promise<void> {
    if (this.audioUnlocked) {
      return;
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    try {
      await this.outputElement.play();
    } catch {
      await this.silentAudioElement.play();
    }
    this.audioUnlocked = true;
  }

  async getMicrophoneStream(
    constraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 24000
    }
  ): Promise<MediaStream> {
    if (!this.mediaDevices?.getUserMedia) {
      throw new Error("Media devices not available");
    }
    const audioConstraints: MediaTrackConstraints = { ...constraints };
    if (this.preferredInputId) {
      audioConstraints.deviceId = { exact: this.preferredInputId };
    }
    return this.mediaDevices.getUserMedia({ audio: audioConstraints });
  }
}
