export type CameraCaptureOptions = {
  maxBase64Length?: number;
  minDimension?: number;
  jpegQuality?: number;
};

export interface CameraAdapter {
  name: string;
  isAvailable(): Promise<boolean>;
  startPreview(videoEl: HTMLVideoElement): Promise<void>;
  captureJpegBase64(options?: CameraCaptureOptions): Promise<string>;
  stop(): Promise<void>;
}
