# Architecture

## Product boundary

FrameMute is intentionally local-first. The web application is static and the desktop application is a Tauri shell. Neither application contains an API client for sending selected media to a FrameMute backend because no FrameMute backend exists.

## Shared packages

| Package | Responsibility |
| --- | --- |
| `@framemute/domain` | Normalized coordinates, safe face padding, region IDs, and geometry constraints. |
| `@framemute/editor` | React editor controls, canvas rendering, local file loading, edit history, and export. |
| `@framemute/vision-web` | Resolution-derived MediaPipe scanning, landmark validation, and conversion into normalized rectangles. |
| `@framemute/platform` | Platform-facing contracts reserved for future adapters. |

## Processing flow

```text
Local file picker
      │
      ▼
Browser or Tauri process ──► HTML image element ──► adaptive overlapping scan pyramid
      │                                                    │
      │                                                    ▼
      │                                      MediaPipe face detector
      │                                                    │
      │                                                    ▼
      │                                      Face Landmarker validation
      │                                                    │
      │                                                    ▼
      └──────────────────────────────► reviewed mask regions ──► Canvas mosaic ──► local PNG/JPG export
```

Face rectangles are normalized to the image dimensions. The domain package applies padding, clamps every region to the image bounds, and rejects manual regions that are too small to edit.

## Web delivery

The web application ships as static Vite assets. It does not register an application service worker or maintain an app-managed offline cache; hashed bundles and ordinary HTTP revalidation handle updates. A temporary retirement worker and client cleanup remove caches left by earlier previews. The hosting headers restrict executable, image, connection, worker, and font sources to the same origin, plus local `blob:` and `data:` image URLs needed during editing.

## Desktop delivery

The desktop application uses Tauri 2 and reuses the shared React editor. The desktop CSP follows the same local-only resource model as the web application. Packaging and code signing are separate release tasks; a production installer must be signed and notarized by its distributor.
