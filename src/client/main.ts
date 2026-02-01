import { captureJpegBase64, setupCamera } from "./camera";
import { isCaptureCommand, isWakePhrase } from "../core/commandRouter";
import { StateMachine } from "../core/stateMachine";

const statusText = document.getElementById("statusText") as HTMLElement;
const stateText = document.getElementById("stateText") as HTMLElement;
const transcriptText = document.getElementById("transcriptText") as HTMLElement;
const debugLog = document.getElementById("debugLog") as HTMLUListElement;
const cameraPreview = document.getElementById("cameraPreview") as HTMLVideoElement;
const cameraWarning = document.getElementById("cameraWarning") as HTMLElement;
const captureButton = document.getElementById("captureButton") as HTMLButtonElement;
const resetButton = document.getElementById("resetButton") as HTMLButtonElement;

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
});

let peerConnection: RTCPeerConnection | null = null;
let dataChannel: RTCDataChannel | null = null;
let transcriptBuffer = "";
let wakeTimeout: number | null = null;
let speechTimeout: number | null = null;

const sendRealtimeEvent = (payload: Record<string, unknown>) => {
  if (!dataChannel || dataChannel.readyState !== "open") {
    appendLog("Data channel not ready");
    return;
  }
  dataChannel.send(JSON.stringify(payload));
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

  if (stateMachine.state === "IDLE_LISTENING" && isWakePhrase(cleaned)) {
    stateMachine.transition("WAKE_DETECTED", "Wake phrase detected");
    sendRealtimeEvent({
      type: "response.create",
      response: {
        modalities: ["audio"],
        instructions: "Yes?",
        voice: "alloy"
      }
    });
    if (wakeTimeout) {
      window.clearTimeout(wakeTimeout);
    }
    wakeTimeout = window.setTimeout(() => {
      stateMachine.transition("IDLE_LISTENING", "Wake window expired");
    }, 10000);
    return;
  }

  if (stateMachine.state === "WAKE_DETECTED" && isCaptureCommand(cleaned)) {
    if (wakeTimeout) {
      window.clearTimeout(wakeTimeout);
    }
    captureAndDescribe().catch((error) => {
      appendLog(`Capture error: ${String(error)}`);
      stateMachine.transition("ERROR", "Capture failed");
    });
  }
};

const captureAndDescribe = async () => {
  stateMachine.transition("CAPTURING", "Capturing image");
  const imageBase64 = await captureJpegBase64(cameraPreview);

  stateMachine.transition("THINKING", "Sending image to server");
  const response = await fetch("/api/vision", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64_jpeg: imageBase64 })
  });
  if (!response.ok) {
    const errorText = await response.text();
    appendLog(`Vision API error (${response.status}): ${errorText.substring(0, 100)}`);
    throw new Error(`Vision request failed: ${response.status}`);
  }
  const result = await response.json();

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
  transcriptText.textContent = `🤖 AI: ${result.short_speech}`;
  appendLog(`AI Description: ${result.short_speech.substring(0, 50)}...`);

  // Add the AI's message to the conversation
  sendRealtimeEvent({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text: result.short_speech
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
          "You are a voice assistant. Stay silent until asked. When asked to speak, respond concisely.",
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
                image_base64_jpeg: { type: "string" }
              },
              required: ["image_base64_jpeg"]
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
  await setupRealtime();
};

const init = async () => {
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
  captureAndDescribe().catch((error) => {
    appendLog(`Capture error: ${String(error)}`);
    stateMachine.transition("ERROR", "Capture failed");
  });
});

init().catch((error) => {
  appendLog(`Init error: ${String(error)}`);
  stateMachine.transition("ERROR", "Initialization failed");
});
