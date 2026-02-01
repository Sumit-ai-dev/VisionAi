export const captureJpegBase64 = async (
  videoEl: HTMLVideoElement
): Promise<string> => {
  if (!videoEl.srcObject) {
    throw new Error("Camera not initialized");
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoEl.videoWidth || 640;
  canvas.height = videoEl.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not supported");
  }
  ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
  return dataUrl.replace(/^data:image\/jpeg;base64,/, "");
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
