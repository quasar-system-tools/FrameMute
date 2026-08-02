import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const visionRequire = createRequire(new URL("../packages/vision-web/package.json", import.meta.url));
const wasmSource = dirname(visionRequire.resolve("@mediapipe/tasks-vision/vision_wasm_internal.js"));
const modelSources = [
  "blaze_face_short_range.tflite",
  "face_landmarker.task",
].map((fileName) => ({
  fileName,
  source: fileURLToPath(new URL(`../packages/vision-web/assets/models/${fileName}`, import.meta.url)),
}));
const applications = ["apps/desktop", "apps/web"];

await Promise.all(applications.flatMap(async (application) => {
  const wasmDestination = fileURLToPath(new URL(`../${application}/public/wasm`, import.meta.url));
  const modelDirectory = fileURLToPath(new URL(`../${application}/public/models`, import.meta.url));
  await mkdir(wasmDestination, { recursive: true });
  await mkdir(modelDirectory, { recursive: true });
  await cp(wasmSource, wasmDestination, { recursive: true, force: true });
  await Promise.all(modelSources.map(({ fileName, source }) => (
    cp(source, `${modelDirectory}/${fileName}`, { force: true })
  )));
}));
