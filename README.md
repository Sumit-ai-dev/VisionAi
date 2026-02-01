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

## Notes
- Only `OPENAI_API_KEY` is used server-side.
- The client never embeds the API key.
- If vision JSON is invalid, the server retries once before returning a safe fallback.
