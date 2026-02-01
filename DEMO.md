# VisionAI Nexus Demo (Division 4)

## Quick start
```bash
npm install
npm run dev
```

Open http://localhost:3000 in Chrome.

## Voice flow
1. Allow microphone + camera when prompted.
2. Say: **"Hey Nexus"**.
3. When it replies "Yes?", say: **"capture and describe"**.
4. Listen for the concise spoken result (hazards first).

## Awareness Mode demo script
1. Say: **"Hey Nexus"**.
2. Say: **"start awareness"**.
3. Move a new hazard into frame or change camera direction.
4. Confirm it speaks only for hazards or meaningful changes.
5. Say: **"stop awareness"**.

## Post-division check
```bash
npm run checkup
```

## Reset
Use the "Reset session" button if you need to reconnect the Realtime session.
