# Findings

## Requirements

- Audit `@cossistant/react` and `@cossistant/next` for size reduction opportunities.
- Include shared `@cossistant/core` and transitive runtime dependencies.
- Base conclusions on actual builds, package inspection, and controlled experiments.
- Checkpoint the completed release-blocker remediation before starting.

## Initial State

- Release-blocker work was committed as `f558ef04` (`fix: clear release validation blockers`).
- The prior widget investigation proved that a type/schema entry can accidentally add substantial runtime weight, so this audit will explicitly distinguish runtime imports from type-only imports.
- Existing root `task_plan.md`, `findings.md`, and `progress.md` are for a completed Tinybird guest-post task and must remain untouched.

## Research Findings

### Package/build configuration

- `@cossistant/react` publishes many granular subpaths and marks only CSS as side-effectful. Its build is unbundled and externalizes React, Core, Types, Tiny Markdown, Facehash, Floating UI, CVA, clsx, nanoid, tailwind-merge, and ulid.
- React's generated `dist` currently occupies about 1.27 MB on disk. Known large individual files include `styles.css` (65,302 bytes), `sounds/sound-data.js` (24,035 bytes), and `support/components/icons.js` (15,223 bytes). The existing package-output check previously measured 573,254 unpacked bytes across 264 published files.
- `@cossistant/next` is a thin unbundled wrapper around `@cossistant/react`; its generated `dist` occupies about 100 KB on disk.
- `@cossistant/core` is unbundled but deliberately emits source maps and resolved/bundled declarations. Its generated `dist` occupies about 1.25 MB on disk. Several of its largest files are maps (`rest-client.js.map` 52,098 bytes, `client.js.map` 41,616 bytes) and vendored workspace declarations under `dist/types/src` (`realtime-events.d.ts` 60,857 bytes, `conversation.d.ts` 53,783 bytes).
- Core declares `zod` and `@hono/zod-openapi` as runtime dependencies even though the build comment says they are needed because Types uses them. This is a candidate for dependency/package-footprint investigation, but runtime impact must be measured before recommending removal.
- React and Core root entries still need consumer-level tree-shaking tests; package file size alone does not establish application bundle cost.

### Published package measurements

| Package | Packed tarball | Unpacked publish payload | Generated runtime JS | Declarations | CSS | Source maps |
|---|---:|---:|---:|---:|---:|---:|
| `@cossistant/react` | 149,383 B | 573,254 B | 295,378 B | 182,392 B | 81,721 B | removed before publish |
| `@cossistant/next` | 2,876 B | 8,193 B | 2,673 B | 2,014 B | 81 B | removed before publish |
| `@cossistant/core` | 174,415 B | 849,836 B | 173,076 B | 265,636 B | none | 366,933 B |

- Next itself is already very small; its apparent consumer cost is almost entirely the React package it re-exports.
- Core's published payload is larger than React's despite substantially less runtime JS because Core publishes about 367 KB of source maps plus about 266 KB of resolved declarations. Removing published maps is a high-confidence package-download opportunity, separate from browser bundle size.
- React's publish payload is mainly runtime JS, declarations, and CSS. Its CSS total includes the 65,302-byte generated stylesheet plus support styles; whether consumers load all of it depends on their CSS import.
- Core source and compiled runtime JavaScript contain no direct Zod, Hono, or OpenAPI imports. Those imports only appear in Core's resolved declaration copies under `dist/types/src`, confirming the schema packages are installed for declaration compatibility rather than Core runtime behavior.
- Removing Core's schema dependencies is therefore potentially possible only together with a declaration strategy change (for example, retaining `@cossistant/types` package references instead of vendoring its declarations). It is not safe to delete the dependencies in isolation because the published `.d.ts` files currently reference them.
- `@cossistant/types` itself is 183,334 B packed / 1,402,670 B unpacked. A representative installed schema stack occupies roughly 9.7 MB on disk: Zod ~6.15 MB, Hono ~2.78 MB, zod-to-openapi ~0.32 MB, OpenAPI3 types ~0.29 MB, and the Hono adapter ~0.13 MB.
- React/Core runtime code only imports lightweight Types entries (`enums`, `support-state`, and `tool-timeline-policy`), and measured browser bundles contain no schema stack. Nevertheless, package managers install the full Types schema dependencies for every React user. A longer-term split between schema-free shared DTO/runtime types and server/OpenAPI schemas could remove roughly 10 MB of installed transitive files for browser-only consumers.
- This dependency split is higher effort than the support-state entry because React's public declarations reference many API types. It requires moving schema-free structural types or introducing a dedicated runtime/types package while preserving existing schema exports for servers.

### Entry-point shape

- React's root entry re-exports feedback, every hook, identify-visitor, provider, realtime, the complete support widget, support configuration, and a `Primitives` namespace.
- Next's root entry mirrors React and adds utils; all Next implementation entries are thin re-exports from matching React subpaths.
- Granular React subpaths exist for provider, support, feedback, hooks, realtime, utilities, and many primitives, so a meaningful root-versus-subpath experiment is possible without introducing a new public API.
- React mostly uses granular Core runtime imports, but a few runtime imports/re-exports still use the Core root barrel. These need module-attribution tests because modern bundlers may tree-shake them while weaker/namespace paths may retain more.
- `Support` and `Feedback` are compound components assembled with `Object.assign`, so importing either intentionally retains its associated Root/Trigger/Content graph. Savings for consumers using the full default widgets will need to come from internal dependency reduction or a new lean entry, not merely a different import spelling.
- Bun's CLI bundler can provide deterministic minified output sizes and externalize React peers, but it does not expose a CLI metafile in this version. The consumer experiment will therefore pair byte/gzip measurements with sourcemap source inspection for attribution.

## Experiment Results

### Bun production consumer baselines

All measurements are minified browser ESM with React/React DOM peers externalized. Each entry was built independently; the 88-byte empty-entry output is not subtracted below.

| Consumer import | Raw | Gzip | Sources | Schema/server sources |
|---|---:|---:|---:|---:|
| Core client from root | 60,064 B | 16,919 B | 25 | 0 |
| Core client from subpath | 60,064 B | 16,917 B | 25 | 0 |
| Core ID helper from root | 1,920 B | 982 B | 2 | 0 |
| Core ID helper from subpath | 1,920 B | 983 B | 2 | 0 |
| React provider from root | 75,162 B | 21,343 B | 37 | 0 |
| React provider from subpath | 75,162 B | 21,342 B | 37 | 0 |
| React feedback from root | 97,377 B | 34,217 B | 42 | 0 |
| React feedback from subpath | 97,377 B | 34,216 B | 42 | 0 |
| React support from root | 288,673 B | 96,375 B | 161 | 0 |
| React support from subpath | 288,674 B | 96,946 B | 161 | 0 |
| React root namespace | 391,049 B | 125,772 B | 209 | 0 |
| Next provider from root/subpath | 75,162 B | 21,342 B | 37 | 0 |
| Next support from root | 288,673 B | 96,375 B | 161 | 0 |
| Next support from subpath | 288,674 B | 96,946 B | 161 | 0 |
| Next root namespace | 391,329 B | 125,960 B | 209 | 0 |

Interpretation:

- Named imports from the React/Core/Next root barrels tree-shake to effectively the same output as granular subpaths in Bun. Rewriting ordinary named imports to subpaths does not produce a meaningful byte reduction with a modern tree-shaking bundler.
- Next adds effectively no application-bundle overhead beyond React; root/subpath measurements match React.
- Namespace imports are materially worse because every export remains observable: about 29.4 KB gzip above the full Support entry and about 104.4 KB gzip above Provider alone. Documentation/lint guidance should discourage `import * as Cossistant` for browser code.
- No Zod, Hono, or OpenAPI sources appeared in any measured React, Next, or Core consumer bundle, including namespace imports. The prior widget schema leak is not present here after the support-state fix.
- The full default Support graph is the dominant runtime target at roughly 96.4 KB gzip excluding React peers and CSS. Provider-only and Feedback-only consumers are far smaller.

### Full Support dependency upper bounds

Each variant replaces exactly one dependency with a minimal behavior-changing stub. These numbers measure the maximum footprint attributable to that dependency/path; they are not direct safe-removal recommendations.

| Variant | Raw | Gzip | Gzip reduction |
|---|---:|---:|---:|
| Baseline Support | 288,627 B | 96,333 B | — |
| Replace inline sound data | 264,719 B | 84,626 B | 11,707 B |
| Replace tailwind-merge | 262,103 B | 88,166 B | 8,167 B |
| Replace Floating UI | 266,848 B | 88,186 B | 8,147 B |
| Replace Facehash | 272,680 B | 90,499 B | 5,834 B |
| Replace Tiny Markdown utils | 284,697 B | 94,711 B | 1,622 B |
| Replace all five | 196,551 B | 60,429 B | 35,904 B |

- Inline sounds are the strongest low-risk target: moving them from base64 JavaScript constants to emitted/cacheable audio assets or fetching them only when sound is enabled can remove about 11.7 KB gzip from the main JS without removing the feature.
- tailwind-merge has an 8.2 KB gzip footprint, but it enables user class overrides and conflict resolution. A safe reduction would require proving a smaller merge implementation against the package's class-override test matrix; simply switching to `clsx` is not behavior-preserving.
- Floating UI contributes about 8.1 KB gzip and provides collision handling/focus-related positioning behavior. Deferring it behind an async panel boundary or offering an explicit static-positioning entry/mode is safer than removing it.
- Facehash contributes about 5.8 KB gzip. A lazy fallback-avatar chunk or explicit initials-only lightweight mode could move this off the critical path while preserving the current default for existing users.
- Tiny Markdown's 1.6 KB gzip footprint is too small to justify a disruptive parser change by itself.

### Dynamic Support boundary experiment

A controlled Bun browser build exported `SupportProvider` eagerly and loaded `Support` through a dynamic import. React peers remained external, matching the other browser measurements.

| Variant/output | Raw | Gzip | Initial? |
|---|---:|---:|---:|
| Static Provider + Support entry | 357,480 B | 114,655 B | yes |
| Dynamic loader entry | 157 B | 145 B | yes |
| Shared/eager Provider chunk | 79,320 B | 22,938 B | yes |
| Deferred Support chunk | 280,088 B | 93,223 B | no |

- The dynamic boundary reduces initial SDK JavaScript from 114,655 B to 23,083 B gzip, a 91,572 B (79.9%) reduction for the same Provider + Support export set.
- Loading Support later transfers 116,306 B gzip in total, only 1,651 B more than the static build because of chunk/compression overhead.
- This is a real code-splitting build result, not a behavior-complete SDK patch. A production design still needs a stable lazy entry/component, loading/fallback behavior, prefetch-on-intent, SSR/hydration checks, and Playwright coverage.
- The result makes deferred Support the highest-upside architectural option after the no-redesign Next subpath fix. It can preserve an eager Provider while moving almost all widget UI off routes or sessions that never open support.

#### Sound path detail

- The two base64 data URLs are 7,670 and 16,238 bytes in JavaScript and decode to 5,735 and 12,161 bytes of MP4 audio (17,896 bytes total).
- `useSoundEffect` creates an `AudioContext`, fetches, and decodes its sound inside an effect on mount—not on first playback. Default Support can mount sound hooks in the trigger, conversation page, and conversation timeline, creating multiple hook instances and potentially repeated audio contexts/decodes.
- Simply externalizing both audio files and eagerly loading them would improve main-JS size but could increase first-load bytes (17.9 KB audio versus 11.7 KB compressed JS contribution). The recommended design is a shared lazy audio cache/service: load/decode on first relevant playback or deliberate preload, reuse one context/buffer per sound, and emit/cache the MP4 assets separately. This improves main bundle, startup work, and duplicate decode behavior together.
- A dynamic audio chunk is another low-risk packaging option if emitted asset URLs are awkward; it moves roughly 11.7 KB gzip off the initial chunk while keeping current encoded data, at the cost of a delayed first playback.

### Core publish-output experiments

| Core package variant | Packed | Unpacked | Packed reduction | Unpacked reduction |
|---|---:|---:|---:|---:|
| Current output | 174,415 B | 849,836 B | — | — |
| Remove all source/declaration maps | 73,138 B | 441,667 B | 101,277 B (58.1%) | 408,169 B (48.0%) |
| Minify JS, retain maps | 161,665 B | 771,288 B | 12,750 B (7.3%) | 78,548 B (9.2%) |
| Minify JS and remove maps | 61,601 B | 365,766 B | 112,814 B (64.7%) | 484,070 B (57.0%) |

- Removing maps is the clearest package-download win found so far and does not affect runtime bundle output. React and Next already remove maps before publishing; Core should align with them unless maintainers explicitly value registry-distributed maps over a 58% tarball reduction.
- Minifying Core's already tree-shakeable library modules produces a smaller package but only a 7.3% tarball reduction while making published source less readable. It is secondary to map removal and should be considered only with good stack traces/source-map policy.
- Combining minification and map removal reaches a 64.7% packed reduction, but only about 6.6 percentage points beyond map removal alone. This reinforces map removal as the best first change.
- The inconsistency is visible in build scripts: React and Next explicitly delete every generated `*.map` before preparing their packages, while Core and Types publish tsdown's source and declaration maps. This makes map removal a packaging-policy alignment, not a bundler redesign.
- The current delete-after-build approach can leave `sourceMappingURL` comments pointing at removed files (observed in the generated Next entry). Prefer disabling release-map generation in tsdown, or strip both maps and references, when aligning Core/Types.

The same reversible map-removal experiment on the transitive Types package reduced it from 183,334 B packed / 1,402,670 B unpacked to 95,143 B / 912,718 B. That is 88,191 B (48.1%) less registry transfer and 489,952 B (34.9%) less unpacked package data, without changing executable or declaration files.

### Declared dependency usage

- React's runtime sources directly use Nano ID, clsx, tailwind-merge, CVA, Floating UI, and Facehash. Tiny Markdown appears in public type declarations, so it still needs to be resolvable by TypeScript consumers even though the observed imports are type-only.
- React declares and externalizes `ulid`, but no React source imports it. Core is already a mandatory React dependency and legitimately imports `ulid`, so removing React's redundant direct declaration is manifest hygiene rather than an installed-size win for current consumers.
- Core's Zod and Hono/OpenAPI references are declaration-induced compatibility dependencies from `@cossistant/types`, not Core runtime imports. This supports a future dependency-graph split but not claims of hidden server code in the browser bundle—the source-map scan already proved none is emitted.

### Implementation inspection

- React and Next tsdown configs already set `sourcemap: false`; their build scripts retain redundant map-deletion commands. Core and Types still set `sourcemap: true`, so the release implementation can disable map generation consistently at the source rather than deleting artifacts afterward.
- The first real build proved the top-level tsdown flag is not sufficient in this workspace: the shared TypeScript base config enables `declarationMap`, and React still emitted 244 map files plus mapping comments. Each audited package must explicitly disable `sourceMap` and `declarationMap` in its package tsconfig before deletion commands can safely stay removed.
- The current built-in sound hooks statically import both base64 data URLs, so sharing only the AudioContext would not reduce initial JavaScript. The implementation must also change built-in sound sources to dynamic import loaders.
- `useSoundEffect` currently fetches/decodes on every mounted hook instance and creates one AudioContext per instance. A shared module cache plus first-play loading can preserve the public play/stop shape while removing eager initialization and duplicate decoding.
- The official deferred entry should expose a cacheable `loadSupport`/`preloadSupport` primitive as well as a React lazy component. This follows the selected performance rules without forcing an automatic network request before consumers choose to render or preload the UI.
- The lazy component intentionally exposes only the complete component, not compound statics such as `Support.Trigger`; registry/custom compositions keep the eager focused Support entry. Default quickstarts can use `LazySupport` inside Suspense.
- React package tests use Bun plus happy-dom and React `act`, so the audio regression can directly prove no fetch/context occurs on mount, first play initializes once, and two hook instances share the same decoded buffer/context.
- The validated no-preflight CSS input is exactly Tailwind's `theme.css` and `utilities.css` layers followed by Cossistant support CSS. Package source should use package-relative Tailwind imports rather than the audit's absolute resolved paths.
- React's CSS build currently invokes an undeclared `@tailwindcss/cli` through `bunx`, which resolved 4.3.3 during implementation even though the manifest starts at 4.1.13. The lockfile did not drift, but release CSS generation should use a declared/pinned CLI to stay deterministic.
- After package-level TypeScript overrides, React emits zero maps and zero mapping references. Its raw generated output dropped from 599 files / 2.18 MB in the failed configuration to 312 files / 793.85 KB before publish cleanup.
- The built sound hooks contain a real dynamic import of `sounds/sound-data.js`; the 23,996-byte encoded module is no longer statically imported by the hook entry. The built `lazy-support.js` is 250 bytes and dynamically imports `support/index.js`.
- The pinned CLI is available as the local `tailwindcss` binary. The release script now uses `bunx --no-install tailwindcss`, preventing cache/latest resolution and failing clearly if the declared tool is missing.
- Package metadata is generated directly from each source `exports` map, so adding `./lazy-support` to React/Next manifests plus matching tsdown entries is sufficient to publish correct `.js` and `.d.ts` conditions.
- React's `SupportProps` and `SupportHandle` are already public from the focused Support entry, allowing the lazy entry to remain type-only coupled to Support and avoid a static runtime edge.

### Real Vite integration baseline

- The repository's React/Vite integration imports named exports from the React root entry and renders the full Support widget, Provider, SupportConfig, visitor identification, and navigation hook.
- A production Vite 8.0.14 build transformed 249 modules and emitted one 546.95 KB minified JS chunk (171.91 KB gzip) plus 66.53 KB CSS (11.15 KB gzip). Vite emitted its standard warning because the JS chunk exceeds 500 KB minified.
- This is an application total including React/React DOM and example code, not solely Cossistant. The controlled root/subpath variant below establishes that import spelling does not materially change this Vite graph.
- The example imports the full generated `@cossistant/react/styles.css`; its 66.53 KB output is nearly all SDK CSS because the example's own CSS is small. CSS is therefore a meaningful optimization target alongside JavaScript.
- Changing the same Vite app to existing granular React subpaths reduced transformed modules from 249 to 237, but exact output was effectively unchanged: root 546,954 B raw / 170,271 B gzip versus subpaths 546,976 B / 169,331 B. The sourcemaps contained the same source set, so the 940-byte gzip difference is output ordering/compression rather than meaningful code removal.
- The contrast with Next is important: Vite's single application graph tree-shakes the root barrel reasonably well, while Next's per-route client chunking makes subpaths critical for route isolation.
- The granular Vite variant passed all four Playwright tests. Subpaths are safe and consistent, but should not be sold as a major Vite bundle optimization.

### Real Next integration baseline

- The repository's Next 16.2.3/Turbopack production integration builds successfully across five static routes.
- Its generated client chunk directory contains 1,357,164 raw JavaScript bytes across 15 shared/route chunks. The two largest chunks are each 295,843 bytes; three other chunks are 227,528, 145,943, and 112,594 bytes.
- Cossistant identifiers occur in five client chunks. Aggregate directory size is not a per-route transfer metric because chunks are shared and route-specific; route manifests must be mapped before drawing a consumer-cost conclusion.
- The Next wrapper itself remains only a few kilobytes and its Bun consumer outputs match React. Any large Next route cost is expected to be the shared React/Core Support graph rather than wrapper implementation.
- Route-manifest measurement (unique entry files, gzip summed per served file) gives: `/` 488,563 B raw / 147,387 B gzip, `/custom-page` 435,870 B / 134,065 B, and `/dashboard` plus `/pricing` 482,735 B / 144,885 B. Every route also receives one 69,531 B raw / 11,537 B gzip stylesheet.
- Next's special `/_not-found` client baseline is 139,105 B raw / 37,906 B gzip. Relative to it, the example's routes add roughly 96.2–109.5 KB gzip JavaScript, consistent with the independent 96.3 KB gzip Support measurement plus provider/example code.
- These totals include the Next client runtime and React, so they are not solely Cossistant. However, placing `SupportProvider` in the root layout makes the SDK part of the shared client graph; a no-SDK or provider-only route baseline is needed to quantify that architectural cost.
- The two equal-sized 295,843-byte chunks are not byte-identical; no exact duplicate client chunks were found by SHA-256.
- Dashboard and pricing do not render the full Support component, yet their route totals remain close to the full Support route. Their imports come from the Next root barrel. This is evidence that Turbopack may retain substantially more of the root client barrel than Bun does, so a minimal root-versus-subpath Next experiment is now high priority.
- A minimal Next app that only renders `SupportProvider` from the Next root entry builds to 128,948 B raw / 33,797 B gzip client JS with no CSS. This is far below the full example routes, showing that one isolated named import can tree-shake correctly; the later multi-route experiment identifies cross-route barrel sharing as the specific failure mode.
- The same minimal app using `@cossistant/next/provider` is byte-for-byte identical to the root import: 128,948 B raw / 33,797 B gzip. A no-Cossistant client baseline is 58,086 B / 14,009 B, so SupportProvider adds 70,862 B raw / 19,788 B gzip in this Next setup.
- This disproves a simple “Turbopack cannot tree-shake the root barrel” explanation. A more specific risk remains: when several routes import different exports from the same root client module and one route imports full Support, shared chunking can promote the union to routes that only need Provider/Config/Identify. A full-example subpath experiment will test that cross-route effect.

### Next cross-route subpath experiment

The full Next integration was copied unchanged except for replacing root imports with existing public subpaths:

- `SupportProvider` → `@cossistant/next/provider`
- `Support` and `useSupportNavigation` → `@cossistant/next/support`
- `IdentifySupportVisitor` → `@cossistant/next/identify-visitor`
- `SupportConfig` → `@cossistant/next/support-config`

| Route | Root imports gzip | Subpaths gzip | Reduction | Raw reduction |
|---|---:|---:|---:|---:|
| `/` | 147,387 B | 128,065 B | 19,322 B (13.1%) | 71,128 B |
| `/custom-page` | 134,065 B | 125,843 B | 8,222 B (6.1%) | 24,661 B |
| `/dashboard` | 144,885 B | 38,615 B | 106,270 B (73.4%) | 342,882 B |
| `/pricing` | 144,885 B | 37,779 B | 107,106 B (73.9%) | 345,013 B |

- The subpath variant passed all four Next Playwright tests. This is a behavior-verified optimization using APIs that already exist.
- The repository's own Next example, runtime integration guide, registry templates, quickstart/concept docs, blog tutorial, and production web app still contain root `@cossistant/next` imports. The optimization should start with these first-party sources so newly generated and copied integrations no longer reproduce the measured route penalty.
- Implementation inventory confirms 35 first-party root Next imports across the example, production web app, registry templates, integration snippets, docs/blog content, release template, and historical changelog. Focused mappings exist for every runtime symbol; mixed imports must be split across provider/support/config/identify/hooks subpaths.
- The production Next app also directly imports React's root client barrel in many component modules. Those runtime imports should use React subpaths as well, even though the Vite experiment showed no material single-graph savings, because the same Next cross-route sharing risk applies inside the App Router application.
- The minimal single-import app showed root and subpath Provider are identical, while the multi-route app showed enormous route isolation gains. The cause is cross-route sharing of one broad `"use client"` root barrel: when some routes need full Support, Turbopack's shared root-module graph can make unrelated routes pay for that union.
- Highest-priority Next action: update examples, docs, and codemods/templates to use granular subpaths in App Router code. Consider discouraging or linting root imports in Next applications. A future major version could narrow the Next root entry, but existing users can get the savings today without a package release.
- The full Support routes still save 8–19 KB gzip from better chunk isolation, while Provider/Config/Identify-only routes fall almost to the framework baseline.
- Adding Next 16.2.3's `experimental.optimizePackageImports: ["@cossistant/next"]` while retaining the root imports produced the exact original route sizes byte-for-byte (`/` 488,563 B raw / 147,386 B gzip; dashboard/pricing 482,735 B / 144,884 B). The option does not transform or isolate this package's current root client barrel under Turbopack, so it is not a substitute for explicit subpaths.
- Removing only the root entry's `"use client"` directive (all leaf entries retained their own directives) compiled successfully but did not isolate routes: `/` remained 146,633 B gzip and dashboard/pricing remained 144,131 B. The subpath variant's dashboard/pricing were 38,615 B / 37,779 B, so this directive-only change is rejected.
- The real Vite source map confirms the full Support path includes inline sound data, Facehash, Floating UI, tailwind-merge, Tiny Markdown, and the relevant Core stores/client. These are concrete candidates for isolated upper-bound experiments.
- Inline sound data is especially promising: `packages/react/dist/sounds/sound-data.js` is 24,035 bytes raw and about 10.7 KB gzip in the package build, and default Support imports both new-message and typing sound hooks synchronously.
- Facehash is synchronously imported by the default support avatar, Floating UI by support content positioning/focus management, and tailwind-merge by the ubiquitous class-name utility. Any change to these must preserve visual or interaction behavior; stubbing them is useful only to measure an upper bound before proposing a design.
- Floating UI is used for desktop collision-aware fixed positioning; there is already a static CSS fallback when collision avoidance is unavailable. This creates a plausible opt-in/static-mode or deferred-positioning design, but outright removal would change default behavior.
- Facehash renders the default fallback avatar when no image is available. Replacing it with initials would save bytes but visibly change the product; lazy loading or an explicit lightweight-avatar mode is the safer class of opportunity.
- React exposes two CSS strategies: the precompiled `styles.css` is 65,302 bytes, while the source Tailwind integration is `support.css` (33-byte import wrapper) plus 12,298 bytes of tokens/base rules and 4,088 bytes of animations. The precompiled stylesheet starts from the full `@import "tailwindcss"`, so Tailwind theme/preflight overhead should be measured separately from actual Cossistant rules.

### CSS composition experiment

The same React source scan was compiled with four Tailwind import strategies:

| CSS input | Raw | Gzip | Gzip reduction vs current |
|---|---:|---:|---:|
| Current full Tailwind + Cossistant | 65,302 B | 10,666 B | — |
| Tailwind theme + utilities, no preflight | 61,644 B | 9,668 B | 998 B |
| Tailwind utilities only + Cossistant | 43,184 B | 6,452 B | 4,214 B |
| Cossistant rules only | 16,468 B | 2,238 B | 8,428 B |

- Removing preflight is a modest, plausible improvement and may also reduce global CSS interference, but it must pass the real widget layout tests.
- The no-preflight variant passed all four React/Vite Playwright integration tests, including fixed trigger positioning, desktop bounds, mobile fullscreen behavior, and custom-page rendering. This validates the 998-byte gzip saving against the current behavioral suite.
- Utilities-only has a more useful 4.2 KB gzip saving but failed two of four Playwright tests: the trigger lost fixed bottom-right positioning and mobile content computed as `position: static`. It is not safe in its current form and should not be recommended without additional Tailwind theme/source work.
- Cossistant-only is a lower bound, not a viable current stylesheet: the widget relies on generated Tailwind utilities.

## Recommendations

### Implemented release evidence

- The new `lazy-support` entry caches both explicit preload and React lazy loading behind one dynamic module request; its focused regression test passes.
- Built-in sound data now stays behind a dynamic import and the audio hook creates no `AudioContext`, fetch, or decode work on mount. Two concurrent consumers share one load/fetch/decode while retaining independent playback sources; the happy-dom regression test passes.
- The pinned Tailwind 4.2.2 no-preflight build produces 62,220 B raw / 9,701 B gzip. The small difference from the 4.3.3 experiment is compiler-version output; both remain below the former full-preflight baseline.
- Final package builds contain no map files or stale map references. Core's tarball is now 73,066 B (down 101,349 B / 58.1%) and Types is 94,962 B (down 88,372 B / 48.2%). React stays effectively flat at 149,194 B because it already deleted maps after building and the new entry/tests are excluded from publication; Next is 3,750 B packed, an 874 B increase for the Next-aware lazy entry and export/type metadata.
- The single-file browser IIFE cannot defer the sound-data chunk, so the shared lazy-audio lifecycle adds a net 359 B gzip there after code-size cleanup. Its final 126,958 B gzip output remains 13,042 B below the absolute release ceiling. The baseline is intentionally refreshed for this runtime improvement while the absolute cap remains unchanged.
- The real React/Vite build confirms the audio split: initial application JS drops 11.56 KB gzip (171.91 → 160.35 KB), and the 10.65 KB sound chunk is requested only when playback is first needed. The no-preflight stylesheet drops another 0.93 KB gzip (11.15 → 10.22 KB).
- The real Next build confirms both route isolation and the lazy boundary. The default route entry falls to 40.97 KB gzip and loads a 75.47 KB Support chunk; its 10.75 KB sound chunk remains deferred until playback. Provider/config-only dashboard and pricing routes remain near the framework baseline at 38.62/37.78 KB, versus roughly 145 KB before focused imports.
- Next requires a framework-aware lazy wrapper: a raw cross-package `React.lazy` target became a nested client reference, while a generic Suspense resource could expose server-rendered controls before hydration. The final `next/dynamic({ ssr: false })` wrapper shares the same cached module loader and passes all four Next interaction tests; the generic React resource passes all four Vite tests.

| Priority | Change | Verified impact | Effort / risk |
|---|---|---|---|
| P0 | Make granular `@cossistant/next/*` imports the first-party/default App Router pattern; update examples, registry templates, guides, docs, and app code; add a lint/import guard against the root and namespace imports where route isolation matters. | 8.2–107.1 KB gzip less JS per measured route; dashboard/pricing improved 73–74%; 4/4 Playwright tests passed. Prevents namespace cases that measured 29–104 KB gzip above focused imports. | Low; existing non-breaking exports. |
| P0 | Stop publishing Core and Types source/declaration maps by disabling them for release builds (and avoid stale `sourceMappingURL` comments). | Core tarball -101,277 B (58.1%); Types -88,191 B (48.1%); combined unpacked payload -898,121 B. No browser-runtime change. | Low, assuming registry-hosted maps are not a support requirement. |
| P1 | Add an official lazy/deferred Support integration, keeping Provider eager and prefetching Support on intent. | Initial SDK JS 114,655 B → 23,083 B gzip (-91,572 B, 79.9%); only +1,651 B total if Support later loads. | Medium; needs loading UI, SSR/hydration, prefetch, and interaction tests. |
| P1 | Replace per-hook eager inline sound initialization with one shared lazy audio service/cache. | Up to 11,707 B gzip leaves the initial JS; also avoids multiple eager AudioContexts and repeated decode work. | Medium; first-play latency and asset URL/CDN behavior need testing. |
| P1 | Split browser-safe structural/DTO types from server Zod/OpenAPI schemas, preserving server schema exports. | Roughly 9.7 MB of schema-stack installed files can disappear for browser-only consumers; current browser bundle impact is already zero. | Medium/high; public declarations cross many API types. |
| P2 | Build the precompiled CSS without Tailwind preflight. | 998 B gzip CSS reduction; 4/4 widget layout Playwright tests passed; may also reduce global CSS interference. | Low/medium; broaden visual regression coverage first. |
| P2 | Explore deferred/optional Floating UI and Facehash paths. | Upper bounds: 8,147 B and 5,834 B gzip respectively. | Medium/high; positioning and fallback-avatar behavior must remain stable. |
| Cleanup | Remove React's redundant direct `ulid` dependency declaration. | No present installed-size saving because mandatory Core already depends on it. | Very low; manifest hygiene only. |

### Do not prioritize

- Rewriting React/Vite named root imports solely for bytes: the controlled output had the same source set and only compression-order noise.
- Next `experimental.optimizePackageImports`: exact original route sizes under Next 16.2.3/Turbopack.
- Removing only the Next root client directive: less than 1 KB gzip saved and route contamination remained.
- Utilities-only CSS: saved 4.2 KB gzip but failed trigger-positioning and mobile-fullscreen tests.
- Replacing tailwind-merge with `clsx`: the 8.2 KB upper bound is real, but class-conflict/override behavior would regress without a proven replacement.
- Replacing Tiny Markdown: only 1.6 KB gzip upper bound.
- Core minification as the first package fix: only 7.3% tarball savings with maps retained, versus 58.1% from map removal alone.

## Issues Encountered

| Issue | Resolution |
|---|---|
| Planning skill session catch-up surfaced stale prior-session context | Verified repository state directly before beginning the audit. |
| `npm pack --dry-run` failed on the user npm cache due to root-owned cache files | Will use Bun packing or an isolated cache rather than modifying the user's global npm cache. |
| Tailwind experiment inputs under `/private/tmp` could not resolve package imports | Resolve Tailwind's installed CSS files explicitly for the next variant rather than retrying package-name imports from the temp directory. |

## Resources

- Repository: `/Users/anthonyriera/code/cossistant-monorepo`
- Audit evidence: `/Users/anthonyriera/code/cossistant-monorepo/audit/react-next-size-2026-08-03`
