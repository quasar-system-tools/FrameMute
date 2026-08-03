import { FaceDetector, FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { DetectedFace, Rect } from "@framemute/domain";

const DETECTOR_MIN_CONFIDENCE = 0.35;
const LANDMARKER_MIN_CONFIDENCE = 0.5;
const INITIAL_TILES_ON_LONG_AXIS = 4;
const MIN_SOURCE_TILE_SIZE = 64;
const TILE_OVERLAP = 0.12;
const YIELD_INTERVAL = 4;
const VALIDATION_CANVAS_SIZE = 192;
const VALIDATION_CROP_SCALE = 1.15;
const DUPLICATE_OVERLAP_THRESHOLD = 0.8;

type Tile = { x: number; y: number; width: number; height: number };
type LandmarkPoint = { x: number; y: number };
type DetectionCandidate = DetectedFace & { keypoints: LandmarkPoint[] };

let detectorPromise: Promise<FaceDetector> | undefined;
let landmarkerPromise: Promise<FaceLandmarker> | undefined;

async function getDetector(modelPath: string, wasmPath: string) {
  detectorPromise ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    return FaceDetector.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath },
      runningMode: "IMAGE",
      minDetectionConfidence: DETECTOR_MIN_CONFIDENCE,
    });
  })();

  try {
    return await detectorPromise;
  } catch (error) {
    detectorPromise = undefined;
    throw error;
  }
}

async function getLandmarker(modelPath: string, wasmPath: string) {
  landmarkerPromise ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    return FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath },
      runningMode: "IMAGE",
      numFaces: 1,
      minFaceDetectionConfidence: LANDMARKER_MIN_CONFIDENCE,
      minFacePresenceConfidence: LANDMARKER_MIN_CONFIDENCE,
    });
  })();

  try {
    return await landmarkerPromise;
  } catch (error) {
    landmarkerPromise = undefined;
    throw error;
  }
}

export function createDetectionTiles(imageWidth: number, imageHeight: number, tilesOnLongAxis: number): Tile[] {
  const isLandscape = imageWidth >= imageHeight;
  const columns = isLandscape
    ? tilesOnLongAxis
    : Math.max(1, Math.round(tilesOnLongAxis * imageWidth / imageHeight));
  const rows = isLandscape
    ? Math.max(1, Math.round(tilesOnLongAxis * imageHeight / imageWidth))
    : tilesOnLongAxis;
  const tileWidth = 1 / columns;
  const tileHeight = 1 / rows;

  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const left = Math.max(0, column * tileWidth - tileWidth * TILE_OVERLAP);
    const top = Math.max(0, row * tileHeight - tileHeight * TILE_OVERLAP);
    const right = Math.min(1, (column + 1) * tileWidth + tileWidth * TILE_OVERLAP);
    const bottom = Math.min(1, (row + 1) * tileHeight + tileHeight * TILE_OVERLAP);

    return { x: left, y: top, width: right - left, height: bottom - top };
  });
}

export function createScanLevels(imageWidth: number, imageHeight: number) {
  const maximumTiles = Math.max(1, Math.ceil(Math.max(imageWidth, imageHeight) / MIN_SOURCE_TILE_SIZE));
  const initialTiles = Math.min(INITIAL_TILES_ON_LONG_AXIS, maximumTiles);
  const levels: number[] = [];

  for (let tiles = initialTiles; tiles < maximumTiles; tiles *= 2) {
    levels.push(tiles);
  }

  if (levels[levels.length - 1] !== maximumTiles) levels.push(maximumTiles);
  return levels;
}

function intersectionOverSmallerArea(first: DetectedFace, second: DetectedFace) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const smallerArea = Math.min(first.width * first.height, second.width * second.height);

  return smallerArea ? intersection / smallerArea : 0;
}

export function deduplicateFaces<Face extends DetectedFace>(faces: Face[]) {
  return [...faces]
    .sort((first, second) => second.confidence - first.confidence)
    .reduce<Face[]>((uniqueFaces, face) => {
      const isDuplicate = uniqueFaces.some(
        (existingFace) => intersectionOverSmallerArea(existingFace, face) >= DUPLICATE_OVERLAP_THRESHOLD,
      );
      return isDuplicate ? uniqueFaces : [...uniqueFaces, face];
    }, []);
}

function detectTile(detector: FaceDetector, image: HTMLImageElement, tile: Tile): DetectionCandidate[] {
  const sourceX = Math.round(tile.x * image.naturalWidth);
  const sourceY = Math.round(tile.y * image.naturalHeight);
  const sourceWidth = Math.round(tile.width * image.naturalWidth);
  const sourceHeight = Math.round(tile.height * image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext("2d");
  if (!context) return [];

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );

  return detector.detect(canvas).detections.flatMap((detection) => {
    const box = detection.boundingBox;
    if (!box) return [];

    return [{
      x: tile.x + (box.originX / sourceWidth) * tile.width,
      y: tile.y + (box.originY / sourceHeight) * tile.height,
      width: (box.width / sourceWidth) * tile.width,
      height: (box.height / sourceHeight) * tile.height,
      confidence: detection.categories[0]?.score ?? 0,
      keypoints: detection.keypoints.map((keypoint) => ({
        x: tile.x + keypoint.x * tile.width,
        y: tile.y + keypoint.y * tile.height,
      })),
    }];
  });
}

async function scanTiles(detector: FaceDetector, image: HTMLImageElement, tiles: Tile[]) {
  const faces: DetectionCandidate[] = [];

  for (let index = 0; index < tiles.length; index += 1) {
    faces.push(...detectTile(detector, image, tiles[index]));
    if ((index + 1) % YIELD_INTERVAL === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return faces;
}

export function validationCropForFace(face: DetectedFace, keypoints: LandmarkPoint[] = []): Rect {
  if (!keypoints.length) {
    const cropSize = Math.min(1, Math.max(face.width, face.height) * VALIDATION_CROP_SCALE);
    return {
      x: Math.max(0, face.x + face.width / 2 - cropSize / 2),
      y: Math.max(0, face.y + face.height / 2 - cropSize / 2),
      width: cropSize,
      height: cropSize,
    };
  }

  const minX = Math.min(...keypoints.map((keypoint) => keypoint.x));
  const minY = Math.min(...keypoints.map((keypoint) => keypoint.y));
  const maxX = Math.max(...keypoints.map((keypoint) => keypoint.x));
  const maxY = Math.max(...keypoints.map((keypoint) => keypoint.y));
  const cropSize = Math.min(1, Math.max((maxX - minX) * 1.4, (maxY - minY) * 2.4));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: Math.max(0, Math.min(1 - cropSize, centerX - cropSize / 2)),
    y: Math.max(0, Math.min(1 - cropSize, centerY - cropSize / 2)),
    width: cropSize,
    height: cropSize,
  };
}

function validateFace(
  landmarker: FaceLandmarker,
  image: HTMLImageElement,
  face: DetectionCandidate,
  canvas: HTMLCanvasElement,
): DetectedFace | null {
  const crop = validationCropForFace(face, face.keypoints);
  const left = crop.x;
  const top = crop.y;
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    left * image.naturalWidth,
    top * image.naturalHeight,
    (right - left) * image.naturalWidth,
    (bottom - top) * image.naturalHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const landmarks = landmarker.detect(canvas).faceLandmarks[0];
  if (!landmarks?.length) return null;

  return faceFromLandmarks(face, { x: left, y: top, width: right - left, height: bottom - top }, landmarks);
}

export function faceFromLandmarks(
  face: DetectedFace,
  crop: Rect,
  landmarks: LandmarkPoint[],
): DetectedFace | null {
  if (!landmarks.length) return null;

  const clampedX = landmarks.map((landmark) => Math.min(1, Math.max(0, landmark.x)));
  const clampedY = landmarks.map((landmark) => Math.min(1, Math.max(0, landmark.y)));
  const minX = Math.min(...clampedX);
  const minY = Math.min(...clampedY);
  const maxX = Math.max(...clampedX);
  const maxY = Math.max(...clampedY);

  return {
    x: crop.x + minX * crop.width,
    y: crop.y + minY * crop.height,
    width: (maxX - minX) * crop.width,
    height: (maxY - minY) * crop.height,
    confidence: face.confidence,
  };
}

async function validateFaces(landmarker: FaceLandmarker, image: HTMLImageElement, faces: DetectionCandidate[]) {
  const canvas = document.createElement("canvas");
  canvas.width = VALIDATION_CANVAS_SIZE;
  canvas.height = VALIDATION_CANVAS_SIZE;
  const validated: DetectedFace[] = [];

  for (let index = 0; index < faces.length; index += 1) {
    const validatedFace = validateFace(landmarker, image, faces[index], canvas);
    if (validatedFace) validated.push(validatedFace);
    if ((index + 1) % YIELD_INTERVAL === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return deduplicateFaces(validated);
}

export type FaceDetectionDiagnostics = {
  candidates: DetectedFace[];
  faces: DetectedFace[];
};

/**
 * Returns face rectangles in image-relative coordinates. A resolution-derived
 * overlapping scan pyramid avoids fixed person-count limits, then a local face
 * landmarker validates and tightens the detector candidates.
 * No image data or detection result leaves this process.
 */
export async function detectFacesWithDiagnostics(
  image: HTMLImageElement,
  assets = createVisionAssetPaths(
    typeof document === "undefined" ? "/" : new URL(".", document.baseURI).pathname,
  ),
): Promise<FaceDetectionDiagnostics> {
  const detector = await getDetector(assets.modelPath, assets.wasmPath);
  const faces: DetectionCandidate[] = [];

  for (const level of createScanLevels(image.naturalWidth, image.naturalHeight)) {
    faces.push(...await scanTiles(
      detector,
      image,
      createDetectionTiles(image.naturalWidth, image.naturalHeight, level),
    ));
  }

  const candidates = deduplicateFaces(faces);
  const landmarker = await getLandmarker(assets.landmarkerPath, assets.wasmPath);
  return { candidates, faces: await validateFaces(landmarker, image, candidates) };
}

export async function detectFaces(
  image: HTMLImageElement,
  assets = createVisionAssetPaths(
    typeof document === "undefined" ? "/" : new URL(".", document.baseURI).pathname,
  ),
): Promise<DetectedFace[]> {
  return (await detectFacesWithDiagnostics(image, assets)).faces;
}

export function createVisionAssetPaths(basePath: string) {
  const normalizedBase = `/${basePath}`.replace(/\/+/g, "/").replace(/\/?$/, "/");
  return {
    modelPath: `${normalizedBase}models/blaze_face_short_range.tflite`,
    landmarkerPath: `${normalizedBase}models/face_landmarker.task`,
    wasmPath: `${normalizedBase}wasm`,
  };
}
