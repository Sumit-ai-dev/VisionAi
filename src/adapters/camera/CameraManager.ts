import { CameraAdapter } from "./CameraAdapter";
import { ExternalCameraAdapter } from "./ExternalCameraAdapter";
import { PhoneCameraAdapter } from "./PhoneCameraAdapter";

export type CameraSourcePreference = "auto" | "phone" | "external";

const STORAGE_KEY = "visionai.cameraSource";

const isValidPreference = (
  value: string | null | undefined
): value is CameraSourcePreference =>
  value === "auto" || value === "phone" || value === "external";

export const readCameraSourcePreference = (): CameraSourcePreference => {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isValidPreference(stored)) {
      return stored;
    }
    const windowValue = (window as Window & { CAMERA_SOURCE?: string })
      .CAMERA_SOURCE;
    if (isValidPreference(windowValue)) {
      return windowValue;
    }
  }
  const envValue =
    (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env?.VITE_CAMERA_SOURCE ??
    (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env?.CAMERA_SOURCE;
  if (isValidPreference(envValue)) {
    return envValue;
  }
  return "auto";
};

export const persistCameraSourcePreference = (preference: CameraSourcePreference) => {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, preference);
  }
};

type CameraManagerOptions = {
  preference?: CameraSourcePreference;
  externalAdapter?: CameraAdapter;
  phoneAdapter?: CameraAdapter;
  onSelection?: (adapterName: string) => void;
};

export class CameraManager {
  private preference: CameraSourcePreference;
  private externalAdapter: CameraAdapter;
  private phoneAdapter: CameraAdapter;
  private activeAdapter: CameraAdapter | null = null;
  private onSelection?: (adapterName: string) => void;

  constructor(options: CameraManagerOptions = {}) {
    this.preference = options.preference ?? readCameraSourcePreference();
    this.externalAdapter = options.externalAdapter ?? new ExternalCameraAdapter();
    this.phoneAdapter = options.phoneAdapter ?? new PhoneCameraAdapter();
    this.onSelection = options.onSelection;
  }

  getActiveAdapterName(): string | null {
    return this.activeAdapter?.name ?? null;
  }

  getPreference(): CameraSourcePreference {
    return this.preference;
  }

  setPreference(preference: CameraSourcePreference): void {
    this.preference = preference;
    persistCameraSourcePreference(preference);
  }

  private async selectAdapter(): Promise<CameraAdapter> {
    const externalAvailable = await this.externalAdapter.isAvailable();
    if (this.preference === "external") {
      return externalAvailable ? this.externalAdapter : this.phoneAdapter;
    }
    if (this.preference === "phone") {
      return this.phoneAdapter;
    }
    return externalAvailable ? this.externalAdapter : this.phoneAdapter;
  }

  private async ensureActiveAdapter(): Promise<CameraAdapter> {
    const selected = await this.selectAdapter();
    if (this.activeAdapter?.name !== selected.name) {
      if (this.activeAdapter) {
        await this.activeAdapter.stop();
      }
      this.activeAdapter = selected;
      this.onSelection?.(selected.name);
    }
    return selected;
  }

  async startPreview(videoEl: HTMLVideoElement): Promise<void> {
    const adapter = await this.ensureActiveAdapter();
    await adapter.startPreview(videoEl);
  }

  async captureJpegBase64(): Promise<string> {
    const adapter = await this.ensureActiveAdapter();
    return adapter.captureJpegBase64();
  }

  async stop(): Promise<void> {
    if (this.activeAdapter) {
      await this.activeAdapter.stop();
    }
  }
}
