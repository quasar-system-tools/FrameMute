# Maskly

Maskly is a local-first photo privacy tool. It detects face candidates in a photo, lets you review or draw masking regions, and exports a mosaic-masked image without uploading the original photo to a Maskly server.

> **Status:** early preview. Review every mask before sharing an exported image.

![Maskly editor empty state](docs/images/maskly-editor-empty-state.jpg)

## What it does

- Runs as a desktop application and an installable Web/PWA experience.
- Accepts JPG, PNG, and WebP photos up to 50 MB.
- Detects face candidates locally with MediaPipe Tasks Vision.
- Lets you add, select, move, resize, and delete mask regions.
- Provides undo and redo with `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z`.
- Previews and exports mosaic masking as PNG or JPG.
- Caches the PWA shell and its local model/WASM assets for offline use after the first successful load.

## Privacy model

Maskly has no application backend and does not send selected photos or face-detection results to a Maskly service. The original image is read in the current browser or desktop-app process, and the exported file is created locally.

The PWA may request its own static application assets, model, and WASM files from the host that serves Maskly. These requests do not contain the selected photo. See [the privacy notes](docs/privacy.md) for the precise boundary and limitations.

## Quick start

### Web/PWA

```sh
npm install
npm run dev:web
```

Open the local URL printed by Vite, choose a photo, review the suggested regions, and export the result.

### Desktop application

```sh
npm install
npm run tauri:desktop -- dev
```

The desktop app currently targets macOS Apple Silicon for local packaging. The bundle is written to `apps/desktop/src-tauri/target/release/bundle/macos/Maskly.app` after:

```sh
npm run tauri:desktop -- build --bundles app
```

## How masking works

1. The selected file is loaded from the local device into the active app process.
2. MediaPipe runs locally and returns candidate face rectangles in image-relative coordinates.
3. Maskly adds conservative padding around each candidate. You review, adjust, remove, or add regions manually.
4. Canvas renders a pixel mosaic only inside the selected regions.
5. Export encodes the edited canvas into a new PNG or JPG file on the local device.

Automatic detection is an aid, not a guarantee. It may miss faces or identify unsuitable regions; manual review is required for any privacy-sensitive use.

## Architecture

```text
apps/web      ─┐
               ├─ @maskly/editor ─ @maskly/domain
apps/desktop  ─┘        │
                         └─ @maskly/vision-web (local MediaPipe model + WASM)
```

- `apps/web`: Vite Web/PWA entry point, service worker, CSP, and hosting headers.
- `apps/desktop`: Tauri shell that uses the same editor.
- `packages/domain`: normalized region geometry and masking rules.
- `packages/editor`: shared React editor and Canvas renderer.
- `packages/vision-web`: local MediaPipe face-detection adapter.

Read the fuller [architecture overview](docs/architecture.md).

## Development and verification

```sh
npm run test
npm run build:web
npm run build:desktop
npm run verify
```

`verify` also checks Rust formatting and tests for the desktop shell. GitHub Actions runs the TypeScript tests and both web and desktop front-end builds for every pull request and push to `main`.

## Roadmap and non-goals

The current preview is photo-only. Video processing, batch workflows, FFmpeg export, cloud synchronization, accounts, and server-side image analysis are not implemented.

## Contributing, security, and license

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change.
- Report security issues using [SECURITY.md](SECURITY.md); do not include private photos or credentials in an issue.
- Maskly source code is available under the [MIT License](LICENSE).
- Third-party notices, including MediaPipe Tasks Vision, are in [NOTICE](NOTICE).
