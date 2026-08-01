import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import type { DetectedFace } from "@maskly/domain";

const MIN_CONFIDENCE = 0.5;

let detectorPromise: Promise<FaceDetector> | undefined;

async function getDetector(modelPath: string, wasmPath: string) {
  detectorPromise ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath },
      runningMode: "IMAGE",
      minDetectionConfidence: MIN_CONFIDENCE,
    });
  })();

  try {
    return await detectorPromise;
  } catch (error) {
    detectorPromise = undefined;
    throw error;
  }
}

/**
 * Returns face rectangles in image-relative coordinates. No image data or
 * detection result leaves this process.
 */
export async function detectFaces(
  image: HTMLImageElement,
  assets = { modelPath: "/models/blaze_face_short_range.tflite", wasmPath: "/wasm" },
): Promise<DetectedFace[]> {
  const detector = await getDetector(assets.modelPath, assets.wasmPath);
  const result = detector.detect(image);

  return result.detections.flatMap((detection) => {
    const box = detection.boundingBox;
    if (!box) return [];

    return [{
      x: box.originX / image.naturalWidth,
      y: box.originY / image.naturalHeight,
      width: box.width / image.naturalWidth,
      height: box.height / image.naturalHeight,
      confidence: detection.categories[0]?.score ?? 0,
    }];
  });
}
