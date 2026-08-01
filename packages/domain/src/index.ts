export type Point = { x: number; y: number };

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MaskSource = "detected" | "manual";

export type MaskRegion = {
  id: string;
  source: MaskSource;
  x: number;
  y: number;
  width: number;
  height: number;
  mosaicSize: number;
  confidence?: number;
};

export type DetectedFace = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
};

export const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
export const MIN_REGION = 0.02;
export const SAFE_PADDING_X = 0.2;
export const SAFE_PADDING_Y = 0.3;
export const DEFAULT_MOSAIC_SIZE = 18;

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function createMaskId() {
  return `mask-${crypto.randomUUID()}`;
}

export function createDetectedRegions(faces: DetectedFace[]): MaskRegion[] {
  return faces.map((face) => {
    const paddingX = face.width * SAFE_PADDING_X;
    const paddingY = face.height * SAFE_PADDING_Y;
    const x = clamp(face.x - paddingX);
    const y = clamp(face.y - paddingY);

    return {
      id: createMaskId(),
      source: "detected",
      x,
      y,
      width: clamp(face.width + paddingX * 2, MIN_REGION, 1 - x),
      height: clamp(face.height + paddingY * 2, MIN_REGION, 1 - y),
      confidence: face.confidence,
      mosaicSize: DEFAULT_MOSAIC_SIZE,
    };
  });
}

export function createManualRegion(start: Point, end: Point): MaskRegion | null {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  if (width < MIN_REGION || height < MIN_REGION) return null;

  return {
    id: createMaskId(),
    source: "manual",
    x,
    y,
    width,
    height,
    mosaicSize: DEFAULT_MOSAIC_SIZE,
  };
}

export function duplicateRegion(region: MaskRegion, offset = 0.025): MaskRegion {
  const maxX = 1 - region.width;
  const maxY = 1 - region.height;
  const x = region.x + offset <= maxX
    ? region.x + offset
    : clamp(region.x - offset, 0, maxX);
  const y = region.y + offset <= maxY
    ? region.y + offset
    : clamp(region.y - offset, 0, maxY);

  return {
    ...region,
    id: createMaskId(),
    source: "manual",
    x,
    y,
    confidence: undefined,
  };
}

export function intersectsRect(region: Rect, selection: Rect) {
  return region.x < selection.x + selection.width
    && region.x + region.width > selection.x
    && region.y < selection.y + selection.height
    && region.y + region.height > selection.y;
}

export function applyMosaicSize(regions: MaskRegion[], selectedIds: string[], mosaicSize: number) {
  const selected = new Set(selectedIds);
  return regions.map((region) => selected.has(region.id) ? { ...region, mosaicSize } : region);
}
