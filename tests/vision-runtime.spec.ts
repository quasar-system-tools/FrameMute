import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import type { MaskRegion } from "@framemute/domain";

type VisionRuntimeResult = {
  candidateCount: number;
  duplicatePairCount: number;
  durationMs: number;
  facesInBounds: boolean;
  imageHeight: number;
  imageWidth: number;
  maskRegions: MaskRegion[];
  rejectedCandidateCount: number;
};

type CoverageTarget = {
  id: string;
  x: number;
  y: number;
};

type LocalCoverageExpectation = {
  minimumCoverage?: number;
  targets: CoverageTarget[];
};

function evaluateCoverage(targets: CoverageTarget[], masks: MaskRegion[]) {
  return targets.map((target) => ({
    id: target.id,
    covered: masks.some((mask) => (
      target.x >= mask.x
      && target.x <= mask.x + mask.width
      && target.y >= mask.y
      && target.y <= mask.y + mask.height
    )),
  }));
}

function loadCoverageExpectation(path: string) {
  if (!existsSync(path)) throw new Error(`Vision coverage file was not found: ${path}`);
  const expectation = JSON.parse(readFileSync(path, "utf8")) as LocalCoverageExpectation;
  if (!expectation.targets.length) throw new Error("Vision coverage file must include at least one target.");
  return expectation;
}

async function runVisionRuntime(page: import("@playwright/test").Page, source?: string) {
  await page.goto("/vision-runtime.html");
  return page.evaluate(async (imageSource) => (
    window.runVisionRuntime(imageSource)
  ), source) as Promise<VisionRuntimeResult>;
}

test("detects the committed synthetic ten-face fixture without the editor UI", async ({ page }) => {
  const result = await runVisionRuntime(page);

  expect(result).toMatchObject({
    candidateCount: 10,
    duplicatePairCount: 0,
    facesInBounds: true,
  });
  expect(result.imageWidth).toBeGreaterThan(0);
  expect(result.imageHeight).toBeGreaterThan(0);
  expect(result.durationMs).toBeLessThan(60_000);
});

test("local-image vision report", async ({ page }, testInfo) => {
  const imagePath = process.env.VISION_IMAGE;
  const coveragePath = process.env.VISION_COVERAGE;
  test.skip(!imagePath, "Set VISION_IMAGE to run a local-only image report.");
  if (!imagePath || !existsSync(imagePath)) throw new Error(`Vision image was not found: ${imagePath}`);

  const extension = imagePath.split(".").at(-1)?.toLowerCase() ?? "jpeg";
  const mimeType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  const source = `data:${mimeType};base64,${readFileSync(imagePath).toString("base64")}`;
  const result = await runVisionRuntime(page, source);
  const overlay = page.locator("#vision-result");
  await expect(overlay).toHaveCount(1);
  await overlay.screenshot({ path: testInfo.outputPath("vision-overlay.png") });

  const { maskRegions, ...report } = result;
  console.info(JSON.stringify({ imagePath, ...report, maskCount: maskRegions.length }));
  expect(result.facesInBounds).toBe(true);
  expect(result.duplicatePairCount).toBe(0);

  if (!coveragePath) return;
  const expectation = loadCoverageExpectation(coveragePath);

  const coverage = evaluateCoverage(expectation.targets, maskRegions);
  const rate = coverage.filter((target) => target.covered).length / coverage.length;
  const missed = coverage.filter((target) => !target.covered).map((target) => target.id);
  console.info(JSON.stringify({ coverageRate: rate, missedCoverageTargets: missed }));
  expect(rate).toBeGreaterThanOrEqual(expectation.minimumCoverage ?? 1);
});

test("local-editor mosaic coverage", async ({ page }, testInfo) => {
  const imagePath = process.env.VISION_IMAGE;
  const coveragePath = process.env.VISION_COVERAGE;
  test.skip(!imagePath || !coveragePath, "Set VISION_IMAGE and VISION_COVERAGE to run the local editor coverage check.");
  if (!imagePath || !coveragePath) return;
  if (!existsSync(imagePath)) throw new Error(`Vision image was not found: ${imagePath}`);
  const expectation = loadCoverageExpectation(coveragePath);

  await page.goto("/#editor");
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await expect(page.locator('canvas[aria-label="Mosaic preview"]')).toBeVisible();
  await expect(page.locator(".region").first()).toBeVisible();
  await expect(page.locator(".canvas-stage")).not.toHaveAttribute("aria-busy", "true");

  const coverage = await page.locator(".canvas-stage").evaluate((stage, targets) => {
    const canvas = stage.querySelector("canvas");
    if (!canvas) return [];
    const canvasBounds = canvas.getBoundingClientRect();
    return targets.map((target) => {
      const pointX = canvasBounds.left + target.x * canvasBounds.width;
      const pointY = canvasBounds.top + target.y * canvasBounds.height;
      const covered = [...stage.querySelectorAll<HTMLElement>(".region")].some((region) => {
        const bounds = region.getBoundingClientRect();
        return pointX >= bounds.left && pointX <= bounds.right && pointY >= bounds.top && pointY <= bounds.bottom;
      });
      return { id: target.id, covered };
    });
  }, expectation.targets);

  const rate = coverage.filter((target) => target.covered).length / coverage.length;
  await page.locator(".canvas-stage").screenshot({ path: testInfo.outputPath("editor-mosaic-preview.png") });
  console.info(JSON.stringify({ editorCoverageRate: rate, missedEditorCoverageTargets: coverage.filter((target) => !target.covered).map((target) => target.id) }));
  expect(rate).toBeGreaterThanOrEqual(expectation.minimumCoverage ?? 1);
});
