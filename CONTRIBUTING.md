# Contributing to Maskly

## Before you start

Keep the local-first privacy boundary intact: do not add media uploads, telemetry, or remote face-analysis calls without a separately reviewed product and privacy decision.

Use English for source code, documentation, issue content, and commit messages in this public repository. Do not commit photos, personal data, credentials, tokens, signing material, or generated build output.

## Local workflow

```sh
npm install
npm run test
npm run build:web
npm run build:desktop
```

Run the full local verification before proposing desktop-related changes:

```sh
npm run verify
```

## Pull requests

All repository changes, including maintainer changes, must be proposed through a pull request. Do not push changes directly to the default branch. Use English for pull-request titles, descriptions, review comments, and linked issues.

Keep changes focused and explain the user-visible result. Add or update tests when changing geometry, masking behavior, or other deterministic domain logic. For UI changes, include a screenshot in the pull request when practical and verify keyboard and pointer interactions.

Production GitHub Pages deployments must come from the repository's Pages workflow after the pull request is reviewed and merged into the default branch. Do not deploy a feature branch or bypass pull-request review.
