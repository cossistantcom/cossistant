# Progress Log

## Session: 2026-08-03

### Phase 0: Checkpoint release remediation

- **Status:** complete
- Verified the intentional release-remediation diff and whitespace.
- Staged the 19 intended files explicitly.
- Created commit `f558ef04` with message `fix: clear release validation blockers`.
- Confirmed the branch is `main`, one commit ahead of `origin/main`.

### Phase 1: Package and build-system discovery

- **Status:** complete
- Read the planning-with-files instructions and templates.
- Ran session catch-up and determined its SDK-audit context was stale.
- Preserved the existing root planning files for the unrelated Tinybird article.
- Created this dedicated audit record.
- Inspected React, Next, and Core package manifests and tsdown configurations.
- Measured generated directory sizes and largest individual artifacts.
- Measured actual npm pack payloads using an isolated temporary npm cache.
- Inspected root barrels, Next wrapper entries, and React-to-Core import paths.
- Confirmed the compound-component assembly for `Support` and `Feedback` and selected a Bun-build plus sourcemap methodology for consumer experiments.

### Phase 2: Consumer bundle baselines

- **Status:** complete
- Created 17 temporary independent consumer entries under `/private/tmp/cossistant-react-size-audit`.
- Built each with Bun production minification while externalizing React peers.
- Compared root named imports, public subpaths, and root namespace imports across React, Next, and Core.
- Scanned every generated source map for Zod, Hono, and OpenAPI sources; found none.
- Built the repository's real React/Vite integration with production sourcemaps.
- Built the repository's real Next 16/Turbopack integration and inventoried its client chunks for route mapping.
- Parsed Next client-reference manifests to measure unique raw/gzip JS and CSS per route and checked chunk hashes for exact duplication.
- Added the special not-found route as a framework client baseline and identified a potential Turbopack root-barrel retention issue for minimal reproduction.
- Built an isolated in-workspace Next app using only root-imported `SupportProvider`; measured 128,948 B raw / 33,797 B gzip client JS.
- Rebuilt the minimal app with the provider subpath and with no SDK: root/subpath were identical; Provider's incremental cost was 19,788 B gzip.
- Copied the full Next integration, changed only SDK imports to existing granular subpaths, rebuilt route manifests, and ran the complete Playwright suite.
- Inspected the Vite sourcemap dependency set and identified sounds, Facehash, Floating UI, tailwind-merge, and Tiny Markdown for isolated footprint experiments.
- Inspected the exact dependency call sites and both React CSS delivery paths to define behavior-aware experiments.
- Compiled four CSS composition variants with the same Tailwind content scan and recorded raw/gzip output.
- Replaced only the generated React stylesheet for controlled Playwright runs, restoring the baseline after each run.
- Built six isolated dependency variants plus a combined upper-bound variant for the full Support entry.
- Measured encoded/decoded audio sizes and audited mount behavior across all default sound-hook call sites.
- Measured the Types tarball and representative schema dependency disk footprint; mapped actual React/Core runtime imports to lightweight Types subpaths.
- Built and source-map-compared a copied React/Vite integration using granular React subpaths; raw output and source set were effectively identical, with only 940 B gzip ordering variance.
- Ran the copied React/Vite subpath integration through all Playwright tests.
- Verified that Core's Zod/Hono/OpenAPI references are declaration-only and prepared source-map/minification package experiments.
- Measured Core packages with maps removed and with runtime JavaScript minified.

### Phase 3: Controlled optimization experiments

- **Status:** complete
- Tested Next 16.2.3 `experimental.optimizePackageImports` against the full multi-route root-import example.
- Confirmed it reproduces the original route graph byte-for-byte and therefore does not replace granular subpath imports for the current package structure.
- Audited declared React/Core runtime dependencies against source imports; found one redundant React declaration (`ulid`) and confirmed the schema stack remains declaration/package-graph overhead rather than browser code.
- Temporarily removed only the Next root client directive, rebuilt the package and full multi-route consumer, and rejected the change after it saved less than 1 KB gzip while retaining the route contamination. Restored the source directive.
- Verified React/Next already delete generated maps in their build scripts while Core/Types retain them; identified the existing React package-output validation command for final verification.
- Repeated the map-removal package experiment for the transitive Types package and measured a 48.1% packed / 34.9% unpacked reduction.
- Inventoried first-party examples, guides, registry templates, documentation, and production app imports; confirmed root Next imports are currently the dominant documented pattern.
- Built a controlled eager-Provider/dynamic-Support browser split and a static comparison. The split reduced initial gzip from 114,655 B to 23,083 B while adding only 1,651 B if Support is eventually loaded.

### Phase 4: Verification and recommendations

- **Status:** complete
- Ranked immediate import/package-output fixes, post-release architectural improvements, and rejected low-value or behavior-breaking changes.
- Removed all temporary in-workspace Next/React experiment apps and generated integration build/test artifacts; restored the generated Next environment declaration. Only the intentional audit report remains untracked.
- Ran forced builds and typechecks for Types, Core, React, and Next plus their required workspace dependencies: 10/10 Turbo tasks passed uncached.
- Re-ran React's package-output validator: 264 files, 573,254 B unpacked, with no forbidden vendored/test/type specifiers.

### Phase 5: Release implementation

- **Status:** complete
- User requested that the verified improvements ship in this release.
- Re-read the file-based planning instructions and the React bundle rules for direct imports, dynamic imports, conditional loading, and intent preloading.
- Verified the prior session-catchup text describes a stale historical PR; current branch remains `main` with checkpoint `f558ef04` and only this audit directory untracked.
- Inspected package configs and sound internals. Confirmed Core/Types are the remaining source-map publishers and that built-in audio needs both dynamic data imports and a shared lazy decoding service to realize the measured saving.
- Confirmed the exact no-preflight Tailwind composition, package export-generation behavior, and public Support types needed for a focused lazy entry.
- Implemented the first source batch: map-free Core/Types builds, focused React/Next lazy Support entries, no-preflight React CSS, redundant React `ulid` cleanup, and shared first-play audio loading with dynamically imported built-in sound data.
- First-batch typechecks passed: 6/6 uncached Turbo tasks.
- React production build completed and emitted the new `lazy-support` entry plus dynamically referenced sound module; CSS package-relative imports resolved.
- Diagnosed remaining map output as inherited `sourceMap`/`declarationMap` compiler settings and confirmed the Tailwind `bunx` resolution did not modify the lockfile.
- Disabled inherited source/declaration maps in all four package tsconfigs and pinned React's previously undeclared Tailwind CLI to the workspace's installed 4.2.2 toolchain for deterministic CSS builds.
- Updated the Bun lockfile successfully; dependency installation reports 1,722 installs checked with no package changes beyond manifest resolution.
- Rebuilt React with package-level map overrides: output fell from 599 files / 2.18 MB to 312 files / 793.85 KB and no maps were reported. The CSS command still resolved Tailwind 4.3.3 through `bunx`, so the command itself needs an explicit version or local-bin invocation.
- Verified zero map files/references, valid published lazy-support conditions, dynamic sound/Support import edges, and changed the CSS script to the pinned local CLI with `--no-install`.
- Inventoried all remaining first-party root Next imports and production-web React root imports in preparation for the focused-subpath migration.
- Migrated executable Next example, production app, and React/Next registry-template imports to focused provider/support/config/identify/hooks entries; began the same cleanup for React runtime consumers.
- Completed focused-subpath migration for production web runtime modules, both integration examples, registry templates, and generated integration-guide code strings.
- Verified the executable import migration with 16/16 uncached typecheck tasks across the production web app, both integrations, and their workspace dependencies.
- Migrated Next blog, concepts, quickstart, historical changelog, and release-template snippets to focused subpaths; corrected API DTO imports to come from `@cossistant/types`.
- Made the official lazy Support entry the default simple-widget pattern in the Next integration, Next/React quickstarts, and React README, while retaining eager focused Support imports for compound/custom compositions.
- Selected the existing Bun/happy-dom React harness for lazy-audio regression coverage and the public-export test for the new lazy subpath contract.
- Added and ran focused regression coverage for the lazy Support entry, export map, and shared first-play audio cache: 4/4 tests passed with 29 assertions.
- Rebuilt the no-preflight stylesheet using the pinned local Tailwind 4.2.2 CLI. The deterministic output is 62,220 B raw / 9,701 B gzip.
- Added a release changeset covering the React/Next lazy entry and runtime reductions plus Core/Types publish-payload reductions.
- Rebuilt React, Next, Core, and Types uncached: 4/4 package builds passed. A post-build scan found zero `.map` files and zero source-map references across all four outputs.
- Re-ran React's package-output validator: 266 files / 563,475 B unpacked, with the new lazy entry accepted.
- Measured final local registry payloads: React 149,194 B, Next 3,750 B, Core 73,066 B, Types 94,962 B packed.
- The first browser size run stayed below the 140,000 B hard ceiling but failed regression detection at 127,028 B gzip (+429 B). Simplifying the shared cache and async play path recovered 70 B gzip while retaining the behavior tests.
- Refreshed the browser baseline to the final 398,674 B raw / 126,958 B gzip output, as permitted for a below-ceiling release build. The 359 B gzip increase buys no audio initialization/fetch/decode on mount and does not change the 140,000 B absolute cap.
- Pinned the browser embed stylesheet build to the installed Tailwind 4.2.2 CLI. A full browser rebuild and size check now pass without dependency resolution or baseline drift.
- Rebuilt the real React/Vite integration: main JavaScript fell from 171.91 KB to 160.35 KB gzip, with the 10.65 KB gzip sound data moved to an on-demand chunk; CSS fell from 11.15 KB to 10.22 KB gzip.
- Rebuilt and re-analyzed the real Next integration. Provider-only routes remain 37.8–38.6 KB gzip, the eager custom route is 113.97 KB, and the final Next-aware default route entry is 40.97 KB before its 75.47 KB Support chunk. Sound data is a separate 10.75 KB on-demand chunk.
- Reworked the cross-framework lazy boundary after Playwright exposed Next client-reference and hydration timing problems. The final React entry uses a Suspense resource/forwardRef; the Next entry uses `next/dynamic({ ssr: false })` over the same cached loader.
- Final integration behavior is green: Next Playwright 4/4 and React/Vite Playwright 4/4.
- Added a repository guard that rejects broad runtime `@cossistant/next` imports in apps, examples, and release templates; the guard passes and is part of `check-types`/CI.
- Completed the repository release sweep: Ultracite passes; 20/20 typecheck tasks, 18/18 unit-test tasks, and 15/15 build tasks pass; OpenAPI is in sync; README links pass with network access; React package output and browser size gates pass.
- The web suite now contains 693 passing tests. Updating three stale root-barrel mocks was required after production imports moved to focused entries.
- Restored the two build-generated files (`apps/workers/server` and the Next example environment declaration) and confirmed only intentional release files remain.
- Re-ran Ultracite across 2,062 files, the focused Next import guard, and `git diff --check`; all passed immediately before staging.

## Test Results

| Test | Expected | Actual | Status |
|---|---|---|---|
| Checkpoint commit | One isolated commit with release fixes | `f558ef04`, 19 files | pass |
| Initial generated output scan | Identify dominant files and package-shape differences | React 1.27 MB, Next 100 KB, Core 1.25 MB on disk; CSS/maps/declarations dominate several outputs | pass |
| Published package dry run | Quantify actual registry payloads | React 149,383 B packed / 573,254 B unpacked; Next 2,876 B / 8,193 B; Core 174,415 B / 849,836 B | pass |
| Types/schema install footprint | Quantify browser-consumer transitive overhead | Types 183,334 B packed / 1.40 MB unpacked; schema stack roughly 9.7 MB on disk | pass |
| Root vs subpath consumer builds | Named root imports should tree-shake if package structure is healthy | Core, React, and Next root/subpath outputs were byte-identical or within compression noise | pass |
| Namespace import baseline | Quantify worst-case observable root barrel | React 125,772 B gzip; Next 125,960 B gzip | pass |
| Schema dependency scan | No server-schema stack in browser bundles | 0 Zod/Hono/OpenAPI sources across all 17 builds | pass |
| React/Vite integration build | Reproduce reported large-bundle conditions | 546.95 KB JS / 171.91 KB gzip and 66.53 KB CSS / 11.15 KB gzip; Vite warns above 500 KB | pass |
| React/Vite root vs subpaths | Test real Vite tree-shaking | Raw differs by 22 B; identical source set; 940 B gzip ordering variance | pass |
| React/Vite subpath behavior | Preserve integration behavior | 4/4 Playwright tests passed | pass |
| Next integration production build | Verify package under Next 16/Turbopack | Five static routes compiled; client directory totals 1.36 MB raw across shared/route chunks | pass |
| Next route manifest analysis | Convert aggregate chunks into per-route transfer estimates | 134.1–147.4 KB gzip JS per route plus 11.5 KB gzip CSS; no exact duplicate chunks | pass |
| Minimal Next root vs provider subpath | Test Turbopack tree-shaking directly | Both 128,948 B raw / 33,797 B gzip | pass |
| Minimal Next no-SDK baseline | Attribute Provider increment | 58,086 B raw / 14,009 B gzip; Provider adds 19,788 B gzip | pass |
| Full Next root-to-subpath imports | Test cross-route shared-barrel retention | Dashboard/pricing saved 106–107 KB gzip; Support routes saved 8–19 KB gzip | pass |
| Full Next subpath behavior | Preserve integration behavior | 4/4 Playwright tests passed | pass |
| Next `optimizePackageImports` | Determine whether a config-only change isolates root imports | Exact original route sizes; no optimization under Turbopack | rejected |
| Next root without client directive | Determine whether leaf client boundaries isolate exports | Dashboard/pricing still ~144.1 KB gzip versus 37–39 KB with subpaths | rejected |
| Support dependency variants | Quantify removable upper bounds | Sounds 11.7 KB gzip; tailwind-merge 8.2 KB; Floating UI 8.1 KB; Facehash 5.8 KB; Tiny Markdown 1.6 KB | pass |
| CSS composition variants | Separate Tailwind overhead from Cossistant rules | No-preflight saves 998 B gzip; utilities-only saves 4,214 B; Cossistant-only lower bound saves 8,428 B | pass |
| No-preflight CSS integration | Preserve current widget behavior | 4/4 React/Vite Playwright tests passed | pass |
| Utilities-only CSS integration | Preserve current widget behavior | 2/4 failed: trigger positioning and mobile fullscreen CSS broke | rejected |
| Core without maps | Quantify registry payload reduction | 73,138 B packed / 441,667 B unpacked; 58.1% packed reduction | pass |
| Core minified with maps | Quantify secondary publish optimization | 161,665 B packed / 771,288 B unpacked; 7.3% packed reduction | pass |
| Core minified without maps | Quantify combined publish optimization | 61,601 B packed / 365,766 B unpacked; 64.7% packed reduction | pass |
| Types without maps | Quantify transitive registry/package footprint | 95,143 B packed / 912,718 B unpacked; saves 88,191 B packed | pass |
| Dynamic Support boundary | Quantify initial-load deferral | 114,655 B static vs 23,083 B initial + 93,223 B deferred | pass |
| Audited package builds/typechecks | Verify current package sources and generated outputs | 10/10 uncached Turbo tasks successful | pass |
| React published-output validation | Verify publish file/type boundaries | 264 files / 573,254 B unpacked; validator passed | pass |
| New lazy Support/audio regressions | Prove one cached module load, no audio work on mount, and one shared decode | 4/4 tests, 29 assertions | pass |
| Pinned no-preflight CSS build | Prove deterministic local compiler and record release output | Tailwind 4.2.2; 62,220 B raw / 9,701 B gzip | pass |
| Final affected package builds | Rebuild React, Next, Core, and Types from source | 4/4 uncached Turbo builds | pass |
| Final map scan | No source/declaration maps or stale references | Zero files and zero references across four packages | pass |
| Final publish payloads | Quantify actual local tarballs | React 149,194 B; Next 3,750 B; Core 73,066 B; Types 94,962 B packed | pass |
| Final React output validation | Validate publish files/types after new entry | 266 files / 563,475 B unpacked | pass |
| Browser embed first size gate | Retain the prior regression baseline | 127,028 B gzip, +429 B; hard ceiling passed but regression gate failed | blocked then optimized |
| Browser embed final baseline | Record legitimate below-ceiling runtime change | 398,674 B raw / 126,958 B gzip, 13,042 B below hard cap | pass |
| Final browser full build/size gate | Verify deterministic CSS compiler and refreshed baseline | Tailwind 4.2.2; all three assets at baseline; hard cap passed | pass |
| Final React/Vite production build | Move built-in audio off initial JS and reduce CSS | Main JS 160.35 KB gzip (-11.56 KB); sound 10.65 KB deferred; CSS 10.22 KB (-0.93 KB) | pass |
| Final Next production routes | Verify focused/lazy defaults in Turbopack | `/` entry 40.97 KB; deferred Support 75.47 KB; dashboard/pricing 38.62/37.78 KB; sound 10.75 KB deferred | pass |
| Final Next lazy behavior | Ensure the visible trigger is hydrated and opens across desktop/mobile | 4/4 Playwright tests | pass |
| Final React/Vite behavior | Preserve trigger, panel, mobile, and custom route behavior | 4/4 Playwright tests | pass |
| Focused Next import guard | Prevent route-contaminating broad imports from returning | Guard passes and is wired into `check-types` | pass |
| Repository formatting/lint | Validate all source and documentation formatting | Ultracite checked 2,062 files; no errors | pass |
| Full repository typecheck | Validate every package/app plus import guards | 20/20 Turbo tasks | pass |
| Full repository unit tests | Validate every test-bearing package/app | 18/18 Turbo tasks; web 693/693 | pass |
| Full repository build | Compile all build-bearing packages/apps | 15/15 Turbo tasks | pass |
| OpenAPI drift | Verify generated contract output | 10/10 relevant Turbo tasks | pass |
| Documentation links | Verify README URLs | 3/3 links pass with network access | pass |

## Error Log

| Timestamp | Error | Attempt | Resolution |
|---|---|---:|---|
| 2026-08-03 | `.git/index.lock` permission denied | 1 | Re-ran authorized staging with repository-write approval. |
| 2026-08-03 | `npm pack --dry-run` failed because the global npm cache has root-owned files | 1 | Switched planned approach to Bun or an isolated temp cache. |
| 2026-08-03 | Audit findings patch context did not match after earlier insertions | 1 | Located the current anchors with `rg` and applied a narrower patch. |
| 2026-08-03 | `--no-sourcemap` did not override Core's config and metadata copy referenced nonexistent `dist/README.md`/`dist/LICENSE` | 1 | Kept the valid minified-with-maps measurement; will remove maps explicitly in the temp output for the combined variant and avoid copying nonexistent files. |
| 2026-08-03 | Tailwind CLI first lacked temp permission, then could not resolve package imports from `/private/tmp` | 1/2 | Escalated for temp access, then changed the planned input to explicit installed CSS paths rather than repeating unresolved package imports. |
| 2026-08-03 | CSS variant copy used a repository-relative path from the example subdirectory | 1 | The Playwright pass was only a baseline and is not counted as variant validation; next attempt uses the verified absolute `packages/react/dist/styles.css` path. |
| 2026-08-03 | Utilities-only CSS failed layout integration tests | 1 | Rejected the variant and restored the exact full stylesheet; retain only no-preflight as the validated CSS candidate. |
| 2026-08-03 | Next manifest analyzer doubled the `static/` path prefix | 1 | Corrected normalization for both `static/...` and `/_next/static/...` manifest paths. |
| 2026-08-03 | Minimal Next app linked root `node_modules`, which has no `next` binary | 1 | Relink the temp app to the verified example-local `node_modules` where Next is installed. |
| 2026-08-03 | Turbopack rejected the minimal app's `node_modules` symlink because `/private/tmp` is outside its filesystem root | 2 | Move the isolated app under the monorepo `examples/` tree so all package/dependency symlinks stay within Turbopack's workspace root. |
| 2026-08-03 | Dynamic Support temp entry could not resolve workspace aliases from `/private/tmp` | 1 | Changed the temporary experiment to the same absolute local source entries used by the successful baseline runner. |
| 2026-08-03 | Implementation findings patch used a slightly stale progress sentence | 1 | Read the current anchor and reapplied a narrower patch; no source changes were affected. |
| 2026-08-03 | First implementation batch patch could not match the React manifest export anchor | 1 | No source changes were applied; split the batch into smaller patches based on current file order. |
| 2026-08-03 | React build still reported generated map files despite `sourcemap: false` | 1 | Inspect tsdown/declaration configuration before changing cleanup policy; do not assume the top-level flag covers resolved declaration maps. |
| 2026-08-03 | React CSS build resolved a newer Tailwind CLI and reported saving the lockfile | 1 | Inspect the lockfile diff and local CLI resolution; pin/use the workspace dependency if the build changed dependency state. |
| 2026-08-03 | One multiline React import patch appended a second `from` clause | 1 | Corrected the file immediately and used explicit remove/add hunks for the remaining multiline imports. |
| 2026-08-03 | Browser embed size gate detected a 429 B gzip regression after shared lazy-audio implementation | 1 | Simplified the cache/async path, retained passing behavior coverage, and refreshed the permitted below-ceiling baseline at 126,958 B gzip; absolute cap remains 140,000 B. |
| 2026-08-03 | Both Playwright servers failed to bind ports inside the sandbox | 1 | Re-ran with local-server permission; Vite then passed 4/4 and Next exposed a real lazy-boundary bug. |
| 2026-08-03 | Next dev resolved the `React.lazy` target as a nested client-reference object | 1 | Replaced `React.lazy` with a Suspense promise resource around a typed `forwardRef` component; rerun unit, build, and both Playwright suites. |
| 2026-08-03 | The generic lazy resource rendered the Next trigger before the client boundary was interactive, so immediate clicks did not open content | 2 | Added a Next-specific `next/dynamic` wrapper with `ssr: false` around the same cached React module loader; this avoids presenting an unhydrated control. |
| 2026-08-03 | Phase-status planning patch used an unbulleted status anchor | 1 | Re-read the plan and applied the update against the exact bulleted status lines. |
| 2026-08-03 | Initial Ultracite sweep found formatting/type-export issues and generated Playwright JSON | 1 | Applied the exact formatter changes, aliased imported public types before re-exporting them, removed untracked results, and reran successfully. |
| 2026-08-03 | Full web tests had 13 failures across three files after focused-import migration | 1 | Updated stale root-barrel mocks to the same hooks/provider subpaths as production; targeted 13/13, web 693/693, and full monorepo tests then passed. |
| 2026-08-03 | README link checker reported status 0 for all three live URLs inside the network sandbox | 1 | Re-ran with network access; all 3/3 links passed. |

## 5-Question Reboot Check

| Question | Answer |
|---|---|
| Where am I? | Complete: release-safe changes are implemented and verified |
| Where am I going? | Commit the intentional release payload and hand off the measured result |
| What's the goal? | Ship smaller React/Next initial bundles and smaller Core/Types package payloads without behavior regressions |
| What have I learned? | Focused Next entries prevent cross-route retention; lazy built-in audio and no-preflight CSS reduce the React initial path; maps dominated Core/Types tarballs |
| What have I done? | Implemented the package APIs and guards, rebuilt every package/app, passed all tests and integrations, and restored generated artifacts |
