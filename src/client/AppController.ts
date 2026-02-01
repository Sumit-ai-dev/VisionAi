import { AudioAdapter } from "../adapters/audio/AudioAdapter";
import { CameraManager, CameraSourcePreference } from "../adapters/camera/CameraManager";
import { ControlAdapter } from "../adapters/control/ControlAdapter";
import { AwarenessController } from "../core/awarenessController";
import {
  AwarenessConfig,
  clampAwarenessInterval,
  createAwarenessConfig
} from "../core/awarenessConfig";
import { ChangeDetector } from "../core/changeDetector";
import { formatForSpeech, SceneDescription } from "../core/formatForSpeech";
import { IntentType, VisionMode } from "../core/intents";
import { RateLimiter } from "../core/rateLimiter";
import { SpeechPriority } from "../core/priorityQueue";
import { SpeechManager } from "../core/speechManager";
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
  awarenessToggle: HTMLInputElement;
  awarenessInterval: HTMLInputElement;
  awarenessIntervalValue: HTMLElement;
  awarenessModeSelect: HTMLSelectElement;
  lastSpokenReason: HTMLElement;
  lastVisionTimestamp: HTMLElement;
};

export type LogStore = {
  entries: string[];
  add: (message: string) => void;
};

type AppControllerOptions = {
  stateMachine: StateMachine;
  cameraManager: CameraManager;
  audioAdapter: AudioAdapter;
  controlAdapter: ControlAdapter;
  remoteAudio: HTMLAudioElement;
  elements: AppControllerElements;
  logStore: LogStore;
};

export class AppController {
  private stateMachine: StateMachine;
  private cameraManager: CameraManager;
  private audioAdapter: AudioAdapter;
  private controlAdapter: ControlAdapter;
  private remoteAudio: HTMLAudioElement;
  private elements: AppControllerElements;
  private logStore: LogStore;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private transcriptBuffer = "";
  private wakeTimeout: number | null = null;
  private speechTimeout: number | null = null;
  private wakeCountdownInterval: number | null = null;
  private wakeExpiresAt = 0;
  private currentMode: VisionMode = "scene";
  private audioUnlocked = false;
  private awarenessConfig: AwarenessConfig = createAwarenessConfig();
  private awarenessController: AwarenessController;
  private changeDetector = new ChangeDetector(3);
  private rateLimiter = new RateLimiter();
  private speechManager: SpeechManager;

  constructor(options: AppControllerOptions) {
    this.stateMachine = options.stateMachine;
    this.cameraManager = options.cameraManager;
    this.audioAdapter = options.audioAdapter;
    this.controlAdapter = options.controlAdapter;
    this.remoteAudio = options.remoteAudio;
    this.elements = options.elements;
    this.logStore = options.logStore;

    this.awarenessController = new AwarenessController(
      this.awarenessConfig,
      async (context) => {
        this.appendLog(
          `Awareness tick ${context.tickId} (${context.mode}, ${context.intervalMs}ms)`
        );
        await this.captureAndDescribe(context.mode, {
          reason: "awareness",
          allowSilent: true
        });
      }
    );

    this.speechManager = new SpeechManager({
      send: (text) => this.sendSpeech(text),
      cancel: () => this.cancelSpeech(),
      onStart: (item) => this.handleSpeechStart(item.text, item.reason)
    });

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

    this.elements.awarenessToggle.addEventListener("change", () => {
      if (this.elements.awarenessToggle.checked) {
        this.startAwareness("toggle");
      } else {
        this.stopAwareness("toggle");
      }
    });

    this.elements.awarenessInterval.addEventListener("input", () => {
      const nextValue = clampAwarenessInterval(
        Number(this.elements.awarenessInterval.value) * 1000
      );
      this.updateAwarenessConfig({ intervalMs: nextValue });
    });

    this.elements.awarenessModeSelect.addEventListener("change", () => {
      const mode = this.elements.awarenessModeSelect
        .value as AwarenessConfig["mode"];
      this.updateAwarenessConfig({ mode });
    });

    this.updateAwarenessUI();
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
    this.captureAndDescribe(this.currentMode, { reason: "manual", forceSpeak: true }).catch((error) => {
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
    this.logStore.add(message);
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

  private updateAwarenessUI() {
    this.elements.awarenessInterval.value = String(
      Math.round(this.awarenessConfig.intervalMs / 1000)
    );
    this.elements.awarenessIntervalValue.textContent = `${Math.round(
      this.awarenessConfig.intervalMs / 1000
    )}s`;
    this.elements.awarenessModeSelect.value = this.awarenessConfig.mode;
    this.elements.awarenessToggle.checked = this.awarenessConfig.enabled;
  }

  private updateAwarenessConfig(update: Partial<AwarenessConfig>) {
    const nextInterval = update.intervalMs ?? this.awarenessConfig.intervalMs;
    const clampedInterval = clampAwarenessInterval(nextInterval);
    if (clampedInterval !== nextInterval) {
      this.appendLog("Awareness interval out of range, clamped to limits.");
    }
    this.awarenessConfig = {
      ...this.awarenessConfig,
      ...update,
      intervalMs: clampedInterval
    };
    this.awarenessController.updateConfig(this.awarenessConfig);
    this.updateAwarenessUI();
  }

  private setLastSpokenReason(reason: string) {
    this.elements.lastSpokenReason.textContent = reason;
  }

  private setLastVisionTimestamp(timestamp: Date) {
    this.elements.lastVisionTimestamp.textContent = timestamp.toLocaleTimeString();
  }

  private startAwareness(source: "voice" | "toggle") {
    if (this.awarenessController.isRunning()) {
      return;
    }
    this.appendLog(`Awareness mode enabled (${source})`);
    this.updateAwarenessConfig({ enabled: true });
    this.awarenessController.start();
    this.speechManager.speak(
      "Awareness mode enabled. I will speak up for new hazards or meaningful changes.",
      "NORMAL",
      "manual request"
    );
  }

  private stopAwareness(source: "voice" | "toggle") {
    if (!this.awarenessController.isRunning()) {
      return;
    }
    this.appendLog(`Awareness mode disabled (${source})`);
    this.updateAwarenessConfig({ enabled: false });
    this.awarenessController.stop();
    this.stateMachine.transition("IDLE_LISTENING", "Awareness stopped");
    this.speechManager.speak(
      "Awareness mode stopped.",
      "NORMAL",
      "manual request"
    );
  }

  private speakStatus() {
    const modeLabel = this.formatModeLabel(this.currentMode);
    const awarenessLabel = this.awarenessController.isRunning()
      ? `on, ${this.awarenessConfig.mode} mode`
      : "off";
    const interval = Math.round(this.awarenessConfig.intervalMs / 1000);
    const message = `Status: ${modeLabel} mode. Awareness is ${awarenessLabel} with a ${interval}-second interval.`;
    this.speechManager.speak(message, "NORMAL", "manual request");
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
      this.speechManager.speak(
        "You can say: what's ahead, describe scene, read this, start awareness, stop awareness, status, or reset.",
        "NORMAL",
        "manual request"
      );
      return;
    }

    if (intentResult.intent === IntentType.RESET) {
      this.resetSession().catch((error) => {
        this.appendLog(`Reset error: ${String(error)}`);
        this.stateMachine.transition("ERROR", "Reset failed");
      });
      return;
    }

    if (intentResult.intent === IntentType.START_AWARENESS) {
      this.startAwareness("voice");
      return;
    }

    if (intentResult.intent === IntentType.STOP_AWARENESS) {
      this.stopAwareness("voice");
      return;
    }

    if (intentResult.intent === IntentType.STATUS) {
      this.speakStatus();
      return;
    }

    if (intentResult.slots.mode) {
      this.currentMode = intentResult.slots.mode;
    }
    this.elements.modeText.textContent = this.formatModeLabel(this.currentMode);
    const manualOverride =
      this.awarenessController.isRunning() &&
      intentResult.intent === IntentType.DESCRIBE_SCENE;
    const captureOptions = manualOverride
      ? { reason: "manual" as const, forceSpeak: true }
      : { reason: "manual" as const };
    this.captureAndDescribe(this.currentMode, captureOptions).catch((error) => {
      this.appendLog(`Capture error: ${String(error)}`);
      this.stateMachine.transition("ERROR", "Capture failed");
    });
  }

  private handleWakeIntent() {
    this.stateMachine.transition("WAKE_DETECTED", "Wake phrase detected");
    this.speechManager.speak("Yes?", "NORMAL", "manual request");
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

  private async captureAndDescribe(
    mode: VisionMode,
    options: { reason: "manual" | "awareness"; forceSpeak?: boolean; allowSilent?: boolean }
  ) {
    this.stateMachine.transition("CAPTURING", "Capturing image");
    const captureStart = performance.now();
    let imageBase64 = "";
    try {
      imageBase64 = await this.cameraManager.captureJpegBase64();
      const captureMs = Math.round(performance.now() - captureStart);
      this.appendLog(`Capture success (${captureMs}ms)`);
    } catch (error) {
      this.appendLog(`Capture failure: ${String(error)}`);
      this.handleFallbackSpeech("Sorry, I couldn't access the camera.");
      this.stateMachine.transition("ERROR", "Capture failed");
      return;
    }

    this.stateMachine.transition("THINKING", "Sending image to server");
    const requestStart = performance.now();
    const response = await fetch("/api/vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64_jpeg: imageBase64, mode })
    });
    const requestMs = Math.round(performance.now() - requestStart);
    this.appendLog(`Vision request ${requestMs}ms`);
    if (!response.ok) {
      const errorText = await response.text();
      this.appendLog(
        `Vision API error (${response.status}): ${errorText.substring(0, 200)}`
      );
      this.handleFallbackSpeech("Sorry, I couldn't analyze that. Please try again.");
      this.stateMachine.transition("ERROR", "Vision request failed");
      return;
    }

    const result = await response.json();
    const speech = formatForSpeech(result, mode);
    const description = this.isValidDescription(result) ? result : null;
    this.setLastVisionTimestamp(new Date());
    if (options.reason === "awareness" && !this.awarenessController.isRunning()) {
      this.appendLog("Awareness stopped; ignoring capture result");
      this.stateMachine.transition("IDLE_LISTENING", "Awareness stopped");
      return;
    }

    const forceSpeak = options.forceSpeak ?? options.reason === "manual";
    const allowSilent = options.allowSilent ?? false;

    if (!description) {
      this.appendLog("Decision: invalid vision response");
      if (forceSpeak) {
        this.queueSpeech(speech, "NORMAL", "manual request");
      } else if (!allowSilent) {
        this.handleFallbackSpeech("Sorry, I couldn't understand the scene.");
      } else {
        this.stateMachine.transition("IDLE_LISTENING", "No valid vision data");
      }
      return;
    }

    const highestHazardPriority = this.getHighestHazardPriority(description);
    const changeDecision = this.changeDetector.evaluate(description);
    this.changeDetector.record(description);

    if (options.reason === "awareness" && !forceSpeak) {
      if (changeDecision.reason === "baseline") {
        this.appendLog("Decision: baseline captured, no speech");
        this.stateMachine.transition("IDLE_LISTENING", "Baseline captured");
        return;
      }
      if (changeDecision.hazardChanged) {
        const priority = changeDecision.hazardPriority ?? highestHazardPriority;
        const decision = this.rateLimiter.shouldSpeak(priority, changeDecision.hazardKey);
        if (!decision.allowed) {
          this.appendLog(`Decision: ${decision.reason}`);
          this.stateMachine.transition("IDLE_LISTENING", decision.reason);
          return;
        }
        this.rateLimiter.recordSpeak(priority, changeDecision.hazardKey);
        const reason =
          priority === "CRITICAL" ? "CRITICAL hazard" : "hazard";
        this.queueSpeech(speech, priority, reason);
        this.appendLog(`Decision: spoke hazard (${priority})`);
        return;
      }
      if (changeDecision.objectsChanged) {
        const decision = this.rateLimiter.shouldSpeak("NORMAL");
        if (!decision.allowed) {
          this.appendLog(`Decision: ${decision.reason}`);
          this.stateMachine.transition("IDLE_LISTENING", decision.reason);
          return;
        }
        this.rateLimiter.recordSpeak("NORMAL");
        this.queueSpeech(speech, "NORMAL", "change");
        this.appendLog("Decision: spoke change update");
        return;
      }
      this.appendLog("Decision: no change");
      this.stateMachine.transition("IDLE_LISTENING", "No change");
      return;
    }

    if (!forceSpeak) {
      const decision = this.rateLimiter.shouldSpeak(highestHazardPriority);
      if (!decision.allowed) {
        this.appendLog(`Decision: ${decision.reason}`);
        this.stateMachine.transition("IDLE_LISTENING", decision.reason);
        return;
      }
      this.rateLimiter.recordSpeak(highestHazardPriority);
    }
    const hazardKey = this.getHazardKey(description);
    const manualDecision = this.rateLimiter.shouldSpeak(
      highestHazardPriority,
      hazardKey
    );
    if (!manualDecision.allowed) {
      this.appendLog(`Decision: ${manualDecision.reason}`);
      this.stateMachine.transition("IDLE_LISTENING", manualDecision.reason);
      return;
    }
    this.rateLimiter.recordSpeak(highestHazardPriority, hazardKey);
    const manualReason =
      highestHazardPriority === "CRITICAL"
        ? "CRITICAL hazard"
        : "manual request";
    this.queueSpeech(speech, highestHazardPriority, manualReason);
    this.appendLog("Decision: spoke manual request");
  }

  private queueSpeech(text: string, priority: SpeechPriority, reason: string) {
    if (priority === "CRITICAL") {
      this.speechManager.interruptAndSpeak(text, reason);
      return;
    }
    this.speechManager.speak(text, priority, reason);
  }

  private handleSpeechStart(text: string, reason: string) {
    this.stateMachine.transition("SPEAKING", "Speaking response");
    if (this.speechTimeout) {
      window.clearTimeout(this.speechTimeout);
    }
    this.speechTimeout = window.setTimeout(() => {
      if (this.stateMachine.state === "SPEAKING") {
        this.stateMachine.transition("IDLE_LISTENING", "Speech timeout");
      }
    }, 12000);

    this.elements.transcriptText.textContent = `🤖 AI: ${text}`;
    this.appendLog(`AI Description: ${text.substring(0, 80)}...`);
    this.setLastSpokenReason(reason);
  }

  private sendSpeech(text: string) {
    this.sendRealtimeEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "text",
            text
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

  private cancelSpeech() {
    this.appendLog("Speech interrupted");
    this.sendRealtimeEvent({ type: "response.cancel" });
  }

  private handleFallbackSpeech(message: string) {
    const decision = this.rateLimiter.shouldSpeak("NORMAL");
    if (!decision.allowed) {
      this.appendLog(`Decision: ${decision.reason}`);
      return;
    }
    this.rateLimiter.recordSpeak("NORMAL");
    this.queueSpeech(message, "NORMAL", "manual request");
  }

  private isValidDescription(value: unknown): value is SceneDescription {
    if (!value || typeof value !== "object") {
      return false;
    }
    const data = value as SceneDescription;
    return (
      Array.isArray(data.hazards) &&
      Array.isArray(data.objects) &&
      typeof data.environment === "object"
    );
  }

  private getHighestHazardPriority(description: SceneDescription): SpeechPriority {
    if (!description.hazards.length) {
      return "NORMAL";
    }
    if (description.hazards.some((hazard) => hazard.urgency === "critical")) {
      return "CRITICAL";
    }
    if (description.hazards.some((hazard) => hazard.urgency === "high")) {
      return "HIGH";
    }
    return "NORMAL";
  }

  private getHazardKey(description: SceneDescription): string | undefined {
    const hazard = description.hazards[0];
    if (!hazard) {
      return undefined;
    }
    return `${hazard.label.trim().toLowerCase()}|${hazard.clock}|${hazard.distance}`;
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
            "You are VisionAI Nexus. Stay silent until the wake phrase 'Hey Nexus' is detected. After wake, interpret the user's intent (scene, ahead, read text, start awareness, stop awareness, status, help, reset). If vision is requested, call get_scene_description with the mode and image. Speak only the formatted short speech in 1-2 sentences, safety-first.",
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
          this.speechManager.handleSpeechDone();
          if (!this.speechManager.isSpeaking()) {
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
    this.awarenessController.stop();
    this.updateAwarenessConfig({ enabled: false });
    this.currentMode = "scene";
    this.elements.intentText.textContent = IntentType.NONE;
    this.elements.modeText.textContent = this.formatModeLabel(this.currentMode);
    this.elements.lastSpokenReason.textContent = "—";
    this.elements.lastVisionTimestamp.textContent = "—";
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
