# Maskly

Maskly is a local-first tool for masking sensitive information in photos and videos. This npm-workspaces monorepo includes a desktop application in `apps/desktop` and an install-free photo PWA in `apps/web`.

## Current scope

- Select or drag and drop JPG, PNG, and WebP images up to 50 MB
- Add, select, move, resize, and remove manual mask regions
- Undo and redo edits with `Cmd/Ctrl+Z`
- Preview pixel mosaics with Canvas
- Adjust mosaic intensity per region
- Export PNG and JPG images
- Cache the Web/PWA service worker and local MediaPipe model/WASM assets

Automatic face detection, video processing, and FFmpeg export are planned for a future iteration. Face detection will only suggest regions for the user to review.

## Run

```sh
npm install
npm run tauri:desktop -- dev
```

Start the Web/PWA development server:

```sh
npm run dev:web
```

## Verify

```sh
npm run verify
npm run tauri:desktop -- build --bundles app
```

The macOS Apple Silicon application bundle is produced at `apps/desktop/src-tauri/target/release/bundle/macos/Maskly.app`. Public distribution requires separate code signing and notarization.

The Web static build is produced at `apps/web/dist`. It can be deployed to Cloudflare Pages or GitHub Pages after a hosting account and domain are configured.
