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
  const response = await openai.chat.completions.create({
    model: VISION_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`
            }
          }
        ]
      }
    ],
    temperature: 0.2
  });
  return response.choices[0]?.message?.content?.trim() || "";
};

export const getSceneDescription = async (
  imageBase64: string
): Promise<SceneDescription> => {
  if (!OPENAI_API_KEY) {
    console.error("[Vision] Missing API key");
    return safeFallback();
  }

  try {
    const raw = await requestVision(imageBase64, VISION_PROMPT);
    console.log("[Vision] Raw response length:", raw.length);
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (validateSceneJson(parsed)) {
        console.log("[Vision] Validation passed");
        return parsed;
      }
      console.log("[Vision] Validation failed, retrying");
    } catch (e) {
      console.error("[Vision] JSON parse error:", e);
    }

    const retryPrompt = `${VISION_PROMPT}\n\nFix JSON to match schema; output JSON only.`;
    const retryRaw = await requestVision(imageBase64, retryPrompt);
    try {
      const parsed = JSON.parse(retryRaw) as unknown;
      if (validateSceneJson(parsed)) {
        console.log("[Vision] Retry validation passed");
        return parsed;
      }
      console.log("[Vision] Retry validation failed");
    } catch (e) {
      console.error("[Vision] Retry JSON parse error:", e);
    }

    console.error("[Vision] Both attempts failed, returning fallback");
    return safeFallback();
  } catch (error) {
    console.error("[Vision] Fatal error:", error);
    return safeFallback();
  }
};
