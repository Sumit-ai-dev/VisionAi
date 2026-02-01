export type DeviceInfo = {
  deviceId: string;
  label: string;
  kind: "audioinput" | "audiooutput";
  groupId?: string;
};

export type AudioDebugState = {
  audioUnlocked: boolean;
  outputSelectionSupported: boolean;
  preferredInputId: string | null;
  preferredOutputId: string | null;
};

export interface AudioAdapter {
  getInputDevices(): Promise<DeviceInfo[]>;
  getOutputDevices(): Promise<DeviceInfo[]>;
  setPreferredInput(deviceId: string | null): Promise<void>;
  setPreferredOutput(deviceId: string | null): Promise<void>;
  ensureAudioUnlocked(): Promise<void>;
  getMicrophoneStream(
    constraints?: MediaTrackConstraints
  ): Promise<MediaStream>;
  getDebugState(): AudioDebugState;
}
