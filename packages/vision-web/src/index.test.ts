import { describe, expect, it } from "vitest";
import { createVisionAssetPaths, deduplicateFaces, MAX_DETECTED_FACES } from "./index";

describe("web face detection", () => {
  it("configures automatic analysis for group photos with up to ten faces", () => {
    expect(MAX_DETECTED_FACES).toBe(10);
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

  it("resolves detector assets below an application base path", () => {
    expect(createVisionAssetPaths("/FrameMute/")).toEqual({
      modelPath: "/FrameMute/models/blaze_face_short_range.tflite",
      wasmPath: "/FrameMute/wasm",
    });
  });
});
