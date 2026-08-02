# Privacy notes

## What stays local

- Selected photo bytes are loaded from the device into the browser tab or desktop-app process.
- Face detection executes with the MediaPipe model and WASM files bundled with the app.
- Mask regions, edit history, canvas rendering, and PNG/JPG export are created in the active app process.
- FrameMute does not implement an account system, analytics endpoint, cloud storage, or media-upload API.

## Network requests

The web app requests FrameMute's static application files, MediaPipe model, and WASM files from the host serving the app. These requests are for application assets only; the selected photo is not part of them. FrameMute does not register an application service worker or maintain an app-managed offline cache. The browser and host may still apply normal HTTP caching.

The desktop application reads the same assets from its local bundle.

## Important limitations

- Face detection is probabilistic. It can miss faces, return imperfect bounds, or fail on difficult images. Always inspect every region before export.
- FrameMute only mosaics the image pixels rendered by the editor. It does not make claims about EXIF, source-file metadata, filenames, thumbnails, backups, or copies managed by an operating system or another application.
- Browser extensions, a compromised device, and a hosting provider are outside FrameMute's control. Use a trusted local environment for sensitive media.
- This document describes the current codebase, not a legal privacy policy or a guarantee of fitness for a particular regulatory requirement.
