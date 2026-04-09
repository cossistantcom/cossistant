# Progress Log

## Session: 2026-04-03

### Phase 1: Package Scaffold
- **Status:** complete
- **Started:** 2026-04-03
- Actions taken:
  - Created the new `packages/browser` workspace package.
  - Added package metadata, TypeScript config, build config, README, and placeholder entrypoint.
  - Added `task_plan.md`, `findings.md`, and `progress.md` inside the new package.
- Files created/modified:
  - `packages/browser/package.json`
  - `packages/browser/tsconfig.json`
  - `packages/browser/tsdown.config.ts`
  - `packages/browser/README.md`
  - `packages/browser/src/index.ts`
  - `packages/browser/task_plan.md`
  - `packages/browser/findings.md`
  - `packages/browser/progress.md`

### Phase 2: Core Controller Extraction
- **Status:** complete
- Actions taken:
  - Added `createSupportController(options)` to `@cossistant/core`.
  - Moved configuration status, unread derivation, visitor prefetch, realtime coordination, default messages, quick options, and navigation state behind the controller.
  - Added a controller snapshot API, subscriptions, lifecycle methods, and an event bus so adapters can consume the same runtime contract.
- Files created/modified:
  - `packages/core/src/support-controller.ts`
  - `packages/core/src/index.ts`

### Phase 3: React Adapter Migration
- **Status:** complete
- Actions taken:
  - Refactored `SupportProvider` to create and own a controller instance.
  - Reworked support store access to read from the controller instead of a module-level singleton.
  - Kept the public React surface intact while routing `SupportConfig`, `IdentifySupportVisitor`, `SupportHandle`, and support events through the controller path.
- Files created/modified:
  - `packages/react/src/controller-context.tsx`
  - `packages/react/src/provider.tsx`
  - `packages/react/src/support/store/support-store.ts`
  - `packages/react/src/support/index.tsx`
  - `packages/react/src/support/context/events.tsx`
  - `packages/react/src/support/context/websocket.tsx`
  - `packages/react/src/hooks/use-visitor.ts`
  - `packages/react/src/hooks/index.ts`

### Phase 4: Validation
- **Status:** complete
- Actions taken:
  - Added focused controller coverage in `@cossistant/core`.
  - Added a React regression test that checks the provider/store path is controller-backed.
  - Verified build and typecheck for `@cossistant/browser`, `@cossistant/core`, and `@cossistant/react`.
- Files created/modified:
  - `packages/core/src/support-controller.test.ts`
  - `packages/react/src/provider.controller-regression.test.ts`

### Phase 5: Deferred Browser Runtime
- **Status:** complete
- Actions taken:
  - Added `mountSupportWidget()` as the browser mount adapter.
  - Kept `@cossistant/browser` thin by rendering the existing React widget instead of introducing a second widget implementation.
  - Added optional controller injection to `SupportProvider` so browser can own the controller without reaching into React internals.
  - Added the public `window.Cossistant` runtime on top of the mount adapter.
  - Made the loader/runtime idempotent so repeat script execution does not re-queue or re-mount the widget.
- Files created/modified:
  - `packages/browser/src/mount-support-widget.ts`
  - `packages/browser/src/index.ts`
  - `packages/browser/src/mount-support-widget.test.ts`
  - `packages/browser/src/embed/asset-urls.ts`
  - `packages/browser/src/embed/loader-runtime.ts`
  - `packages/browser/src/embed/widget-runtime.ts`
  - `packages/browser/src/embed/loader.ts`
  - `packages/browser/src/embed/widget.ts`
  - `packages/browser/src/embed/widget.css`
  - `packages/browser/src/embed/asset-urls.test.ts`
  - `packages/browser/src/embed/loader-runtime.test.ts`
  - `packages/browser/src/embed/widget-runtime.test.ts`
  - `packages/browser/package.json`
  - `packages/browser/tsconfig.json`
  - `packages/browser/tsdown.config.ts`
  - `packages/browser/tsdown.embed.config.ts`
  - `packages/browser/README.md`
  - `packages/react/src/provider.tsx`
  - `packages/react/src/support/components/theme-wrapper.tsx`
  - `packages/react/src/provider.controller-regression.test.ts`

### Phase 6: CDN Packaging + Release Automation
- **Status:** complete
- Actions taken:
  - Added a dedicated browser embed build that outputs `loader.js`, `widget.js`, and `widget.css`.
  - Configured the embed build to alias React to Preact compat only for the CDN artifact.
  - Added fixed-version coupling so `@cossistant/browser` versions with `@cossistant/core` and `@cossistant/react`.
  - Extended CI to build the browser package.
  - Extended the release workflow to detect published browser versions, upload versioned assets to S3, mirror them to `latest/`, and invalidate only the `latest/` CloudFront path.
  - Aligned the release workflow with the shared upload infra variable names so the browser deploy now reuses `S3_REGION`, `S3_BUCKET_NAME`, and `S3_CDN_BASE_URL` instead of a separate widget-only bucket config.
  - Normalized the embed filenames after bundling so the shipped artifact contract is exactly `loader.js`, `widget.js`, and `widget.css`.
- Validation:
  - Verified the built embed output names and sizes in `packages/browser/dist/embed`.
  - Verified the built browser bundle no longer contains raw `react` / `react-dom` import strings.
  - Verified the built browser bundle no longer contains Zod / OpenAPI runtime code.
  - Current verified artifact sizes:
    - `loader.js`: 1,171 bytes raw / 638 bytes gzip
    - `widget.js`: 380,025 bytes raw / 122,183 bytes gzip
    - `widget.css`: 13,229 bytes raw / 2,104 bytes gzip
- Files created/modified:
  - `packages/browser/package.json`
  - `packages/browser/tsdown.embed.config.ts`
  - `packages/browser/tsdown.config.ts`
  - `.changeset/config.json`
  - `package.json`
  - `packages/release/src/release-cossistant.ts`
  - `.github/workflows/ci.yml`
  - `.github/workflows/release.yml`
  - `packages/browser/README.md`
  - `packages/browser/task_plan.md`
  - `packages/browser/findings.md`
  - `packages/browser/progress.md`

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| `bun test packages/core/src/support-controller.test.ts` | New controller lifecycle, state, subscriptions, and visitor flow | Controller behaves as the new canonical runtime | Passed | complete |
| `bun test packages/react/src/provider.controller-regression.test.ts` | React provider/store integration | React consumes the controller path instead of the old singleton runtime | Passed | complete |
| `bun test packages/browser/src/mount-support-widget.test.ts` | Browser mount adapter behavior | Browser mounts through React and exposes controller-backed lifecycle methods | Passed | complete |
| `bun test packages/browser/src/embed/asset-urls.test.ts` | Asset URL derivation | Loader resolves sibling widget assets correctly | Passed | complete |
| `bun test packages/browser/src/embed/loader-runtime.test.ts` | Loader stub/runtime bootstrap behavior | Loader queues API calls and avoids duplicate reloads | Passed | complete |
| `bun test packages/browser/src/embed/widget-runtime.test.ts` | Global runtime behavior | Runtime replays queued init calls and stays singleton-backed | Passed | complete |
| `bunx tsc --noEmit --project packages/browser/tsconfig.json` | Browser package scaffold | Typecheck succeeds | Passed | complete |
| `bunx tsc --noEmit --project packages/core/tsconfig.json` | Core controller exports | Typecheck succeeds | Passed | complete |
| `bunx tsc --noEmit --project packages/react/tsconfig.json` | React controller migration | Typecheck succeeds | Passed | complete |
| `bun run --filter @cossistant/browser build` | Browser scaffold build | Build succeeds | Passed | complete |
| `bun run --filter @cossistant/browser build:embed:js` | Browser embed JS build | Produces `loader.js` and `widget.js` with the Preact-backed embed runtime | Passed | complete |
| `bun run --filter @cossistant/core build` | Core package build | Build succeeds | Passed | complete |
| `bun run --filter @cossistant/react build` | React package build | Build succeeds | Passed | complete |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-04-03 | `bun run --filter @cossistant/react build` hit sandbox `AccessDenied` during the CSS build step | 1 | Re-ran the same build with escalation and it passed |
| 2026-04-03 | Browser adapter test could not resolve the `react` runtime in the test environment | 1 | Mocked `react` directly so the test validates the adapter contract instead of package-manager resolution |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Browser mount runtime is in place; only the public global API, CDN work, and docs remain |
| Where am I going? | Package/docs rollout can proceed on top of the now-verified embed and CDN release path |
| What's the goal? | Keep browser and React on the same widget implementation so browser updates follow React changes automatically |
| What have I learned? | The cleanest browser layer is controller ownership plus React rendering plus a separate production embed build |
| What have I done? | Built the browser mount/global runtime, added the Preact-based embed build, and wired release automation for versioned CDN assets |

---
*Versioned CDN delivery is implemented; the remaining production dependency is workflow configuration in GitHub/AWS.*
