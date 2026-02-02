# VisionAI Nexus (All Divisions)

VisionAI Nexus is a voice-first, near real-time navigation demo for low-vision awareness. After a wake phrase, it captures a camera frame, sends it to GPT-4o vision analysis, and speaks back concise hazards + key objects with clock positions and distance buckets.

## What it does
- Wake phrase gated: **"Hey Nexus"**
- Command phrase: **"capture and describe"**
- Continuous Awareness mode for periodic hazard checks
- Captures camera frames and sends to GPT-4o vision via the server
- Speaks a safety-first response through OpenAI Realtime voice output (with rate limiting)

## Requirements
- Node.js 18+
- An OpenAI API key

## How to run (exact commands)
```bash
npm install
```

Create a local `.env` based on `.env.example`:
```bash
cp .env.example .env
```

Add your OpenAI key to `.env`:
```
OPENAI_API_KEY=sk-...
```

```bash
npm run dev
```

Open http://localhost:3000 in Chrome.

## Demo steps (Division 4)
### Quick start
```bash
npm install
npm run dev
```

Open http://localhost:3000 in Chrome.

### Voice flow
1. (Optional) connect Bluetooth glasses or headset.
2. Open the site and allow microphone + camera.
3. Say **"Hey Nexus"**.
4. When the assistant responds, say **"capture and describe"**.
5. Listen for the spoken hazard/object summary (hazards first).

## Awareness Mode demo script (Division 4)
1. Say **"Hey Nexus"**.
2. Say **"start awareness"**.
3. Move a new hazard into frame or change camera direction.
4. Show that it speaks only on a hazard or meaningful change.
5. Say **"stop awareness"**.

## Smart-glasses adapter layer (Division 3)
VisionAI Nexus routes camera, audio I/O, and control input through adapters so the core flow stays "Hey Nexus → intent → capture → analyze → speak" while enabling smart-glasses integration later.

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

### Adding a vendor glasses adapter
1. Create a new class in `src/adapters/*` that implements the appropriate interface.
2. Make the adapter return `true` from `isAvailable()` only when the vendor SDK is present.
3. Update `CameraManager` (or a new manager) to register the adapter with the desired priority.
4. Keep SDK usage isolated to the adapter layer; core logic should only call interfaces.

### Bluetooth glasses routing note
Bluetooth glasses/headsets are treated as system audio devices. When they are connected, they appear as default input/output devices, so no vendor SDK is required for audio routing. Use the Audio/Device Debug panel to confirm which devices are active.

## Post-division check
```bash
npm run checkup
```
Run this after each division to validate typecheck, lint, tests, build, and smoke check.

## Reset (Division 4)
Use the "Reset session" button if you need to reconnect the Realtime session.

## Troubleshooting (placeholder)
- _To be expanded after Vision fix._

## Forcing the external camera adapter
- UI: Use **Camera source → External (fixture)** in the Audio/Device Debug panel.
- Env: Set `VITE_CAMERA_SOURCE=external` before running `npm run dev`.

See `docs/ADAPTERS.md` for adapter extension guidance.

## Notes
- Only `OPENAI_API_KEY` is used server-side.
- The client never embeds the API key.
- If vision JSON is invalid, the server retries once before returning a safe fallback.
