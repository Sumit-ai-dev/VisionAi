import OpenAI from "openai";
import { OPENAI_API_KEY, VISION_MODEL } from "./config";
import { VISION_PROMPT } from "./visionPrompt";

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

const CLOCK_VALUES = new Set(
  ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"].map(
    (hour) => `${hour} o'clock`
  )
);
const DISTANCE_VALUES = new Set(["close", "medium", "far"]);
const URGENCY_VALUES = new Set(["critical", "high", "none"]);
const INDOOR_VALUES = new Set(["indoor", "outdoor", "unknown"]);

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const safeFallback = (): SceneDescription => ({
  hazards: [],
  objects: [],
  environment: {
    indoor_outdoor: "unknown",
    context: "unknown"
  },
  short_speech: "Sorry, I couldn't analyze the scene. Please try again."
});

const getOutputText = (response: OpenAI.Responses.Response) => {
  if (response.output_text) {
    return response.output_text;
  }
  const chunks = response.output ?? [];
  const text = chunks
    .flatMap((item) => item.content ?? [])
    .map((content) => ("text" in content ? content.text : ""))
    .join("\n");
  return text;
};

const isValidClock = (value: unknown): value is string =>
  typeof value === "string" && CLOCK_VALUES.has(value);

const isValidDistance = (value: unknown): value is "close" | "medium" | "far" =>
  typeof value === "string" && DISTANCE_VALUES.has(value);

const isValidUrgency = (value: unknown): value is "critical" | "high" | "none" =>
  typeof value === "string" && URGENCY_VALUES.has(value);

const isValidIndoor = (
  value: unknown
): value is "indoor" | "outdoor" | "unknown" =>
  typeof value === "string" && INDOOR_VALUES.has(value);

const validateSceneJson = (payload: unknown): payload is SceneDescription => {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const data = payload as SceneDescription;
  if (!Array.isArray(data.hazards) || !Array.isArray(data.objects)) {
    return false;
  }
  if (!data.environment || typeof data.environment !== "object") {
    return false;
  }
  if (typeof data.short_speech !== "string") {
    return false;
  }

  const hazardsValid = data.hazards.every(
    (hazard) =>
      hazard &&
      typeof hazard.label === "string" &&
      isValidClock(hazard.clock) &&
      isValidDistance(hazard.distance) &&
      isValidUrgency(hazard.urgency)
  );
  const objectsValid = data.objects.every(
    (obj) =>
      obj &&
      typeof obj.label === "string" &&
      isValidClock(obj.clock) &&
      isValidDistance(obj.distance)
  );
  const envValid =
    isValidIndoor(data.environment.indoor_outdoor) &&
    typeof data.environment.context === "string";

  return hazardsValid && objectsValid && envValid;
};

const requestVision = async (imageBase64: string, prompt: string) => {
  const response = await openai.responses.create({
    model: VISION_MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          {
            type: "input_image",
            image_url: `data:image/jpeg;base64,${imageBase64}`
          }
        ]
      }
    ],
    temperature: 0.2
  });
  return getOutputText(response).trim();
};

export const getSceneDescription = async (
  imageBase64: string
): Promise<SceneDescription> => {
  if (!OPENAI_API_KEY) {
    return safeFallback();
  }

  const raw = await requestVision(imageBase64, VISION_PROMPT);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (validateSceneJson(parsed)) {
      return parsed;
    }
  } catch {
    // ignore parsing errors
  }

  const retryPrompt = `${VISION_PROMPT}\n\nFix JSON to match schema; output JSON only.`;
  const retryRaw = await requestVision(imageBase64, retryPrompt);
  try {
    const parsed = JSON.parse(retryRaw) as unknown;
    if (validateSceneJson(parsed)) {
      return parsed;
    }
  } catch {
    // ignore parsing errors
  }

  return safeFallback();
};
