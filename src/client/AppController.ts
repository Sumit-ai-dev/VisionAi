import { AudioAdapter } from "../adapters/audio/AudioAdapter";
import { CameraManager, CameraSourcePreference } from "../adapters/camera/CameraManager";
import { ControlAdapter } from "../adapters/control/ControlAdapter";
import { formatForSpeech } from "../core/formatForSpeech";
import { IntentType, VisionMode } from "../core/intents";
import { StateMachine } from "../core/stateMachine";

export type AppControllerElements = {
  statusText: HTMLElement;
  stateText: HTMLElement;
  transcriptText: HTMLElement;
  debugLog: HTMLUListElement;
  cameraPreview: HTMLVideoElement;
  cameraWarning: HTMLElement;
  captureButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  intentText: HTMLElement;
  modeText: HTMLElement;
  wakeCountdownText: HTMLElement;
  audioInputText: HTMLElement;
  audioOutputText: HTMLElement;
  audioUnlockText: HTMLElement;
  outputSupportText: HTMLElement;
  cameraSourceSelect: HTMLSelectElement;
  cameraAdapterText: HTMLElement;
};

type AppControllerOptions = {
  stateMachine: StateMachine;
  cameraManager: CameraManager;
  audioAdapter: AudioAdapter;
  controlAdapter: ControlAdapter;
  remoteAudio: HTMLAudioElement;
  elements: AppControllerElements;
};

export class AppController {
  private stateMachine: StateMachine;
  private cameraManager: CameraManager;
  private audioAdapter: AudioAdapter;
  private controlAdapter: ControlAdapter;
  private remoteAudio: HTMLAudioElement;
  private elements: AppControllerElements;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private transcriptBuffer = "";
  private wakeTimeout: number | null = null;
  private speechTimeout: number | null = null;
  private wakeCountdownInterval: number | null = null;
  private wakeExpiresAt = 0;
  private currentMode: VisionMode = "scene";
  private audioUnlocked = false;

  constructor(options: AppControllerOptions) {
    this.stateMachine = options.stateMachine;
    this.cameraManager = options.cameraManager;
    this.audioAdapter = options.audioAdapter;
    this.controlAdapter = options.controlAdapter;
    this.remoteAudio = options.remoteAudio;
    this.elements = options.elements;

    this.stateMachine.onChange((next) => this.updateStatus(next));

    this.controlAdapter.onWake(() => {
      this.handleWakeIntent();
    });

    this.controlAdapter.onReset(() => {
      this.resetSession().catch((error) => {
        this.appendLog(`Reset error: ${String(error)}`);
        this.stateMachine.transition("ERROR", "Reset failed");
      });
    });

    this.elements.cameraSourceSelect.value = this.cameraManager.getPreference();
    this.elements.cameraSourceSelect.addEventListener("change", (event) => {
      const value = (event.target as HTMLSelectElement)
        .value as CameraSourcePreference;
      this.cameraManager.setPreference(value);
      this.appendLog(`Camera preference set to ${value}`);
      this.cameraManager
        .startPreview(this.elements.cameraPreview)
        .then(() => this.updateCameraDebug())
        .catch((error) => {
          this.elements.cameraWarning.textContent =
            "Camera permission denied or unavailable. Capture will fail.";
          this.appendLog(`Camera error: ${String(error)}`);
        });
    });
  }

  async start(): Promise<void> {
    this.bindAudioUnlock();
    this.elements.intentText.textContent = IntentType.NONE;
    this.elements.modeText.textContent = this.formatModeLabel(this.currentMode);
    this.updateCameraDebug();
    this.refreshAudioDebug().catch(() => undefined);
    try {
      await this.cameraManager.startPreview(this.elements.cameraPreview);
      this.updateCameraDebug();
    } catch (error) {
      this.elements.cameraWarning.textContent =
        "Camera permission denied or unavailable. Capture will fail.";
      this.appendLog(`Camera error: ${String(error)}`);
    }

    try {
      await this.setupRealtime();
      this.refreshAudioDebug().catch(() => undefined);
    } catch (error) {
      this.appendLog(`Realtime error: ${String(error)}`);
      this.stateMachine.transition("ERROR", "Realtime initialization failed");
    }
  }

  handleCapture(): void {
    this.appendLog("Manual capture triggered");
    this.captureAndDescribe(this.currentMode).catch((error) => {
      this.appendLog(`Capture error: ${String(error)}`);
      this.stateMachine.transition("ERROR", "Capture failed");
    });
  }

  handleReset(): void {
    this.resetSession().catch((error) => {
      this.appendLog(`Reset error: ${String(error)}`);
      this.stateMachine.transition("ERROR", "Reset failed");
    });
  }

  private updateStatus(next: string) {
    this.elements.stateText.textContent = next;
    const mapping: Record<string, string> = {
      IDLE_LISTENING: "Listening",
      WAKE_DETECTED: "Wake detected",
      CAPTURING: "Capturing",
      THINKING: "Thinking",
      SPEAKING: "Speaking",
      ERROR: "Error"
    };
    this.elements.statusText.textContent = mapping[next];
    if (next !== "WAKE_DETECTED") {
      this.elements.wakeCountdownText.textContent = "—";
    }
  }

  private appendLog(message: string) {
    const entry = document.createElement("li");
    entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
    this.elements.debugLog.prepend(entry);
    while (this.elements.debugLog.children.length > 20) {
      this.elements.debugLog.removeChild(
        this.elements.debugLog.lastChild as Node
      );
    }
  }

  private bindAudioUnlock() {
    const handler = () => {
      this.unlockAudio("user-gesture").catch(() => undefined);
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", handler);
      this.elements.captureButton.removeEventListener("click", handler);
      this.elements.resetButton.removeEventListener("click", handler);
    };
    document.addEventListener("click", handler);
    document.addEventListener("keydown", handler);
    this.elements.captureButton.addEventListener("click", handler);
    this.elements.resetButton.addEventListener("click", handler);
  }

  private async unlockAudio(reason: string) {
    if (this.audioUnlocked) {
      return;
    }
    try {
      await this.audioAdapter.ensureAudioUnlocked();
      this.audioUnlocked = true;
      this.elements.audioUnlockText.textContent = "Yes";
      this.appendLog(`Audio unlocked (${reason})`);
    } catch (error) {
      this.appendLog(`Audio unlock failed (${reason}): ${String(error)}`);
    }
  }

  private sendRealtimeEvent(payload: Record<string, unknown>) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") {
      this.appendLog("Data channel not ready");
      return;
    }
    this.dataChannel.send(JSON.stringify(payload));
  }

  private formatModeLabel(mode: VisionMode) {
    if (mode === "ahead") {
      return "Ahead";
    }
    if (mode === "read_text") {
      return "Read";
    }
    return "Scene";
  }

  private handleTranscript(text: string, isFinal: boolean) {
    const cleaned = text.trim();
    if (!cleaned) {
      return;
    }
    this.elements.transcriptText.textContent = cleaned;
    if (!isFinal) {
      return;
    }
    this.appendLog(`Transcript final: ${cleaned}`);

    const intentResult = this.controlAdapter.handleTranscript(
      cleaned,
      true,
      this.stateMachine.state === "WAKE_DETECTED"
    );
    if (!intentResult) {
      return;
    }

    this.elements.intentText.textContent = intentResult.intent;

    if (intentResult.intent === IntentType.WAKE) {
      return;
    }

    if (intentResult.intent === IntentType.NONE) {
      return;
    }

    if (this.stateMachine.state !== "WAKE_DETECTED") {
      if (!intentResult.wakeDetected) {
        this.appendLog("Intent ignored (wake not active)");
        return;
      }
      this.stateMachine.transition(
        "WAKE_DETECTED",
        "Wake + command in one utterance"
      );
      this.startWakeTimeout();
    }

    if (this.wakeTimeout) {
      window.clearTimeout(this.wakeTimeout);
    }
    if (this.wakeCountdownInterval) {
      window.clearInterval(this.wakeCountdownInterval);
    }
    this.elements.wakeCountdownText.textContent = "—";

    if (intentResult.intent === IntentType.HELP) {
      this.sendRealtimeEvent({
        type: "response.create",
        response: {
          modalities: ["audio"],
          instructions:
            "You can say: what's ahead, describe scene, read this, or reset.",
          voice: "alloy"
        }
      });
      this.stateMachine.transition("SPEAKING", "Help requested");
      return;
    }

    if (intentResult.intent === IntentType.RESET) {
      this.resetSession().catch((error) => {
        this.appendLog(`Reset error: ${String(error)}`);
        this.stateMachine.transition("ERROR", "Reset failed");
      });
      return;
    }

    if (intentResult.slots.mode) {
      this.currentMode = intentResult.slots.mode;
    }
    this.elements.modeText.textContent = this.formatModeLabel(this.currentMode);
    this.captureAndDescribe(this.currentMode).catch((error) => {
      this.appendLog(`Capture error: ${String(error)}`);
      this.stateMachine.transition("ERROR", "Capture failed");
    });
  }

  private handleWakeIntent() {
    this.stateMachine.transition("WAKE_DETECTED", "Wake phrase detected");
    this.sendRealtimeEvent({
      type: "response.create",
      response: {
        modalities: ["audio"],
        instructions: "Yes?",
        voice: "alloy"
      }
    });
    this.startWakeTimeout();
  }

  private startWakeTimeout() {
    if (this.wakeTimeout) {
      window.clearTimeout(this.wakeTimeout);
    }
    if (this.wakeCountdownInterval) {
      window.clearInterval(this.wakeCountdownInterval);
    }
    this.wakeExpiresAt = Date.now() + 8000;
    this.wakeTimeout = window.setTimeout(() => {
      this.stateMachine.transition("IDLE_LISTENING", "Wake window expired");
      this.elements.wakeCountdownText.textContent = "—";
    }, 8000);
    this.wakeCountdownInterval = window.setInterval(() => {
      const remainingMs = this.wakeExpiresAt - Date.now();
      if (remainingMs <= 0) {
        this.elements.wakeCountdownText.textContent = "0s";
        if (this.wakeCountdownInterval) {
          window.clearInterval(this.wakeCountdownInterval);
        }
        return;
      }
      this.elements.wakeCountdownText.textContent = `${Math.ceil(
        remainingMs / 1000
      )}s`;
    }, 250);
  }

  private async captureAndDescribe(mode: VisionMode) {
    this.stateMachine.transition("CAPTURING", "Capturing image");
    const imageBase64 = await this.cameraManager.captureJpegBase64();

    this.stateMachine.transition("THINKING", "Sending image to server");
    const response = await fetch("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64_jpeg: imageBase64, mode })
    });
    if (!response.ok) {
      const errorText = await response.text();
      this.appendLog(
        `Vision API error (${response.status}): ${errorText.substring(0, 200)}`
      );
      throw new Error(`Vision request failed: ${response.status}`);
    }
    const result = await response.json();
    const speech = formatForSpeech(result, mode);

    this.stateMachine.transition("SPEAKING", "Speaking response");
    if (this.speechTimeout) {
      window.clearTimeout(this.speechTimeout);
    }
    this.speechTimeout = window.setTimeout(() => {
      if (this.stateMachine.state === "SPEAKING") {
        this.stateMachine.transition("IDLE_LISTENING", "Speech timeout");
      }
    }, 12000);

    this.elements.transcriptText.textContent = `🤖 AI: ${speech}`;
    this.appendLog(`AI Description: ${speech.substring(0, 80)}...`);

    this.sendRealtimeEvent({
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

    this.sendRealtimeEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"]
      }
    });
  }

  private async setupRealtime() {
    this.stateMachine.transition("IDLE_LISTENING", "Initializing session");
    this.peerConnection = new RTCPeerConnection();
    this.dataChannel = this.peerConnection.createDataChannel("events");

    const micStream = await this.audioAdapter.getMicrophoneStream();
    this.unlockAudio("mic-permission").catch(() => undefined);
    const audioTracks = micStream.getAudioTracks();
    this.appendLog(`Audio tracks: ${audioTracks.length}`);
    if (audioTracks.length === 0) {
      throw new Error("Microphone access failed");
    }
    micStream.getTracks().forEach((track) => {
      this.peerConnection?.addTrack(track, micStream);
    });

    this.peerConnection.ontrack = (event) => {
      this.appendLog(`Incoming audio track received (${event.streams.length} streams)`);
      if (event.streams[0]) {
        this.remoteAudio.srcObject = event.streams[0];
        this.appendLog("Audio stream connected to audio element");
        this.remoteAudio
          .play()
          .then(() => {
            this.appendLog("✅ Audio playback started successfully");
          })
          .catch((error) => {
            this.appendLog(`❌ Audio playback error: ${String(error)}`);
          });
      }
    };

    this.dataChannel.onopen = () => {
      this.appendLog("Data channel open");
      this.sendRealtimeEvent({
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

    this.dataChannel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const type = message.type as string | undefined;
        this.appendLog(`Event: ${type || "unknown"}`);

        if (type === "response.audio_transcript.delta") {
          this.transcriptBuffer += message.delta ?? "";
          this.handleTranscript(this.transcriptBuffer, false);
        }
        if (type === "response.audio_transcript.done") {
          this.transcriptBuffer = message.transcript ?? this.transcriptBuffer;
          this.handleTranscript(this.transcriptBuffer, true);
          this.transcriptBuffer = "";
        }
        if (type === "conversation.item.input_audio_transcription.completed") {
          const userText = message.transcript ?? "";
          this.handleTranscript(userText, true);
        }
        if (type === "response.done") {
          if (this.stateMachine.state === "SPEAKING") {
            this.stateMachine.transition("IDLE_LISTENING", "Speech complete");
          }
          if (this.speechTimeout) {
            window.clearTimeout(this.speechTimeout);
          }
        }
      } catch (error) {
        this.appendLog(`Event parse error: ${String(error)}`);
      }
    };

    await new Promise((resolve) => window.setTimeout(resolve, 100));

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    const response = await fetch("/api/realtime/offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: offer.sdp })
    });
    if (!response.ok) {
      throw new Error("Realtime offer failed");
    }
    const data = await response.json();
    await this.peerConnection.setRemoteDescription({ type: "answer", sdp: data.sdp });
  }

  private async resetSession() {
    this.appendLog("Resetting session");
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    this.transcriptBuffer = "";
    if (this.wakeTimeout) {
      window.clearTimeout(this.wakeTimeout);
    }
    if (this.wakeCountdownInterval) {
      window.clearInterval(this.wakeCountdownInterval);
    }
    this.elements.wakeCountdownText.textContent = "—";
    this.currentMode = "scene";
    this.elements.intentText.textContent = IntentType.NONE;
    this.elements.modeText.textContent = this.formatModeLabel(this.currentMode);
    await this.setupRealtime();
  }

  private async refreshAudioDebug() {
    const inputDevices = await this.audioAdapter.getInputDevices();
    const outputDevices = await this.audioAdapter.getOutputDevices();
    const debugState = this.audioAdapter.getDebugState();

    const inputLabel =
      inputDevices.find((device) =>
        debugState.preferredInputId
          ? device.deviceId === debugState.preferredInputId
          : device.deviceId === "default"
      )?.label ?? "System default";

    const outputLabel =
      outputDevices.find((device) =>
        debugState.preferredOutputId
          ? device.deviceId === debugState.preferredOutputId
          : device.deviceId === "default"
      )?.label ?? "System default";

    this.elements.audioInputText.textContent = inputLabel || "Unknown";
    this.elements.audioOutputText.textContent = outputLabel || "Unknown";
    this.elements.outputSupportText.textContent = debugState.outputSelectionSupported
      ? "Yes"
      : "No";
    this.elements.audioUnlockText.textContent = debugState.audioUnlocked
      ? "Yes"
      : "No";
  }

  private updateCameraDebug() {
    const activeAdapter = this.cameraManager.getActiveAdapterName();
    this.elements.cameraAdapterText.textContent = activeAdapter
      ? activeAdapter
      : "Not selected";
  }
}
