import { describe, expect, it } from "vitest";
import {
  createDetectionTiles,
  createVisionAssetPaths,
  deduplicateFaces,
  MAX_DETECTED_FACES,
  shouldRunDetailedScan,
} from "./index";

describe("web face detection", () => {
  it("keeps enough candidates for dense crowd photos", () => {
    expect(MAX_DETECTED_FACES).toBe(200);
  });

  it("creates near-square detail tiles for a wide crowd photo", () => {
    const tiles = createDetectionTiles(1024, 619, 8);

    expect(tiles).toHaveLength(40);
    expect(tiles[0]).toMatchObject({ x: 0, y: 0 });
    expect(tiles[0].width).toBeCloseTo(0.14);
    expect(tiles[0].height).toBeCloseTo(0.224);
    expect(tiles.at(-1)?.x).toBeCloseTo(0.86);
    expect(tiles.at(-1)?.y).toBeCloseTo(0.776);
    expect(tiles.at(-1)?.width).toBeCloseTo(0.14);
    expect(tiles.at(-1)?.height).toBeCloseTo(0.224);
  });

  it("adds a detail scan when the coarse pass finds too few candidates", () => {
    expect(shouldRunDetailedScan([])).toBe(true);
    expect(shouldRunDetailedScan([
      { x: 0.1, y: 0.1, width: 0.04, height: 0.08, confidence: 0.8 },
      { x: 0.3, y: 0.1, width: 0.06, height: 0.1, confidence: 0.75 },
    ])).toBe(true);
    expect(shouldRunDetailedScan([
      { x: 0.1, y: 0.1, width: 0.1, height: 0.2, confidence: 0.9 },
      { x: 0.3, y: 0.1, width: 0.1, height: 0.2, confidence: 0.85 },
      { x: 0.5, y: 0.1, width: 0.1, height: 0.2, confidence: 0.8 },
      { x: 0.7, y: 0.1, width: 0.1, height: 0.2, confidence: 0.75 },
    ])).toBe(false);
  });

  it("keeps distinct faces while removing overlapping tile detections", () => {
    const faces = deduplicateFaces([
      { x: 0.1, y: 0.1, width: 0.15, height: 0.2, confidence: 0.9 },
      { x: 0.11, y: 0.1, width: 0.15, height: 0.2, confidence: 0.8 },
      { x: 0.6, y: 0.1, width: 0.15, height: 0.2, confidence: 0.7 },
    ]);

    expect(faces).toEqual([
      { x: 0.1, y: 0.1, width: 0.15, height: 0.2, confidence: 0.9 },
      { x: 0.6, y: 0.1, width: 0.15, height: 0.2, confidence: 0.7 },
    ]);
  });

  it("caps dense results without returning duplicate candidates", () => {
    const faces = Array.from({ length: MAX_DETECTED_FACES + 1 }, (_, index) => ({
      x: (index % 20) * 0.045,
      y: Math.floor(index / 20) * 0.045,
      width: 0.01,
      height: 0.01,
      confidence: 0.9 - index / 10_000,
    }));

    expect(deduplicateFaces(faces)).toHaveLength(MAX_DETECTED_FACES);
  });

  it("resolves detector assets below an application base path", () => {
    expect(createVisionAssetPaths("/FrameMute/")).toEqual({
      modelPath: "/FrameMute/models/blaze_face_short_range.tflite",
      wasmPath: "/FrameMute/wasm",
    });
  });
});
