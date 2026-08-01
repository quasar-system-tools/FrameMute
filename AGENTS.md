# FrameMute agent guide

## Product boundary

- FrameMute is a local-first photo privacy tool. Preserve local-only image and
  face-detection processing.
- Do not add media uploads, telemetry, accounts, cloud synchronization, or
  remote face-analysis calls without a separately reviewed product and privacy
  decision.
- Never commit photos, personal data, credentials, tokens, signing material,
  local environment files, or generated build output.

## Repository layout

- `apps/web`: Vite web/PWA application.
- `apps/desktop`: Tauri desktop application.
- `packages/editor`: shared React editor and canvas masking UI.
- `packages/domain`: deterministic geometry and masking rules.
- `packages/vision-web`: local MediaPipe face-detection adapter.
- `docs`: architecture and privacy documentation.

## Development commands

- Install dependencies: `npm install`
- Run the web app: `npm run dev:web`
- Run the desktop app: `npm run tauri:desktop -- dev`
- Run unit tests: `npm run test`
- Build the web app: `npm run build:web`
- Build the desktop front end: `npm run build:desktop`
- Run the full verification suite: `npm run verify`

## Working agreements

- Submit every repository change through a pull request. Do not push changes
  directly to the default branch.
- Deploy GitHub Pages only from changes merged into the default branch through
  the repository's Pages workflow. Do not deploy feature branches or bypass
  pull-request review.
- Use English for source code, documentation, issue content, and commit
  messages, pull-request titles, and pull-request descriptions.
- Keep changes focused and preserve existing user work.
- Add or update tests for geometry, masking behavior, and other deterministic
  domain logic changes.
- For UI changes, verify keyboard and pointer interactions and perform a visual
  check when practical.
- Run the narrowest relevant checks while iterating. Run `npm run verify`
  before completing desktop-related or cross-workspace changes.
- Review the final diff for privacy regressions, accidental generated files,
  and unrelated changes.
