# Task Plan: Browser Package Rollout

## Goal
Ship a browser embed that reuses the React widget, ships smaller via Preact
compat, and deploys automatically to the CDN whenever the shared widget runtime
changes.

## Current Phase
Phase 6 complete

## Phases

### Phase 1: Package Scaffold
- [x] Create `packages/browser`
- [x] Add package metadata and build config
- [x] Create planning files inside the package
- **Status:** complete

### Phase 2: Core Controller Extraction
- [x] Add `createSupportController(options)` to `@cossistant/core`
- [x] Move widget runtime state into the controller
- [x] Add controller events and snapshot subscription API
- **Status:** complete

### Phase 3: React Adapter Migration
- [x] Refactor `SupportProvider` to create and own a controller
- [x] Make support store access controller-scoped instead of module-scoped
- [x] Keep public React APIs backward compatible
- **Status:** complete

### Phase 4: Browser Mount Runtime
- [x] Build `mountSupportWidget()` on top of the controller and existing React UI
- [x] Support Shadow DOM mounting and stylesheet injection
- [x] Keep the browser runtime controller-backed and React-rendered
- **Status:** complete

### Phase 5: Public Browser API
- [x] Add `window.Cossistant.init()`
- [x] Add imperative runtime methods (`show`, `hide`, `toggle`, `identify`, `destroy`)
- [x] Add config/event methods (`updateConfig`, `on`, `off`)
- **Status:** complete

### Phase 6: CDN Packaging + Release Automation
- [x] Add a dedicated embed build with `loader.js`, `widget.js`, and `widget.css`
- [x] Alias React to Preact compat for the embed build only
- [x] Keep CSS isolated in a ShadowRoot while preserving `--co-*` theming
- [x] Tie `@cossistant/browser` versioning to `@cossistant/core` and `@cossistant/react`
- [x] Extend GitHub release automation to upload versioned assets and refresh `latest/`
- [x] Run final verification and document any remaining edge cases
- **Status:** complete

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Browser keeps rendering through `@cossistant/react` | Browser updates automatically when the React widget changes |
| Preact compat is only used in the embed build | npm React consumers stay unchanged while the CDN bundle gets smaller |
| Shadow DOM is the default mount boundary | Tailwind output stays isolated from the host page |
| CSS variables remain the theming contract | Existing `--co-*` / `--co-theme-*` customizations still work |
| Browser is in the same fixed-version group as core/react | CDN releases stay coupled to runtime/widget changes automatically |

## Notes
- The browser package now covers both the mount runtime and the production embed build.
- CDN/docs are no longer deferred; they are part of the active delivery path.
- Verified embed artifact contract:
  - `loader.js`
  - `widget.js`
  - `widget.css`
