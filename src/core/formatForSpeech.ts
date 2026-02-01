import { VisionMode } from "./intents";

export type SceneDescription = {
  hazards: Array<{
    label: string;
    clock: string;
    distance: "close" | "medium" | "far";
    urgency: "critical" | "high" | "none";
  }>;
  objects: Array<{
    label: string;
    clock: string;
    distance: "close" | "medium" | "far";
  }>;
  environment: {
    indoor_outdoor: "indoor" | "outdoor" | "unknown";
    context: string;
  };
  short_speech: string;
};

const safeFallback =
  "Sorry, I couldn't analyze that. Please try again.";

const joinSentences = (sentences: string[]) =>
  sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

const formatHazards = (description: SceneDescription) => {
  if (!description.hazards?.length) {
    return "";
  }
  const hazard = description.hazards[0];
  return `Caution: ${hazard.label} at ${hazard.clock}, ${hazard.distance}.`;
};

const formatObjects = (description: SceneDescription) => {
  if (!description.objects?.length) {
    return "";
  }
  const topObjects = description.objects.slice(0, 2);
  const objectText = topObjects
    .map((obj) => `${obj.label} at ${obj.clock}, ${obj.distance}`)
    .join("; ");
  return `${objectText}.`;
};

const formatOcr = (description: SceneDescription) => {
  const text =
    description.environment?.context?.trim() ||
    description.short_speech?.trim();
  if (!text) {
    return "I couldn't read any text.";
  }
  return `The text says: ${text}.`;
};

const isValidDescription = (value: unknown): value is SceneDescription => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const data = value as SceneDescription;
  return (
    Array.isArray(data.hazards) &&
    Array.isArray(data.objects) &&
    !!data.environment &&
    typeof data.environment === "object"
  );
};

export const formatForSpeech = (
  description: unknown,
  mode: VisionMode
): string => {
  if (!isValidDescription(description)) {
    return safeFallback;
  }

  if (mode === "read_text") {
    return formatOcr(description);
  }

  const hazards = formatHazards(description);
  const objects = formatObjects(description);
  const fallbackSpeech = description.short_speech?.trim() || safeFallback;
  const sentences = [hazards, objects];
  const formatted = joinSentences(sentences);
  return formatted || fallbackSpeech;
};
