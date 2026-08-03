# Vision runtime testing

FrameMute verifies deterministic geometry with Vitest and verifies the actual browser-targeted MediaPipe models with a separate runtime test. The runtime test does not load the React application or exercise editor controls.

## Commands

```sh
npm run test
npm run test:vision
VISION_IMAGE=/absolute/path/to/photo.jpg npm run test:vision:local
VISION_IMAGE=/absolute/path/to/photo.jpg VISION_COVERAGE=/absolute/path/to/coverage.json npm run test:vision:local
```

`test:vision` starts a local Vite server, opens only `vision-runtime.html` in headless Chromium, draws the fixture into a canvas, and calls `detectFaces()` directly. It asserts the expected result for the committed AI-generated ten-face fixture:

- ten candidates;
- no duplicate candidate pairs;
- every rectangle remains inside image bounds.

The test saves a screenshot and trace only on failure. `npm run verify` and GitHub Actions run the synthetic runtime test automatically; failed runtime artifacts are retained by GitHub Actions.

## Local-only reports

`test:vision:local` reads the image named by `VISION_IMAGE` on the current machine, passes it only to the local headless browser process, and prints a JSON result. It writes a local overlay image to `test-results/` for review: solid coral boxes are final face candidates and dashed amber boxes are detector candidates rejected by landmark validation.

Do not commit, upload, or attach real-person images, coverage files, or their generated overlays. Local reports measure candidate count, bounds, duplicate suppression, and—when `VISION_COVERAGE` is set—whether the final padded editor masks cover manually reviewed face-center targets. They do not claim that every person in an arbitrary photo has been detected.

## Local coverage checks

Use a local JSON file for the few face centers you need to regress. Coordinates are normalized to the source image (`0` to `1`), and each target is considered covered only when its center falls inside a final padded editor mask:

```json
{
  "minimumCoverage": 1,
  "targets": [
    { "id": "front-row-red-tie", "x": 0.42, "y": 0.67 }
  ]
}
```

The file stays outside the repository next to the private test photo. This turns a visually found miss into a repeatable local regression without publishing the photo, its people, or face coordinates.
