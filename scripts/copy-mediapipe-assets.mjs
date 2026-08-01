import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const visionRequire = createRequire(new URL("../packages/vision-web/package.json", import.meta.url));
const wasmSource = dirname(visionRequire.resolve("@mediapipe/tasks-vision/vision_wasm_internal.js"));
const modelSource = fileURLToPath(new URL("../packages/vision-web/assets/models/blaze_face_short_range.tflite", import.meta.url));
const applications = ["apps/desktop", "apps/web"];

await Promise.all(applications.flatMap(async (application) => {
  const wasmDestination = fileURLToPath(new URL(`../${application}/public/wasm`, import.meta.url));
  const modelDestination = fileURLToPath(new URL(`../${application}/public/models/blaze_face_short_range.tflite`, import.meta.url));
  await mkdir(wasmDestination, { recursive: true });
  await mkdir(dirname(modelDestination), { recursive: true });
  await cp(wasmSource, wasmDestination, { recursive: true, force: true });
  await cp(modelSource, modelDestination, { force: true });
}));
