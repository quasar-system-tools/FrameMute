import { describe, expect, it } from "vitest";
import { shouldProtectInitialPreview } from "./previewState";

describe("protected preview state", () => {
  it("hides a new photo while its first mask candidates are being prepared", () => {
    expect(shouldProtectInitialPreview("analyzing", 0)).toBe(true);
  });

  it("keeps an already-masked preview visible during reanalysis", () => {
    expect(shouldProtectInitialPreview("analyzing", 3)).toBe(false);
  });

  it("reveals the editor after analysis completes or needs manual recovery", () => {
    expect(shouldProtectInitialPreview("ready", 0)).toBe(false);
    expect(shouldProtectInitialPreview("error", 0)).toBe(false);
  });
});
