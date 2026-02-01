import { describe, expect, it } from "vitest";
import { routeIntent } from "./intentRouter";
import { IntentType } from "./intents";

describe("routeIntent", () => {
  it("routes ahead intent after wake", () => {
    const result = routeIntent("Hey Nexus what's ahead", false);
    expect(result.intent).toBe(IntentType.AHEAD_ONLY);
  });

  it("ignores intents without wake", () => {
    const result = routeIntent("what's ahead", false);
    expect(result.intent).toBe(IntentType.NONE);
  });

  it("routes read text intent", () => {
    const result = routeIntent("Hey Nexus read this sign", false);
    expect(result.intent).toBe(IntentType.READ_TEXT);
  });

  it("routes help intent", () => {
    const result = routeIntent("Hey Nexus help", false);
    expect(result.intent).toBe(IntentType.HELP);
  });

  it("routes start awareness intent", () => {
    const result = routeIntent("Hey Nexus start awareness", false);
    expect(result.intent).toBe(IntentType.START_AWARENESS);
  });

  it("routes stop awareness intent", () => {
    const result = routeIntent("Hey Nexus stop awareness", false);
    expect(result.intent).toBe(IntentType.STOP_AWARENESS);
  });

  it("routes status intent", () => {
    const result = routeIntent("Hey Nexus what mode are we in", false);
    expect(result.intent).toBe(IntentType.STATUS);
  });
});
