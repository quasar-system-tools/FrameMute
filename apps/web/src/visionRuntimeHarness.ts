import { detectFacesWithDiagnostics } from "@framemute/vision-web";
import type { DetectedFace } from "@framemute/domain";
import fixtureUrl from "../../../docs/images/multi-face-input-ai-generated.png";

export type VisionRuntimeResult = {
  candidateCount: number;
  duplicatePairCount: number;
  durationMs: number;
  facesInBounds: boolean;
  imageHeight: number;
  imageWidth: number;
  rejectedCandidateCount: number;
};

declare global {
  interface Window {
    runVisionRuntime: (source?: string) => Promise<VisionRuntimeResult>;
  }
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The runtime fixture could not be decoded."));
    image.src = source;
  });
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

function renderOverlay(image: HTMLImageElement, faces: DetectedFace[], rejectedCandidates: DetectedFace[]) {
  const canvas = document.querySelector<HTMLCanvasElement>("#vision-result");
  const context = canvas?.getContext("2d");
  if (!canvas || !context) return;

  canvas.hidden = false;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  context.drawImage(image, 0, 0);
  context.strokeStyle = "#e65d43";
  context.lineWidth = Math.max(2, image.naturalWidth / 800);

  for (const face of faces) {
    context.strokeRect(
      face.x * image.naturalWidth,
      face.y * image.naturalHeight,
      face.width * image.naturalWidth,
      face.height * image.naturalHeight,
    );
  }

  context.strokeStyle = "#d8a32a";
  context.setLineDash([context.lineWidth * 2, context.lineWidth * 2]);
  for (const face of rejectedCandidates) {
    context.strokeRect(
      face.x * image.naturalWidth,
      face.y * image.naturalHeight,
      face.width * image.naturalWidth,
      face.height * image.naturalHeight,
    );
  }
  context.setLineDash([]);
}

export async function runVisionRuntime(source = fixtureUrl): Promise<VisionRuntimeResult> {
  const image = await loadImage(source);
  const startedAt = performance.now();
  const { candidates, faces } = await detectFacesWithDiagnostics(image);
  const rejectedCandidates = candidates.filter((candidate) => (
    !faces.some((face) => intersectionOverSmallerArea(candidate, face) >= 0.8)
  ));
  const duplicatePairCount = faces.reduce((count, face, index) => (
    count + faces.slice(index + 1).filter((otherFace) => (
      intersectionOverSmallerArea(face, otherFace) >= 0.8
    )).length
  ), 0);

  renderOverlay(image, faces, rejectedCandidates);

  return {
    candidateCount: faces.length,
    duplicatePairCount,
    durationMs: performance.now() - startedAt,
    facesInBounds: faces.every((face) => (
      face.x >= 0
      && face.y >= 0
      && face.width > 0
      && face.height > 0
      && face.x + face.width <= 1
      && face.y + face.height <= 1
    )),
    imageHeight: image.naturalHeight,
    imageWidth: image.naturalWidth,
    rejectedCandidateCount: rejectedCandidates.length,
  };
}

window.runVisionRuntime = runVisionRuntime;
