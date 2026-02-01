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

const remoteAudio = document.createElement("audio");
remoteAudio.autoplay = true;
remoteAudio.id = "remoteAudio";
remoteAudio.className = "remote-audio";
document.body.appendChild(remoteAudio);

const stateMachine = new StateMachine("IDLE_LISTENING", (message) => {
  const entry = document.createElement("li");
  entry.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  debugLog.prepend(entry);
  while (debugLog.children.length > 20) {
    debugLog.removeChild(debugLog.lastChild as Node);
  }
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
    cameraAdapterText
  }
});

resetButton.addEventListener("click", () => {
  controller.handleReset();
});

captureButton.addEventListener("click", () => {
  controller.handleCapture();
});

controller.start().catch((error) => {
  const entry = document.createElement("li");
  entry.textContent = `${new Date().toLocaleTimeString()} - Init error: ${String(
    error
  )}`;
  debugLog.prepend(entry);
  stateMachine.transition("ERROR", "Initialization failed");
});
