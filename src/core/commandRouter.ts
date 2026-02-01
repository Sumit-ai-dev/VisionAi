const WAKE_PHRASES = ["hey nexus"];
const CAPTURE_PHRASES = [
  "capture and describe",
  "capture describe",
  "describe scene",
  "describe the scene",
  "capture scene",
  "capture"
];

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesAny = (text: string, phrases: string[]) => {
  const normalized = normalize(text);
  return phrases.some((phrase) => normalized.includes(phrase));
};

export const isWakePhrase = (text: string) => matchesAny(text, WAKE_PHRASES);
export const isCaptureCommand = (text: string) => matchesAny(text, CAPTURE_PHRASES);
