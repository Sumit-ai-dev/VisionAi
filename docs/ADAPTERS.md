# Adapter Layer (Division 3)

VisionAI Nexus now routes camera, audio I/O, and control input through adapters so the core flow stays "Hey Nexus → intent → capture → analyze → speak" while enabling smart-glasses integration later.

## Adapter overview

### Audio
- **Interface:** `src/adapters/audio/AudioAdapter.ts`
- **Implementation:** `src/adapters/audio/WebAudioAdapter.ts`
- Uses the system default input/output devices so Bluetooth glasses/headsets route audio automatically.
- `setPreferredOutput` uses `setSinkId` when supported; it no-ops on browsers that do not expose it.

### Camera
- **Interface:** `src/adapters/camera/CameraAdapter.ts`
- **Manager:** `src/adapters/camera/CameraManager.ts`
- **Phone adapter:** `src/adapters/camera/PhoneCameraAdapter.ts` (getUserMedia, environment-facing)
- **External adapter:** `src/adapters/camera/ExternalCameraAdapter.ts`
  - Stub implementation that serves a fixture image from `/public/fixtures/external-camera.svg`.

### Control
- **Interface:** `src/adapters/control/ControlAdapter.ts`
- **Implementation:** `src/adapters/control/TranscriptControlAdapter.ts`
- Consumes transcript events and triggers wake/reset callbacks so future push-to-talk or hardware buttons can plug in.

## Adding a vendor glasses adapter
1. Create a new class in `src/adapters/*` that implements the appropriate interface.
2. Make the adapter return `true` from `isAvailable()` only when the vendor SDK is present.
3. Update `CameraManager` (or a new manager) to register the adapter with the desired priority.
4. Keep SDK usage isolated to the adapter layer; core logic should only call interfaces.

## Bluetooth glasses routing note
Bluetooth glasses/headsets are treated as system audio devices. When they are connected, they appear as default input/output devices, so no vendor SDK is required for audio routing. Use the Audio/Device Debug panel to confirm which devices are active.
