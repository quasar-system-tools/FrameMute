import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

type VisionRuntimeResult = {
  candidateCount: number;
  duplicatePairCount: number;
  durationMs: number;
  facesInBounds: boolean;
  imageHeight: number;
  imageWidth: number;
  rejectedCandidateCount: number;
};

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
  test.skip(!imagePath, "Set VISION_IMAGE to run a local-only image report.");
  if (!imagePath || !existsSync(imagePath)) throw new Error(`Vision image was not found: ${imagePath}`);

  const extension = imagePath.split(".").at(-1)?.toLowerCase() ?? "jpeg";
  const mimeType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  const source = `data:${mimeType};base64,${readFileSync(imagePath).toString("base64")}`;
  const result = await runVisionRuntime(page, source);
  const overlay = page.locator("#vision-result");
  await expect(overlay).toHaveCount(1);
  await overlay.screenshot({ path: testInfo.outputPath("vision-overlay.png") });

  console.info(JSON.stringify({ imagePath, ...result }));
  expect(result.facesInBounds).toBe(true);
  expect(result.duplicatePairCount).toBe(0);
});
