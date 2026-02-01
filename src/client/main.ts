import { captureJpegBase64, setupCamera } from "./camera";
import { formatForSpeech } from "../core/formatForSpeech";
import { routeIntent } from "../core/intentRouter";
import { IntentType, VisionMode } from "../core/intents";
import { StateMachine } from "../core/stateMachine";

const statusText = document.getElementById("statusText") as HTMLElement;
const stateText = document.getElementById("stateText") as HTMLElement;
const transcriptText = document.getElementById("transcriptText") as HTMLElement;
const debugLog = document.getElementById("debugLog") as HTMLUListElement;
const cameraPreview = document.getElementById("cameraPreview") as HTMLVideoElement;
const cameraWarning = document.getElementById("cameraWarning") as HTMLElement;
const captureButton = document.getElementById("captureButton") as HTMLButtonElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;
const intentText = document.getElementById("intentText") as HTMLElement;
const modeText = document.getElementById("modeText") as HTMLElement;
const wakeCountdownText = document.getElementById(
  "wakeCountdownText"
) as HTMLElement;

// Create audio element for OpenAI's voice output
const remoteAudio = document.createElement("audio");
remoteAudio.autoplay = true;
document.body.appendChild(remoteAudio);

const appendLog = (message: string) => {
  const entry = document.createElement("li");
  entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  debugLog.prepend(entry);
  while (debugLog.children.length > 20) {
    debugLog.removeChild(debugLog.lastChild as Node);
  }
};

const stateMachine = new StateMachine("IDLE_LISTENING", appendLog);
stateMachine.onChange((next) => {
  stateText.textContent = next;
  const mapping: Record<string, string> = {
    IDLE_LISTENING: "Listening",
    WAKE_DETECTED: "Wake detected",
    CAPTURING: "Capturing",
    THINKING: "Thinking",
    SPEAKING: "Speaking",
    ERROR: "Error"
  };
  statusText.textContent = mapping[next];
  if (next !== "WAKE_DETECTED") {
    wakeCountdownText.textContent = "—";
  }
});

let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let transcriptBuffer = "";
let wakeTimeout: number | null = null;
let speechTimeout: number | null = null;
let wakeCountdownInterval: number | null = null;
let wakeExpiresAt = 0;
let currentMode: VisionMode = "scene";
let audioUnlocked = false;

const audioContext = new AudioContext();

const unlockAudio = async (reason: string) => {
  if (audioUnlocked) {
    return;
  }
  try {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
    await remoteAudio.play();
    audioUnlocked = true;
    appendLog(`Audio unlocked (${reason})`);
  } catch (error) {
    appendLog(`Audio unlock failed (${reason}): ${String(error)}`);
  }
};

const bindAudioUnlock = () => {
  const handler = () => {
    unlockAudio("user-gesture").catch(() => undefined);
    document.removeEventListener("click", handler);
    document.removeEventListener("keydown", handler);
    captureButton.removeEventListener("click", handler);
    resetButton.removeEventListener("click", handler);
  };
  document.addEventListener("click", handler);
  document.addEventListener("keydown", handler);
  captureButton.addEventListener("click", handler);
  resetButton.addEventListener("click", handler);
};

const sendRealtimeEvent = (payload: Record<string, unknown>) => {
  if (!dataChannel || dataChannel.readyState !== "open") {
    appendLog("Data channel not ready");
    return;
  }
  dataChannel.send(JSON.stringify(payload));
};

const formatModeLabel = (mode: VisionMode) => {
  if (mode === "ahead") {
    return "Ahead";
  }
  if (mode === "read_text") {
    return "Read";
  }
  return "Scene";
};

const handleTranscript = (text: string, isFinal: boolean) => {
  const cleaned = text.trim();
  if (!cleaned) {
    return;
  }
  transcriptText.textContent = cleaned;
  if (!isFinal) {
    return;
  }
  appendLog(`Transcript final: ${cleaned}`);

  const intentResult = routeIntent(cleaned, stateMachine.state === "WAKE_DETECTED");
  intentText.textContent = intentResult.intent;

  if (intentResult.intent === IntentType.WAKE) {
    stateMachine.transition("WAKE_DETECTED", "Wake phrase detected");
    sendRealtimeEvent({
      type: "response.create",
      response: {
        modalities: ["audio"],
        instructions: "Yes?",
        voice: "alloy"
      }
    });
    startWakeTimeout();
    return;
  }

  if (intentResult.intent === IntentType.NONE) {
    return;
  }

  if (stateMachine.state !== "WAKE_DETECTED") {
    if (!intentResult.wakeDetected) {
      appendLog("Intent ignored (wake not active)");
      return;
    }
    stateMachine.transition("WAKE_DETECTED", "Wake + command in one utterance");
    startWakeTimeout();
  }

  if (wakeTimeout) {
    window.clearTimeout(wakeTimeout);
  }
  if (wakeCountdownInterval) {
    window.clearInterval(wakeCountdownInterval);
  }
  wakeCountdownText.textContent = "—";

  if (intentResult.intent === IntentType.HELP) {
    sendRealtimeEvent({
      type: "response.create",
      response: {
        modalities: ["audio"],
        instructions:
          "You can say: what's ahead, describe scene, read this, or reset.",
        voice: "alloy"
      }
    });
    stateMachine.transition("SPEAKING", "Help requested");
    return;
  }

  if (intentResult.intent === IntentType.RESET) {
    resetSession().catch((error) => {
      appendLog(`Reset error: ${String(error)}`);
      stateMachine.transition("ERROR", "Reset failed");
    });
    return;
  }

  if (intentResult.slots.mode) {
    currentMode = intentResult.slots.mode;
  }
  modeText.textContent = formatModeLabel(currentMode);
  captureAndDescribe(currentMode).catch((error) => {
    appendLog(`Capture error: ${String(error)}`);
    stateMachine.transition("ERROR", "Capture failed");
  });
};

const startWakeTimeout = () => {
  if (wakeTimeout) {
    window.clearTimeout(wakeTimeout);
  }
  if (wakeCountdownInterval) {
    window.clearInterval(wakeCountdownInterval);
  }
  wakeExpiresAt = Date.now() + 8000;
  wakeTimeout = window.setTimeout(() => {
    stateMachine.transition("IDLE_LISTENING", "Wake window expired");
    wakeCountdownText.textContent = "—";
  }, 8000);
  wakeCountdownInterval = window.setInterval(() => {
    const remainingMs = wakeExpiresAt - Date.now();
    if (remainingMs <= 0) {
      wakeCountdownText.textContent = "0s";
      if (wakeCountdownInterval) {
        window.clearInterval(wakeCountdownInterval);
      }
      return;
    }
    wakeCountdownText.textContent = `${Math.ceil(remainingMs / 1000)}s`;
  }, 250);
};

const captureAndDescribe = async (mode: VisionMode) => {
  stateMachine.transition("CAPTURING", "Capturing image");
  const imageBase64 = await captureJpegBase64(cameraPreview);

  stateMachine.transition("THINKING", "Sending image to server");
  const response = await fetch("/api/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64_jpeg: imageBase64, mode })
  });
  if (!response.ok) {
    const errorText = await response.text();
    appendLog(`Vision API error (${response.status}): ${errorText.substring(0, 200)}`);
    throw new Error(`Vision request failed: ${response.status}`);
  }
  const result = await response.json();
  const speech = formatForSpeech(result, mode);

  stateMachine.transition("SPEAKING", "Speaking response");
  if (speechTimeout) {
    window.clearTimeout(speechTimeout);
  }
  speechTimeout = window.setTimeout(() => {
    if (stateMachine.state === "SPEAKING") {
      stateMachine.transition("IDLE_LISTENING", "Speech timeout");
    }
  }, 12000);

  // Display what the AI is "saying" (for Free Tier users without audio)
  transcriptText.textContent = `🤖 AI: ${speech}`;
  appendLog(`AI Description: ${speech.substring(0, 80)}...`);

  // Add the AI's message to the conversation
  sendRealtimeEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: speech
        }
      ]
    }
  });

  // Trigger audio response generation (requires Tier 1+)
  sendRealtimeEvent({
    type: "response.create",
    response: {
      modalities: ["audio", "text"]
    }
  });
};

const setupRealtime = async () => {
  stateMachine.transition("IDLE_LISTENING", "Initializing session");
  peerConnection = new RTCPeerConnection();
  dataChannel = peerConnection.createDataChannel("events");

  const micStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 24000
    }
  });
  unlockAudio("mic-permission").catch(() => undefined);
  const audioTracks = micStream.getAudioTracks();
  appendLog(`Audio tracks: ${audioTracks.length}`);
  if (audioTracks.length === 0) {
    throw new Error("Microphone access failed");
  }
  micStream.getTracks().forEach((track) => {
    peerConnection?.addTrack(track, micStream);
  });

  // Handle incoming audio from OpenAI (this plays the AI's voice!)
  peerConnection.ontrack = (event) => {
    appendLog(`Incoming audio track received (${event.streams.length} streams)`);
    if (event.streams[0]) {
      remoteAudio.srcObject = event.streams[0];
      appendLog("Audio stream connected to audio element");
      remoteAudio.play().then(() => {
        appendLog("✅ Audio playback started successfully");
      }).catch((error) => {
        appendLog(`❌ Audio playback error: ${String(error)}`);
      });
    }
  };

  dataChannel.onopen = () => {
    appendLog("Data channel open");
    sendRealtimeEvent({
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        instructions:
          "You are VisionAI Nexus. Stay silent until the wake phrase 'Hey Nexus' is detected. After wake, interpret the user's intent (scene, ahead, read text, help, reset). If vision is requested, call get_scene_description with the mode and image. Speak only the formatted short speech in 1-2 sentences, safety-first.",
        voice: "alloy",
        input_audio_transcription: {
          model: "whisper-1"
        },
        tools: [
          {
            type: "function",
            name: "get_scene_description",
            description: "Analyze an image for hazards and objects.",
            parameters: {
              type: "object",
              properties: {
                image_base64_jpeg: { type: "string" },
                mode: {
                  type: "string",
                  enum: ["scene", "ahead", "read_text"]
                }
              },
              required: ["image_base64_jpeg", "mode"]
            }
          }
        ]
      }
    });
  };

  dataChannel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      const type = message.type as string | undefined;
      appendLog(`Event: ${type || "unknown"}`);

      if (type === "response.audio_transcript.delta") {
        transcriptBuffer += message.delta ?? "";
        handleTranscript(transcriptBuffer, false);
      }
      if (type === "response.audio_transcript.done") {
        transcriptBuffer = message.transcript ?? transcriptBuffer;
        handleTranscript(transcriptBuffer, true);
        transcriptBuffer = "";
      }
      // Handle USER speech transcription (this is what we need for wake phrase!)
      if (type === "conversation.item.input_audio_transcription.completed") {
        const userText = message.transcript ?? "";
        handleTranscript(userText, true);
      }
      if (type === "response.done") {
        if (stateMachine.state === "SPEAKING") {
          stateMachine.transition("IDLE_LISTENING", "Speech complete");
        }
        if (speechTimeout) {
          window.clearTimeout(speechTimeout);
        }
      }
    } catch (error) {
      appendLog(`Event parse error: ${String(error)}`);
    }
  };

  await new Promise((resolve) => window.setTimeout(resolve, 100));

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  const response = await fetch("/api/realtime/offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sdp: offer.sdp })
  });
  if (!response.ok) {
    throw new Error("Realtime offer failed");
  }
  const data = await response.json();
  await peerConnection.setRemoteDescription({ type: "answer", sdp: data.sdp });
};

const resetSession = async () => {
  appendLog("Resetting session");
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  transcriptBuffer = "";
  if (wakeTimeout) {
    window.clearTimeout(wakeTimeout);
  }
  if (wakeCountdownInterval) {
    window.clearInterval(wakeCountdownInterval);
  }
  wakeCountdownText.textContent = "—";
  currentMode = "scene";
  intentText.textContent = IntentType.NONE;
  modeText.textContent = formatModeLabel(currentMode);
  await setupRealtime();
};

const init = async () => {
  bindAudioUnlock();
  intentText.textContent = IntentType.NONE;
  modeText.textContent = formatModeLabel(currentMode);
  try {
    await setupCamera(cameraPreview);
  } catch (error) {
    cameraWarning.textContent =
      "Camera permission denied or unavailable. Capture will fail.";
    appendLog(`Camera error: ${String(error)}`);
  }

  try {
    await setupRealtime();
  } catch (error) {
    appendLog(`Realtime error: ${String(error)}`);
    stateMachine.transition("ERROR", "Realtime initialization failed");
  }
};

resetButton.addEventListener("click", () => {
  resetSession().catch((error) => {
    appendLog(`Reset error: ${String(error)}`);
    stateMachine.transition("ERROR", "Reset failed");
  });
});

captureButton.addEventListener("click", () => {
  appendLog("Manual capture triggered");
  captureAndDescribe(currentMode).catch((error) => {
    appendLog(`Capture error: ${String(error)}`);
    stateMachine.transition("ERROR", "Capture failed");
  });
});

init().catch((error) => {
  appendLog(`Init error: ${String(error)}`);
  stateMachine.transition("ERROR", "Initialization failed");
});
