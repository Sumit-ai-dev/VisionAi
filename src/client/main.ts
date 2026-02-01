import { WebAudioAdapter } from "../adapters/audio/WebAudioAdapter";
import { CameraManager } from "../adapters/camera/CameraManager";
import { TranscriptControlAdapter } from "../adapters/control/TranscriptControlAdapter";
import { StateMachine } from "../core/stateMachine";
import { AppController } from "./AppController";

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
const audioInputText = document.getElementById("audioInputText") as HTMLElement;
const audioOutputText = document.getElementById("audioOutputText") as HTMLElement;
const audioUnlockText = document.getElementById("audioUnlockText") as HTMLElement;
const outputSupportText = document.getElementById("outputSupportText") as HTMLElement;
const cameraSourceSelect = document.getElementById(
  "cameraSourceSelect"
) as HTMLSelectElement;
const cameraAdapterText = document.getElementById(
  "cameraAdapterText"
) as HTMLElement;
const awarenessToggle = document.getElementById(
  "awarenessToggle"
) as HTMLInputElement;
const awarenessInterval = document.getElementById(
  "awarenessInterval"
) as HTMLInputElement;
const awarenessIntervalValue = document.getElementById(
  "awarenessIntervalValue"
) as HTMLElement;
const awarenessModeSelect = document.getElementById(
  "awarenessModeSelect"
) as HTMLSelectElement;
const lastSpokenReason = document.getElementById(
  "lastSpokenReason"
) as HTMLElement;
const lastVisionTimestamp = document.getElementById(
  "lastVisionTimestamp"
) as HTMLElement;
const downloadLogsButton = document.getElementById(
  "downloadLogsButton"
) as HTMLButtonElement;

const remoteAudio = document.createElement("audio");
remoteAudio.autoplay = true;
remoteAudio.id = "remoteAudio";
remoteAudio.className = "remote-audio";
document.body.appendChild(remoteAudio);

const logStore = {
  entries: [] as string[],
  add: (message: string) => {
    const entryText = `${new Date().toLocaleTimeString()} - ${message}`;
    logStore.entries.unshift(entryText);
    if (logStore.entries.length > 200) {
      logStore.entries.pop();
    }
    const entry = document.createElement("li");
    entry.textContent = entryText;
    debugLog.prepend(entry);
    while (debugLog.children.length > 200) {
      debugLog.removeChild(debugLog.lastChild as Node);
    }
  }
};

const stateMachine = new StateMachine("IDLE_LISTENING", (message) => {
  logStore.add(message);
});

const cameraManager = new CameraManager({
  onSelection: (adapterName) => {
    cameraAdapterText.textContent = adapterName;
  }
});

const audioAdapter = new WebAudioAdapter({ outputElement: remoteAudio });
const controlAdapter = new TranscriptControlAdapter();

const controller = new AppController({
  stateMachine,
  cameraManager,
  audioAdapter,
  controlAdapter,
  remoteAudio,
  elements: {
    statusText,
    stateText,
    transcriptText,
    debugLog,
    cameraPreview,
    cameraWarning,
    captureButton,
    resetButton,
    intentText,
    modeText,
    wakeCountdownText,
    audioInputText,
    audioOutputText,
    audioUnlockText,
    outputSupportText,
    cameraSourceSelect,
    cameraAdapterText,
    awarenessToggle,
    awarenessInterval,
    awarenessIntervalValue,
    awarenessModeSelect,
    lastSpokenReason,
    lastVisionTimestamp
  },
  logStore
});

resetButton.addEventListener("click", () => {
  controller.handleReset();
});

captureButton.addEventListener("click", () => {
  controller.handleCapture();
});

controller.start().catch((error) => {
  logStore.add(`Init error: ${String(error)}`);
  stateMachine.transition("ERROR", "Initialization failed");
});

downloadLogsButton.addEventListener("click", () => {
  const blob = new Blob([logStore.entries.slice().reverse().join("\n")], {
    type: "text/plain"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "visionai-nexus-logs.txt";
  anchor.click();
  URL.revokeObjectURL(url);
});
