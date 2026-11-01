// The kit where there is no window at all (a game's own unit tests, server rendering): importing it
// and calling anything must be safe.

import { describe, expect, it } from "vitest";
import * as kit from "slimtv-game-bridge";

describe("the kit with no window", () => {
  it("imports and every call is a no-op", () => {
    expect(typeof window).toBe("undefined");
    expect(kit.isSlimTV()).toBe(false);
    expect(kit.device()).toBeNull();
    expect(kit.bridgeRelease()).toBeNull();
    expect(() => {
      kit.ready();
      kit.exit();
      kit.log("info", "x");
      kit.onPause(() => {})();
      kit.onResume(() => {})();
    }).not.toThrow();
    const input = kit.createInput();
    expect(input.isDown("confirm")).toBe(false);
    input.poll();
    expect(input.pressed("confirm")).toBe(false);
    input.dispose();
  });
});
