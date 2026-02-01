import { CameraAdapter, CameraCaptureOptions } from "./CameraAdapter";

const DEFAULT_FIXTURE_URL = "/fixtures/external-camera.svg";

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Fixture image failed to load"));
    img.src = url;
  });

export class ExternalCameraAdapter implements CameraAdapter {
  name = "external";
  private fixtureUrl: string;
  private cachedBase64: string | null = null;
  private videoEl: HTMLVideoElement | null = null;

  constructor(fixtureUrl: string = DEFAULT_FIXTURE_URL) {
    this.fixtureUrl = fixtureUrl;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.fixtureUrl, { method: "HEAD" });
      return response.ok;
    } catch {
      return false;
    }
  }

  async startPreview(videoEl: HTMLVideoElement): Promise<void> {
    this.videoEl = videoEl;
    videoEl.srcObject = null;
    videoEl.src = "";
    videoEl.poster = this.fixtureUrl;
    videoEl.load();
  }

  async captureJpegBase64(
    _options?: CameraCaptureOptions
  ): Promise<string> {
    if (this.cachedBase64) {
      return this.cachedBase64;
    }
    const image = await loadImage(this.fixtureUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 640;
    canvas.height = image.naturalHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas not supported");
    }
    ctx.fillStyle = "#0b0f1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    this.cachedBase64 = canvas
      .toDataURL("image/jpeg", 0.7)
      .replace(/^data:image\/jpeg;base64,/, "");
    return this.cachedBase64;
  }

  async stop(): Promise<void> {
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute("poster");
      this.videoEl.src = "";
    }
  }
}
