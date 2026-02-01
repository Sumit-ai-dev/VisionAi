import { IntentResult, IntentType, VisionMode } from "./intents";

const WAKE_PHRASE = "hey nexus";

const INTENT_PHRASES: Record<IntentType, string[]> = {
  [IntentType.NONE]: [],
  [IntentType.WAKE]: [WAKE_PHRASE],
  [IntentType.DESCRIBE_SCENE]: [
    "what do you see",
    "describe scene",
    "describe the scene",
    "what's around me",
    "what is around me",
    "describe surroundings",
    "describe the surroundings",
    "describe my surroundings"
  ],
  [IntentType.AHEAD_ONLY]: [
    "what's ahead",
    "what is ahead",
    "check ahead",
    "ahead only",
    "path clear",
    "is the path clear",
    "clear path"
  ],
  [IntentType.READ_TEXT]: [
    "read this",
    "read the sign",
    "read this sign",
    "what does this say",
    "what does the sign say",
    "read the text",
    "read text"
  ],
  [IntentType.HELP]: ["help", "what can i say", "help me"],
  [IntentType.RESET]: ["reset", "start over", "restart session"],
  [IntentType.START_AWARENESS]: [
    "start awareness",
    "continuous mode",
    "keep watching"
  ],
  [IntentType.STOP_AWARENESS]: ["stop awareness", "stop continuous"],
  [IntentType.STATUS]: ["status", "what mode are we in"]
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const levenshteinDistance = (a: string, b: string) => {
  const matrix = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
};

const isCloseWakeMatch = (text: string) => {
  if (!text) {
    return false;
  }
  if (text === WAKE_PHRASE) {
    return true;
  }
  const distance = levenshteinDistance(text, WAKE_PHRASE);
  return distance <= 2;
};

const extractWake = (text: string) => {
  if (!text) {
    return { wakeDetected: false, remainder: "" };
  }
  if (text === WAKE_PHRASE) {
    return { wakeDetected: true, remainder: "" };
  }
  if (text.startsWith(`${WAKE_PHRASE} `)) {
    return { wakeDetected: true, remainder: text.slice(WAKE_PHRASE.length).trim() };
  }
  const tokens = text.split(" ");
  const possibleWake = tokens.slice(0, 2).join(" ");
  if (isCloseWakeMatch(possibleWake)) {
    return {
      wakeDetected: true,
      remainder: tokens.slice(2).join(" ").trim()
    };
  }
  return { wakeDetected: false, remainder: text };
};

const matchIntent = (text: string): IntentType => {
  if (!text) {
    return IntentType.NONE;
  }
  const matchEntries = Object.entries(INTENT_PHRASES).filter(
    ([intent]) => intent !== IntentType.WAKE && intent !== IntentType.NONE
  ) as Array<[IntentType, string[]]>;
  for (const [intent, phrases] of matchEntries) {
    if (phrases.some((phrase) => text.includes(phrase))) {
      return intent;
    }
  }
  return IntentType.NONE;
};

const intentToMode = (intent: IntentType): VisionMode | undefined => {
  switch (intent) {
    case IntentType.AHEAD_ONLY:
      return "ahead";
    case IntentType.READ_TEXT:
      return "read_text";
    case IntentType.DESCRIBE_SCENE:
      return "scene";
    default:
      return undefined;
  }
};

export const routeIntent = (input: string, wakeActive: boolean): IntentResult => {
  const normalized = normalize(input);
  const { wakeDetected, remainder } = extractWake(normalized);
  const effectiveWake = wakeActive || wakeDetected;
  const commandText = wakeDetected ? remainder : normalized;

  if (!effectiveWake) {
    if (wakeDetected || isCloseWakeMatch(normalized)) {
      return {
        intent: IntentType.WAKE,
        confidence: 0.9,
        slots: {},
        wakeDetected: true,
        normalized
      };
    }
    return {
      intent: IntentType.NONE,
      confidence: 0,
      slots: {},
      wakeDetected: false,
      normalized
    };
  }

  if (!commandText) {
    return {
      intent: IntentType.WAKE,
      confidence: 0.9,
      slots: {},
      wakeDetected,
      normalized
    };
  }

  const intent = matchIntent(commandText);
  const mode = intentToMode(intent);
  return {
    intent,
    confidence: intent === IntentType.NONE ? 0 : 0.75,
    slots: mode ? { mode } : {},
    wakeDetected,
    normalized: commandText
  };
};
