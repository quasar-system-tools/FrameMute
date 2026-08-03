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
  if (!existsSync(coveragePath)) throw new Error(`Vision coverage file was not found: ${coveragePath}`);

  const expectation = JSON.parse(readFileSync(coveragePath, "utf8")) as LocalCoverageExpectation;
  if (!expectation.targets.length) throw new Error("Vision coverage file must include at least one target.");

  const coverage = evaluateCoverage(expectation.targets, maskRegions);
  const rate = coverage.filter((target) => target.covered).length / coverage.length;
  const missed = coverage.filter((target) => !target.covered).map((target) => target.id);
  console.info(JSON.stringify({ coverageRate: rate, missedCoverageTargets: missed }));
  expect(rate).toBeGreaterThanOrEqual(expectation.minimumCoverage ?? 1);
});
