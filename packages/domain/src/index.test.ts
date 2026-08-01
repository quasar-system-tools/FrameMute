import { describe, expect, it } from "vitest";
import { applyMosaicSize, clamp, createDetectedRegions, createManualRegion, duplicateRegion, intersectsRect, MIN_REGION } from "./index";

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

  it("duplicates a mask as an offset manual region", () => {
    const [detected] = createDetectedRegions([
      { x: 0.9, y: 0.9, width: 0.08, height: 0.08, confidence: 0.91 },
    ]);
    const duplicate = duplicateRegion(detected);

    expect(duplicate).toMatchObject({
      source: "manual",
      mosaicSize: detected.mosaicSize,
      confidence: undefined,
    });
    expect(duplicate.id).not.toBe(detected.id);
    expect(duplicate.x).toBeLessThanOrEqual(1 - duplicate.width);
    expect(duplicate.y).toBeLessThanOrEqual(1 - duplicate.height);
  });

  it("finds masks that overlap a marquee selection", () => {
    const selection = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };

    expect(intersectsRect({ x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, selection)).toBe(true);
    expect(intersectsRect({ x: 0.5, y: 0.2, width: 0.1, height: 0.1 }, selection)).toBe(false);
    expect(intersectsRect({ x: 0.7, y: 0.7, width: 0.1, height: 0.1 }, selection)).toBe(false);
  });

  it("changes mosaic strength only for the selected masks", () => {
    const regions = createDetectedRegions([
      { x: 0.1, y: 0.1, width: 0.1, height: 0.1, confidence: 0.9 },
      { x: 0.5, y: 0.5, width: 0.1, height: 0.1, confidence: 0.9 },
    ]);
    const updated = applyMosaicSize(regions, [regions[1].id], 30);

    expect(updated[0].mosaicSize).toBe(regions[0].mosaicSize);
    expect(updated[1].mosaicSize).toBe(30);
  });
});
