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

const normalizeClock = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isInteger(value)) {
    const hour = value === 0 ? 12 : value;
    if (hour >= 1 && hour <= 12) {
      return `${hour} o'clock`;
    }
  }
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value
    .toLowerCase()
    .replace("o’clock", "o'clock")
    .replace("oclock", "o'clock")
    .replace(/[^0-9o' ]/g, " ")
    .trim();
  const match = normalized.match(/\b(1[0-2]|[1-9])\b/);
  if (!match) {
    return null;
  }
  return `${match[1]} o'clock`;
};

const normalizeDistance = (value: unknown): "close" | "medium" | "far" | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.toLowerCase();
  if (["close", "near", "nearby", "short"].includes(normalized)) {
    return "close";
  }
  if (["medium", "mid", "middle"].includes(normalized)) {
    return "medium";
  }
  if (["far", "distant", "long"].includes(normalized)) {
    return "far";
  }
  if (DISTANCE_VALUES.has(normalized)) {
    return normalized as "close" | "medium" | "far";
  }
  return null;
};

const normalizeUrgency = (value: unknown): "critical" | "high" | "none" | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.toLowerCase();
  if (["critical", "urgent", "emergency"].includes(normalized)) {
    return "critical";
  }
  if (["high", "medium", "moderate"].includes(normalized)) {
    return "high";
  }
  if (["none", "low", "minor", "neutral"].includes(normalized)) {
    return "none";
  }
  if (URGENCY_VALUES.has(normalized)) {
    return normalized as "critical" | "high" | "none";
  }
  return null;
};

const normalizeIndoor = (value: unknown): "indoor" | "outdoor" | "unknown" => {
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.toLowerCase();
  if (normalized.includes("in")) {
    return "indoor";
  }
  if (normalized.includes("out")) {
    return "outdoor";
  }
  if (INDOOR_VALUES.has(normalized)) {
    return normalized as "indoor" | "outdoor" | "unknown";
  }
  return "unknown";
};

const ensureArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const coerceLabel = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const coerceSceneDescription = (payload: unknown): SceneDescription | null => {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const data = payload as Record<string, unknown>;
  const hazardsRaw = ensureArray(
    data.hazards ?? data.hazard ?? data.dangers ?? data.risks
  );
  const objectsRaw = ensureArray(
    data.objects ?? data.items ?? data.obstacles ?? data.features
  );
  const environmentRaw = (data.environment ?? data.scene ?? data.setting) as
    | Record<string, unknown>
    | undefined;
  const shortSpeechRaw =
    data.short_speech ??
    data.shortSpeech ??
    data.summary ??
    data.description ??
    data.speech;

  const hazards = hazardsRaw
    .map((hazard) => {
      if (!hazard || typeof hazard !== "object") {
        return null;
      }
      const hazardRecord = hazard as Record<string, unknown>;
      const label = coerceLabel(hazardRecord.label ?? hazardRecord.name);
      const clock = normalizeClock(hazardRecord.clock ?? hazardRecord.position);
      const distance = normalizeDistance(
        hazardRecord.distance ?? hazardRecord.range
      );
      const urgency = normalizeUrgency(
        hazardRecord.urgency ?? hazardRecord.level ?? hazardRecord.severity
      );
      if (!label || !clock || !distance || !urgency) {
        return null;
      }
      return { label, clock, distance, urgency };
    })
    .filter((item): item is SceneDescription["hazards"][number] => !!item);

  const objects = objectsRaw
    .map((obj) => {
      if (!obj || typeof obj !== "object") {
        return null;
      }
      const objRecord = obj as Record<string, unknown>;
      const label = coerceLabel(objRecord.label ?? objRecord.name);
      const clock = normalizeClock(objRecord.clock ?? objRecord.position);
      const distance = normalizeDistance(
        objRecord.distance ?? objRecord.range
      );
      if (!label || !clock || !distance) {
        return null;
      }
      return { label, clock, distance };
    })
    .filter((item): item is SceneDescription["objects"][number] => !!item);

  const indoorOutdoor = normalizeIndoor(
    environmentRaw?.indoor_outdoor ??
      environmentRaw?.indoorOutdoor ??
      environmentRaw?.indoor ??
      environmentRaw?.outdoor
  );
  const context =
    typeof environmentRaw?.context === "string" && environmentRaw.context.trim()
      ? environmentRaw.context.trim()
      : "unknown";

  const shortSpeech =
    typeof shortSpeechRaw === "string" && shortSpeechRaw.trim()
      ? shortSpeechRaw.trim()
      : "";

  if (!hazards.length && !objects.length && !shortSpeech) {
    return null;
  }

  return {
    hazards,
    objects,
    environment: {
      indoor_outdoor: indoorOutdoor,
      context
    },
    short_speech: shortSpeech || safeFallback().short_speech
  };
};

const extractJson = (raw: string): string | null => {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return raw.slice(start, end + 1);
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
      const coerced = coerceSceneDescription(parsed);
      if (coerced) {
        console.log("[Vision] Validation relaxed, using coerced response");
        return coerced;
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
      const coerced = coerceSceneDescription(parsed);
      if (coerced) {
        console.log("[Vision] Retry relaxed validation passed");
        return coerced;
      }
      const extracted = extractJson(retryRaw);
      if (extracted) {
        const parsedExtracted = JSON.parse(extracted) as unknown;
        if (validateSceneJson(parsedExtracted)) {
          console.log("[Vision] Retry extracted JSON validation passed");
          return parsedExtracted;
        }
        const coercedExtracted = coerceSceneDescription(parsedExtracted);
        if (coercedExtracted) {
          console.log("[Vision] Retry extracted JSON coerced");
          return coercedExtracted;
        }
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
