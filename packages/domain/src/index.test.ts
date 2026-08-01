import { describe, expect, it } from "vitest";
import { clamp, createDetectedRegions, createManualRegion, MIN_REGION } from "./index";

describe("mask regions", () => {
  it("clamps values to the normalized image bounds", () => {
    expect(clamp(-0.5)).toBe(0);
    expect(clamp(1.5)).toBe(1);
    expect(clamp(0.4)).toBe(0.4);
  });

  it("adds safe padding to detected faces without crossing image bounds", () => {
    const [region] = createDetectedRegions([{ x: 0.02, y: 0.03, width: 0.2, height: 0.25, confidence: 0.9 }]);

    expect(region.source).toBe("detected");
    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
    expect(region.x + region.width).toBeLessThanOrEqual(1);
    expect(region.y + region.height).toBeLessThanOrEqual(1);
  });

  it("rejects manual regions that are too small to edit", () => {
    expect(createManualRegion({ x: 0.1, y: 0.1 }, { x: 0.1 + MIN_REGION / 2, y: 0.2 })).toBeNull();
  });
});
