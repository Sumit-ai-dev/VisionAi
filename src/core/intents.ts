export enum IntentType {
  NONE = "NONE",
  WAKE = "WAKE",
  DESCRIBE_SCENE = "DESCRIBE_SCENE",
  AHEAD_ONLY = "AHEAD_ONLY",
  READ_TEXT = "READ_TEXT",
  HELP = "HELP",
  RESET = "RESET",
  START_AWARENESS = "START_AWARENESS",
  STOP_AWARENESS = "STOP_AWARENESS",
  STATUS = "STATUS"
}

export type VisionMode = "scene" | "ahead" | "read_text";

export type IntentSlots = {
  mode?: VisionMode;
};

export type IntentResult = {
  intent: IntentType;
  confidence: number;
  slots: IntentSlots;
  wakeDetected: boolean;
  normalized: string;
};
