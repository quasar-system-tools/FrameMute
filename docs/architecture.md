# Architecture

## Product boundary

Maskly is intentionally local-first. The web application is static and the desktop application is a Tauri shell. Neither application contains an API client for sending selected media to a Maskly backend because no Maskly backend exists.

## Shared packages

| Package | Responsibility |
| --- | --- |
| `@maskly/domain` | Normalized coordinates, safe face padding, region IDs, and geometry constraints. |
| `@maskly/editor` | React editor controls, canvas rendering, local file loading, edit history, and export. |
| `@maskly/vision-web` | MediaPipe Tasks Vision initialization and conversion of detections into normalized rectangles. |
| `@maskly/platform` | Platform-facing contracts reserved for future adapters. |

## Processing flow

```text
Local file picker
      │
      ▼
Browser or Tauri process ──► HTML image element ──► MediaPipe face detector
      │                                                    │
      │                                                    ▼
      └──────────────────────────────► reviewed mask regions ──► Canvas mosaic ──► local PNG/JPG export
```

Face rectangles are normalized to the image dimensions. The domain package applies padding, clamps every region to the image bounds, and rejects manual regions that are too small to edit.

## Web/PWA delivery

The web application ships as static Vite assets. A service worker caches the application shell, the bundled BlazeFace model, and MediaPipe WASM modules after a successful install. The hosting headers restrict executable, image, connection, worker, and font sources to the same origin, plus local `blob:` and `data:` image URLs needed during editing.

## Desktop delivery

The desktop application uses Tauri 2 and reuses the shared React editor. The desktop CSP follows the same local-only resource model as the web application. Packaging and code signing are separate release tasks; a production installer must be signed and notarized by its distributor.
