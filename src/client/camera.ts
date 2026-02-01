const MAX_BASE64_LENGTH = 12_000_000;
const MIN_DIMENSION = 320;

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

export const captureJpegBase64 = async (
  videoEl: HTMLVideoElement
): Promise<string> => {
  if (!videoEl.srcObject) {
    throw new Error("Camera not initialized");
  }

  const baseWidth = videoEl.videoWidth || 640;
  const baseHeight = videoEl.videoHeight || 480;

  let scale = 1;
  let quality = 0.7;
  let base64 = "";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const width = Math.max(Math.round(baseWidth * scale), MIN_DIMENSION);
    const height = Math.max(Math.round(baseHeight * scale), MIN_DIMENSION);
    const canvas = renderFrame(videoEl, width, height);
    base64 = encodeJpeg(canvas, quality);
    if (base64.length <= MAX_BASE64_LENGTH) {
      return base64;
    }
    scale *= 0.8;
    quality = Math.max(0.5, quality - 0.1);
  }

  return base64;
};

export const setupCamera = async (
  videoEl: HTMLVideoElement
): Promise<void> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });
  videoEl.srcObject = stream;
};
