# SDK Audit: @cossistant/react + next + browser

## Goal
Make the Cossistant SDK "the shadcn of customer support":
1. **Zero bugs** — provider lifecycle, realtime, hooks, primitives, feedback, embed.
2. **Tiny footprint** — bundle size, dependency weight, tree-shaking, CSS.
3. **Perfect DX** — exports map, naming, TypeScript ergonomics, docs accuracy, install story across react / next / browser (`<script>` chat-sdk).

## Scope
- `packages/react` (210 src files) — main headless SDK
- `packages/next` — Next.js wrapper (re-exports)
- `packages/browser` — CDN embed (loader + widget IIFE)
- Cross-cutting: build configs (tsdown), package.json exports, publish pipeline

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Setup + baseline (tests, typecheck, build, bundle size) | complete |
| 2 | Multi-agent audit fan-out (12 dimensions, structured findings) | complete |
| 3 | Adversarial verification of findings | complete (28 verifier agents hit rate limit; key ones hand-verified) |
| 4 | Synthesis → findings.md + prioritized fix plan | complete |
| 5 | Fix confirmed issues (bugs first, then footprint, then DX) | complete — 85 findings fixed (83 by fix wave + C-56 and U-09 remainder inline) |
| 6 | Verify: tests + typecheck + build + size re-measure | complete — all green |

## Final results (Phase 6)
- Tests: react 301/301 (was 236; +65 regression tests), core 137/137, types 32/32, next 3/3, browser 18/18
- Typecheck: clean ×5 packages. Biome: clean (react 233 files, next 46, browser 18)
- widget.js: 679,452B/191KB gzip → 407,656B/128.6KB gzip (−33% gzip; zod+zod-openapi excised, fresh preact build)
- @floating-ui/react (~169KB ESM + aria-hidden/tabbable) replaced by @floating-ui/react-dom (positioning only) — both usage sites swapped, dep + tsdown external updated, lockfile updated
- pub:release/pub:beta/pub:next publish ./dist in all three packages (npm ignores publishConfig.directory)
- 3 doc CossistantClient snippets fixed inline (hooks.mdx, user-feedback/index.mdx ×2)

## Follow-ups (not blocking)
1. U-12: conversation creation vs >5min clock skew — verify against apps/api behavior before changing core
2. U-18: ship sounds as CDN assets instead of 24KB inline base64 (architectural)
3. Core-side cleanups flagged by fix agents: support-store rehydrate() API (provider currently mirrors the frozen storage key/shape); core updateOptions treats defined defaultOpen as an isOpen setter; Support.Root has its own defaultOpen effect
4. Defensive NaN-timestamp guard in support/components/timeline-message-item.tsx
5. 29 low-severity polish findings — audit/findings.md L-01..L-29
6. Further widget.js size work if desired (128KB gzip now; icons/tiny-markdown/code-splitting candidates)

## Audit results (Phase 2-4)
- 57 confirmed (1 critical, 17 high, 37 medium, 2 low), 28 uncertain (verifier rate-limited), 29 low unverified, 0 refuted
- Full details: audit/findings.md (IDs C-01..C-57, U-01..U-28, L-01..L-29)
- Hand-verified uncertain items: U-01/U-08 CDN snippet TypeError (CONFIRMED critical), U-03 queue replay abort (CONFIRMED), U-05/U-07 zod+@hono/zod-openapi bundled via runtime helpers in packages/types/src/api/support.ts (CONFIRMED — 53 zod error strings in widget.js), U-16 pre-init updateConfig({open}) dropped (CONFIRMED), U-04 react ^19 hard dep in browser (CONFIRMED by package.json inspection)

## Fix wave (Phase 5) — 11 parallel agents, non-overlapping file ownership
| Group | Files owned | Finding IDs |
|---|---|---|
| A provider | react/src/provider.tsx, identify-visitor.tsx, controller-context.tsx | C-01, C-12, C-17, C-41..C-46, U-11 |
| B queries | react/src/hooks/private/*, use-conversation-timeline-items, use-conversation-lifecycle, use-conversation-page | C-07, C-08, C-09, C-28, U-13, U-25, U-27, U-28 |
| C composer | react/src/hooks/use-message-composer.ts | C-06/U-02 |
| D realtime | react/src/realtime/*, core/src/realtime-client.ts, core/src/support-controller.ts, react/src/support/context/websocket.tsx | C-13, C-14, C-15, C-47..C-50, U-14 |
| E feedback | react/src/feedback/**, use-feedback-form.ts, feedback-rating-selector, feedback-comment-input | C-04, C-05, C-22..C-27, C-39, C-56 |
| F primitives | react/src/primitives/* (minus feedback-*), utils/use-render-element, internal/compound-children | C-03(prims), C-10, C-11, C-16, C-18, C-20, C-33..C-38, C-40, U-21, U-24, U-26 |
| G browser | packages/browser/** | U-01, U-03, U-04, U-08, U-15, U-16, U-17 |
| H packaging | types/src/**, core import updates, react package.json+scripts+tsdown | U-05/U-07, C-02/U-06, C-19, U-19, U-20, C-03(hooks) |
| I next | packages/next/** | C-31, C-32 |
| J support-ui | react/src/support/** (minus context/websocket), src/index.ts, use-sound-effect, use-transition-swap, core/src/store/support-store.ts | C-21, C-29, C-30, C-51..C-55, C-57 |
| K docs | react README, apps/web docs | U-09, U-10, U-22, U-23 |

## Deferred (follow-ups, not this wave)
- U-12 clock-skew conversation creation (needs API-side verification)
- U-18 sound assets → CDN files instead of inline base64 (architectural)
- Preact aliasing for widget.js embed (README already claims it; big size win; needs visual QA)
- 29 low findings (polish tier) — see findings.md L-01..L-29

## Audit Dimensions (Phase 2)
1. Public API & exports map (react) — DX, naming, subpath consistency
2. Provider / controller / support-config lifecycle bugs
3. Realtime layer (WS provider, seen/typing/processing stores, event-filter)
4. Hooks correctness (stale closures, leaks, localStorage, effects)
5. Primitives correctness + accessibility
6. Feedback module (full tree)
7. Support default UI (src/support)
8. packages/next port parity (re-export completeness, "use client", CSS, peer deps, SSR)
9. packages/browser embed (loader security, asset URLs, runtime, React-vs-preact)
10. Build/packaging/footprint (tsdown, sideEffects, dep weight, dist output vs exports)
11. SSR-safety sweep (window/document/localStorage guards)
12. Docs/README accuracy vs actual API

## Key Decisions
- Planning files live in `audit/` (root planning files belong to a previous task)
- Fixes: apply confirmed bugs + safe footprint/DX wins; larger refactors documented as follow-ups

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
