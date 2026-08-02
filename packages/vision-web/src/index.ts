import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import type { DetectedFace } from "@framemute/domain";

export const MAX_DETECTED_FACES = 200;
const MIN_CONFIDENCE = 0.5;
const COARSE_TILES_ON_LONG_AXIS = 4;
const DETAIL_TILES_ON_LONG_AXIS = 8;
const TILE_OVERLAP = 0.12;
const YIELD_INTERVAL = 4;
const DETAIL_SCAN_TRIGGER_COUNT = 4;

type Tile = { x: number; y: number; width: number; height: number };

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

export function shouldRunDetailedScan(faces: DetectedFace[]) {
  return faces.length < DETAIL_SCAN_TRIGGER_COUNT;
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

export function deduplicateFaces(faces: DetectedFace[]) {
  return [...faces]
    .sort((first, second) => second.confidence - first.confidence)
    .reduce<DetectedFace[]>((uniqueFaces, face) => {
      const isDuplicate = uniqueFaces.some(
        (existingFace) => intersectionOverSmallerArea(existingFace, face) >= 0.6,
      );
      return isDuplicate ? uniqueFaces : [...uniqueFaces, face];
    }, [])
    .slice(0, MAX_DETECTED_FACES);
}

function detectTile(detector: FaceDetector, image: HTMLImageElement, tile: Tile): DetectedFace[] {
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
    }];
  });
}

async function scanTiles(detector: FaceDetector, image: HTMLImageElement, tiles: Tile[]) {
  const faces: DetectedFace[] = [];

  for (let index = 0; index < tiles.length; index += 1) {
    faces.push(...detectTile(detector, image, tiles[index]));
    if ((index + 1) % YIELD_INTERVAL === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return faces;
}

/**
 * Returns face rectangles in image-relative coordinates. The detector is run
 * over overlapping tiles so group photos are not limited to one candidate.
 * No image data or detection result leaves this process.
 */
export async function detectFaces(
  image: HTMLImageElement,
  assets = createVisionAssetPaths(
    typeof document === "undefined" ? "/" : new URL(".", document.baseURI).pathname,
  ),
): Promise<DetectedFace[]> {
  const detector = await getDetector(assets.modelPath, assets.wasmPath);
  const coarseFaces = await scanTiles(
    detector,
    image,
    createDetectionTiles(image.naturalWidth, image.naturalHeight, COARSE_TILES_ON_LONG_AXIS),
  );

  if (!shouldRunDetailedScan(coarseFaces)) return deduplicateFaces(coarseFaces);

  const detailedFaces = await scanTiles(
    detector,
    image,
    createDetectionTiles(image.naturalWidth, image.naturalHeight, DETAIL_TILES_ON_LONG_AXIS),
  );

  return deduplicateFaces([...coarseFaces, ...detailedFaces]);
}

export function createVisionAssetPaths(basePath: string) {
  const normalizedBase = `/${basePath}`.replace(/\/+/g, "/").replace(/\/?$/, "/");
  return {
    modelPath: `${normalizedBase}models/blaze_face_short_range.tflite`,
    wasmPath: `${normalizedBase}wasm`,
  };
}
