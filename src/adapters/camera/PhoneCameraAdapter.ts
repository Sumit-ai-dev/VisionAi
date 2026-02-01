import { CameraAdapter, CameraCaptureOptions } from "./CameraAdapter";

const DEFAULT_MAX_BASE64_LENGTH = 12_000_000;
const DEFAULT_MIN_DIMENSION = 320;
const DEFAULT_JPEG_QUALITY = 0.7;

const renderFrame = (
  videoEl: HTMLVideoElement,
  width: number,
  height: number
) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not supported");
  }
  ctx.drawImage(videoEl, 0, 0, width, height);
  return canvas;
};

const encodeJpeg = (canvas: HTMLCanvasElement, quality: number) =>
  canvas.toDataURL("image/jpeg", quality).replace(/^data:image\/jpeg;base64,/, "");

export class PhoneCameraAdapter implements CameraAdapter {
  name = "phone";
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;

  async isAvailable(): Promise<boolean> {
    return Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async startPreview(videoEl: HTMLVideoElement): Promise<void> {
    this.videoEl = videoEl;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    videoEl.srcObject = this.stream;
    await videoEl.play();
  }

  async captureJpegBase64(
    options: CameraCaptureOptions = {}
  ): Promise<string> {
    if (!this.videoEl || !this.videoEl.srcObject) {
      throw new Error("Camera not initialized");
    }

    const maxBase64Length =
      options.maxBase64Length ?? DEFAULT_MAX_BASE64_LENGTH;
    const minDimension = options.minDimension ?? DEFAULT_MIN_DIMENSION;
    const baseWidth = this.videoEl.videoWidth || 640;
    const baseHeight = this.videoEl.videoHeight || 480;

    let scale = 1;
    let quality = options.jpegQuality ?? DEFAULT_JPEG_QUALITY;
    let base64 = "";

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const width = Math.max(Math.round(baseWidth * scale), minDimension);
      const height = Math.max(Math.round(baseHeight * scale), minDimension);
      const canvas = renderFrame(this.videoEl, width, height);
      base64 = encodeJpeg(canvas, quality);
      if (base64.length <= maxBase64Length) {
        return base64;
      }
      scale *= 0.8;
      quality = Math.max(0.5, quality - 0.1);
    }

    return base64;
  }

  async stop(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
  }
}
