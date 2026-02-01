import { SceneDescription } from "./formatForSpeech";
import { SpeechPriority } from "./priorityQueue";

const DISTANCE_RANK: Record<SceneDescription["hazards"][number]["distance"], number> = {
  far: 1,
  medium: 2,
  close: 3
};

const normalizeLabel = (value: string) => value.trim().toLowerCase();

const hazardMatchKey = (hazard: SceneDescription["hazards"][number]) =>
  `${normalizeLabel(hazard.label)}|${hazard.clock}`;

const hazardSpeakKey = (hazard: SceneDescription["hazards"][number]) =>
  `${normalizeLabel(hazard.label)}|${hazard.clock}|${hazard.distance}`;

const objectSignature = (obj: SceneDescription["objects"][number]) =>
  `${normalizeLabel(obj.label)}|${obj.clock}|${obj.distance}`;

const priorityFromUrgency = (
  urgency: SceneDescription["hazards"][number]["urgency"]
): SpeechPriority => {
  if (urgency === "critical") {
    return "CRITICAL";
  }
  if (urgency === "high") {
    return "HIGH";
  }
  return "NORMAL";
};

const selectHighestPriorityHazard = (
  hazards: SceneDescription["hazards"]
): SceneDescription["hazards"][number] | undefined => {
  return hazards.reduce<SceneDescription["hazards"][number] | undefined>(
    (selected, hazard) => {
      if (!selected) {
        return hazard;
      }
      const selectedPriority = priorityFromUrgency(selected.urgency);
      const candidatePriority = priorityFromUrgency(hazard.urgency);
      if (candidatePriority === "CRITICAL") {
        return hazard;
      }
      if (candidatePriority === "HIGH" && selectedPriority === "NORMAL") {
        return hazard;
      }
      return selected;
    },
    undefined
  );
};

export type ChangeDetectionResult = {
  hazardChanged: boolean;
  hazardPriority: SpeechPriority | null;
  hazardKey?: string;
  objectsChanged: boolean;
  reason: "hazard" | "change" | "none" | "baseline";
};

export class ChangeDetector {
  private history: SceneDescription[] = [];
  private maxHistory: number;

  constructor(maxHistory = 3) {
    this.maxHistory = maxHistory;
  }

  evaluate(current: SceneDescription): ChangeDetectionResult {
    const previous = this.history[0];
    if (!previous) {
      const topHazard = selectHighestPriorityHazard(current.hazards);
      const hazardPriority = topHazard
        ? priorityFromUrgency(topHazard.urgency)
        : null;
      return {
        hazardChanged: current.hazards.length > 0,
        hazardPriority,
        hazardKey: topHazard ? hazardSpeakKey(topHazard) : undefined,
        objectsChanged: false,
        reason: current.hazards.length ? "hazard" : "baseline"
      };
    }

    const previousHazards = new Map(
      previous.hazards.map((hazard) => [hazardMatchKey(hazard), hazard])
    );
    let hazardChanged = false;
    let hazardPriority: SpeechPriority | null = null;
    let hazardKey: string | undefined;

    for (const hazard of current.hazards) {
      const match = previousHazards.get(hazardMatchKey(hazard));
      const isChanged =
        !match || DISTANCE_RANK[hazard.distance] > DISTANCE_RANK[match.distance];
      if (isChanged) {
        hazardChanged = true;
        hazardKey = hazardSpeakKey(hazard);
        const urgencyPriority = priorityFromUrgency(hazard.urgency);
        if (!hazardPriority || urgencyPriority === "CRITICAL") {
          hazardPriority = urgencyPriority;
        } else if (
          urgencyPriority === "HIGH" &&
          hazardPriority !== "CRITICAL"
        ) {
          hazardPriority = urgencyPriority;
        }
      }
    }

    const currentObjects = current.objects.slice(0, 2).map(objectSignature);
    const previousObjects = previous.objects.slice(0, 2).map(objectSignature);
    const objectsChanged =
      currentObjects.length !== previousObjects.length ||
      currentObjects.some((obj) => !previousObjects.includes(obj));

    return {
      hazardChanged,
      hazardPriority,
      hazardKey,
      objectsChanged,
      reason: hazardChanged ? "hazard" : objectsChanged ? "change" : "none"
    };
  }

  record(current: SceneDescription) {
    this.history.unshift(current);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
  }
}
