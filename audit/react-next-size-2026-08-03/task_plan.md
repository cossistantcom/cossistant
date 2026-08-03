# React / Next Package Size Audit

## Goal

Measure and implement release-safe size improvements for `@cossistant/react`, `@cossistant/next`, shared `@cossistant/core`, and transitive browser dependencies, with production builds and behavior tests proving the result.

## Current Phase

Complete — implemented, verified, and ready for release

## Phases

### Phase 1: Package and build-system discovery

- [x] Inventory package exports, dependencies, side effects, and build configuration.
- [x] Measure current packed and generated artifacts.
- [x] Map runtime imports across React, Next, Core, and Types.
- **Status:** complete

### Phase 2: Consumer bundle baselines

- [x] Build representative minimal React and Next consumers with Bun.
- [x] Validate against the repository's real Vite and Next integrations.
- [x] Record raw, gzip, and source-map module-presence results.
- [x] Test root imports versus supported subpath imports.
- **Status:** complete

### Phase 3: Controlled optimization experiments

- [x] Test concrete dependency/import/build changes in temporary workspaces or reversible local patches.
- [x] Rebuild and quantify deltas.
- [x] Reject changes that do not produce meaningful verified savings.
- **Status:** complete

### Phase 4: Verification and recommendations

- [x] Rank opportunities by savings, risk, and implementation effort.
- [x] Re-run package-output and type/build tests relevant to conclusions.
- [x] Restore experimental artifacts and leave a clean intentional worktree.
- **Status:** complete

### Phase 5: Implement release-safe improvements

- [x] Replace first-party Next root imports with focused public subpaths.
- [x] Disable release source/declaration maps for React, Next, Core, and Types without stale map references.
- [x] Add an official lazy Support runtime entry with preload support.
- [x] Replace eager per-hook audio decoding with a shared lazy audio service/cache.
- [x] Remove Tailwind preflight from the precompiled React stylesheet.
- [x] Remove redundant React dependency declarations.
- **Status:** complete

### Phase 6: Release verification

- [x] Add/update regression tests for new public APIs and lazy audio behavior.
- [x] Rebuild and remeasure packages, Next routes, browser embed, and publish payloads.
- [x] Run package typechecks, unit tests, integrations, lint/format, and package-output checks.
- [x] Commit the release optimization changes with only intentional files.
- **Status:** complete

## Key Questions

1. How much code does each public entry add to a real consumer production bundle?
2. Are root barrel exports defeating tree-shaking or pulling optional feature areas into the common path?
3. Does Core or Types introduce schema/server dependencies into React or Next runtime bundles?
4. Are package tarball complaints caused by JavaScript, declarations/source maps, CSS, assets, or duplicated dependency output?
5. Which changes demonstrably reduce size without changing public behavior?

## Decisions Made

| Decision | Rationale |
|---|---|
| Preserve existing root planning files | They belong to a completed Tinybird article task and are tracked user work. |
| Store this audit under `audit/react-next-size-2026-08-03/` | Keeps the audit reproducible without overwriting unrelated planning artifacts. |
| Commit release-blocker work before experiments | User explicitly authorized a checkpoint; commit `f558ef04` isolates the audit. |
| Keep experiments reversible until evidence is clear | The user requested an audit and actual experimentation, not speculative production changes. |
| Test the Next root directive independently | Each leaf entry already declares a client boundary; removing only the root directive may preserve imports while allowing route isolation. Revert after measurement. |
| Measure a real dynamic Support boundary | Provider versus Support baselines show a large gap; a split build can quantify how much moves off the initial browser path without changing package internals. |
| Implement only compatibility-proven release changes | The schema-package split and behavior-changing dependency removals remain deferred unless declarations and all consumer suites prove safe. |
| Follow direct-import and dynamic-import guidance | The React performance skill confirms focused entries, conditional loading, and intent-based preloading as the correct bundle strategy. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Sandbox denied `.git/index.lock` during staging | 1 | Re-ran the explicitly authorized `git add` with repository-write approval. |
| Planning catch-up referenced an old SDK audit session | 1 | Verified current git state and current tracked planning files; treated old catch-up text as stale. |
| `npm pack --dry-run` could not use the user npm cache because it contains root-owned files | 1 | Do not repeat with the same cache; use Bun's pack tooling or an isolated npm cache under `/private/tmp`. |
| Findings patch context drifted after earlier insertions | 1 | Located current anchors and used a narrower patch rather than repeating the failed patch. |
| Core CLI override retained source maps; metadata copy named absent files | 1 | Treat current build as the minified-with-maps variant, then explicitly remove temp maps for the combined experiment. |
| Tailwind CSS temp inputs could not resolve `tailwindcss` package imports | 1/2 | Use explicit installed CSS paths in the next attempt; permission and resolution were separate failures. |
| First CSS variant test copied to the wrong relative path | 1 | Discard that run as a baseline-only pass and use absolute paths for the corrected variant test. |
| Utilities-only CSS broke fixed/mobile positioning | 1 | Reject the variant; the exact baseline stylesheet was restored automatically. |
| Next analyzer doubled the static path prefix | 1 | Normalize both manifest path formats relative to `.next/static` before measurement. |
| Minimal Next app could not find the Next binary from root `node_modules` | 1 | Use the existing Next example's local dependency tree for the isolated app. |
| Turbopack rejected an external-project dependency symlink | 2 | Relocate the experiment under `examples/` within the monorepo filesystem root. |
| Dynamic Support temp entry could not resolve workspace package aliases from `/private/tmp` | 1 | Match the earlier audit entries and import the absolute local source entry paths. |
| Implementation findings patch used a slightly stale progress sentence | 1 | Read the current anchor and apply a narrower patch. |
| First implementation batch patch could not match the React manifest export anchor | 1 | Split the large multi-file patch into smaller ordered patches using the verified current manifest layout. |
| React build still reported generated maps despite `sourcemap: false` | 1 | Inspect tsdown declaration settings and keep/restore cleanup until maps and references are both controlled. |
| React CSS build resolved a newer Tailwind CLI and saved the lockfile | 1 | Inspect dependency/lockfile drift and pin the build tool if needed. |
| One multiline React import patch appended a second `from` clause | 1 | Inspected the exact file, replaced both clauses with one focused support import, and continued with explicit replacements. |
| Playwright web servers could not bind inside the filesystem sandbox | 1 | Re-ran both suites with the required local-network permission. |
| Next dev rejected a nested lazy client reference from `React.lazy` | 1 | Replace the wrapper with a Suspense resource/forwardRef boundary, then rerun both framework suites before accepting the API. |
| The generic Suspense resource server-rendered a trigger before Next hydrated the lazy boundary | 2 | Keep the React resource for Vite and implement the Next entry with `next/dynamic({ ssr: false })`, using the same cached loader so visible controls are already interactive. |
| Phase-status planning patch used an unbulleted status anchor | 1 | Read the current plan and applied a narrower patch against the exact `- **Status:**` lines. |

## Notes

- Branch is `main`.
- Do not push unless the user asks.
- Temporary bundle experiments should live under `/private/tmp` where practical.
