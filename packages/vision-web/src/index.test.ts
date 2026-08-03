import { describe, expect, it } from "vitest";
import {
  createDetectionTiles,
  createScanLevels,
  createVisionAssetPaths,
  deduplicateFaces,
  faceFromLandmarks,
  validationCropForFace,
} from "./index";

describe("web face detection", () => {
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

  it("derives scan depth from image resolution rather than a person limit", () => {
    expect(createScanLevels(512, 320)).toEqual([4, 8]);
    expect(createScanLevels(1536, 1024)).toEqual([4, 8, 16, 24]);
    expect(createScanLevels(10_000, 7_000)).toEqual([4, 8, 16, 32, 64, 128, 157]);
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

  it("keeps distinct candidates even when their mask areas overlap", () => {
    const faces = deduplicateFaces([
      { x: 0.1, y: 0.1, width: 0.15, height: 0.2, confidence: 0.9 },
      { x: 0.16, y: 0.1, width: 0.15, height: 0.2, confidence: 0.8 },
    ]);

    expect(faces).toHaveLength(2);
  });

  it("does not truncate dense results after removing duplicate candidates", () => {
    const faces = Array.from({ length: 250 }, (_, index) => ({
      x: (index % 20) * 0.045,
      y: Math.floor(index / 20) * 0.045,
      width: 0.01,
      height: 0.01,
      confidence: 0.9 - index / 10_000,
    }));

    expect(deduplicateFaces(faces)).toHaveLength(250);
  });

  it("normalizes a candidate to its validated landmark bounds", () => {
    const face = { x: 0.2, y: 0.2, width: 0.1, height: 0.1, confidence: 0.82 };

    const validated = faceFromLandmarks(
      face,
      { x: 0.15, y: 0.15, width: 0.2, height: 0.2 },
      [{ x: -0.1, y: 0.2 }, { x: 0.8, y: 1.1 }],
    );

    expect(validated).toMatchObject({ x: 0.15, confidence: 0.82 });
    expect(validated?.y).toBeCloseTo(0.19);
    expect(validated?.width).toBeCloseTo(0.16);
    expect(validated?.height).toBeCloseTo(0.16);
    expect(faceFromLandmarks(face, { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, [])).toBeNull();
  });

  it("centers landmark validation on detector keypoints when its box is oversized", () => {
    const crop = validationCropForFace(
      { x: 0.2, y: 0.2, width: 0.4, height: 0.5, confidence: 0.8 },
      [{ x: 0.31, y: 0.23 }, { x: 0.37, y: 0.23 }, { x: 0.34, y: 0.3 }],
    );

    expect(crop.width).toBeCloseTo(0.168);
    expect(crop.height).toBeCloseTo(0.168);
    expect(crop.x).toBeCloseTo(0.256);
    expect(crop.y).toBeCloseTo(0.181);
  });

  it("resolves detector assets below an application base path", () => {
    expect(createVisionAssetPaths("/FrameMute/")).toEqual({
      modelPath: "/FrameMute/models/blaze_face_short_range.tflite",
      landmarkerPath: "/FrameMute/models/face_landmarker.task",
      wasmPath: "/FrameMute/wasm",
    });
  });
});
