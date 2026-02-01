import { describe, expect, it, vi } from "vitest";
import { CameraAdapter } from "./CameraAdapter";
import { CameraManager } from "./CameraManager";

type AdapterStub = CameraAdapter & {
  startPreview: ReturnType<typeof vi.fn>;
};

const createAdapter = (name: string, available: boolean): AdapterStub => {
  return {
    name,
    isAvailable: vi.fn().mockResolvedValue(available),
    startPreview: vi.fn().mockResolvedValue(undefined),
    captureJpegBase64: vi.fn().mockResolvedValue("base64"),
    stop: vi.fn().mockResolvedValue(undefined)
  } as AdapterStub;
};

describe("CameraManager", () => {
  it("chooses external adapter when available", async () => {
    const externalAdapter = createAdapter("external", true);
    const phoneAdapter = createAdapter("phone", true);
    const manager = new CameraManager({
      preference: "auto",
      externalAdapter,
      phoneAdapter
    });

    await manager.startPreview({} as HTMLVideoElement);

    expect(externalAdapter.startPreview).toHaveBeenCalledOnce();
    expect(phoneAdapter.startPreview).not.toHaveBeenCalled();
    expect(manager.getActiveAdapterName()).toBe("external");
  });

  it("falls back to phone adapter when external unavailable", async () => {
    const externalAdapter = createAdapter("external", false);
    const phoneAdapter = createAdapter("phone", true);
    const manager = new CameraManager({
      preference: "auto",
      externalAdapter,
      phoneAdapter
    });

    await manager.startPreview({} as HTMLVideoElement);

    expect(phoneAdapter.startPreview).toHaveBeenCalledOnce();
    expect(externalAdapter.startPreview).not.toHaveBeenCalled();
    expect(manager.getActiveAdapterName()).toBe("phone");
  });
});
