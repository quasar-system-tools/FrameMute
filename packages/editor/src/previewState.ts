export type AnalysisStatus = "idle" | "analyzing" | "ready" | "error";

export function shouldProtectInitialPreview(status: AnalysisStatus, regionCount: number) {
  return status === "analyzing" && regionCount === 0;
}
