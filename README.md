# VisionAI Nexus (Division 1)

VisionAI Nexus is a voice-first, almost real-time navigation demo for low-vision awareness. Say the wake phrase, request a capture, and the app captures one camera frame, runs GPT-4o vision analysis, and speaks back concise hazards + key objects with clock positions and distance buckets.

## What it does
- Wake phrase gated: **"Hey Nexus"**
- Command phrase: **"capture and describe"**
- Captures one camera frame and sends to GPT-4o vision via the server
- Speaks a safety-first response through OpenAI Realtime voice output

## Requirements
- Node.js 18+
- An OpenAI API key

## Setup
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

## Run
```bash
npm run dev
```

Open http://localhost:3000 in Chrome.

## Demo steps
1. (Optional) connect Bluetooth glasses or headset.
2. Open the site and allow microphone + camera.
3. Say **"Hey Nexus"**.
4. When the assistant responds, say **"capture and describe"**.
5. Listen for the spoken hazard/object summary.

## Smart-glasses adapter layer (Division 3)
- Camera and audio are routed through adapters to keep the core flow unchanged.
- External camera simulation can be toggled in the UI (Camera source: External).
- Audio routing uses system defaults so Bluetooth glasses/headsets work automatically.

## Post-division check
```bash
npm run checkup
```

## Forcing the external camera adapter
- UI: Use **Camera source → External (fixture)** in the Audio/Device Debug panel.
- Env: Set `VITE_CAMERA_SOURCE=external` before running `npm run dev`.

See `docs/ADAPTERS.md` for adapter extension guidance.

## Notes
- Only `OPENAI_API_KEY` is used server-side.
- The client never embeds the API key.
- If vision JSON is invalid, the server retries once before returning a safe fallback.
