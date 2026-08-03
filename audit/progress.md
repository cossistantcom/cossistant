# Progress Log

## Session 1 (2026-07-02)

### Phase 1: Setup + baseline
- Scouted package structures:
  - react: 210 TS/TSX files; deps: @cossistant/{core,types,tiny-markdown}, facehash, @floating-ui/react, cva, clsx, nanoid, tailwind-merge, ulid
  - next: 7 files, re-export wrapper over @cossistant/react
  - browser: embed loader + widget runtime (IIFE); react/react-dom as hard deps, preact in devDeps
- Noted: react package.json has ~40 subpath exports pointing at `./src/*` with publishConfig.directory=dist (prepare-package rewrites presumably)
- Planning files created in audit/

### Baseline (Phase 1 complete)
- Tests: react 236/236 pass, browser 11/11 pass (bun test). NOTE: React `act()` warnings from WebSocketProvider tests — async setState path to inspect.
- Typecheck: clean (react, next, browser)
- Footprint:
  - react dist: 1.2M total, ~295KB JS (minified, unbundled), styles.css 65KB, support.css 33B
  - browser embed: loader.js 1,170B (646B gzip) GOOD; widget.js 679,452B (191KB gzip) — BIGGEST FOOTPRINT PROBLEM (React+ReactDOM bundled; preact sits unused in devDeps); widget.css 16KB (2.3KB gzip)
- Smells seeded into audit: nanoid AND ulid both deps; clsx+tailwind-merge+cva in headless lib; `"@types/react": ""` peer; next `./styles.css`→src while react's →dist; browser has react as hard dependency

### Phase 2: Audit workflow launched
- Workflow run ID: wf_a1c58277-45e (12 dimensions → adversarial verify per medium+ finding)
- Script: cossistant-sdk-audit-wf_a1c58277-45e.js (session workflows dir)

### Phase 2-4 complete: audit results
- 98 agents, ~4.7M tokens, 37min. 57 confirmed / 28 uncertain (verifier rate-limited) / 29 low / 0 refuted
- findings.md generated with C-/U-/L- IDs
- Hand-verified the new uncertain highs: CDN snippet TypeError (critical, confirmed), queue replay abort (confirmed), zod+zod-openapi bundling via packages/types/src/api/support.ts runtime helpers (confirmed — 53 zod error strings in widget.js), pre-init updateConfig open dropped (confirmed), browser react ^19 hard dep (confirmed)
- Deferred without fix: U-12 clock skew (needs API verification), U-18 sound CDN assets, preact aliasing

### Phase 5: Fix wave launched
- Workflow run ID: wf_5068fb44-2c9 — 11 parallel groups (A provider, B queries, C composer, D realtime, E feedback, F primitives, G browser, H packaging, I next, J support-ui, K docs)
- Ownership map in task_plan.md; agents run their own targeted tests
- Phase 6 (my integration verify): full bun test ×3 packages, check-types ×3, biome, browser embed rebuild + size re-measure vs baseline (widget.js 679,452B / 191KB gzip)

### Phase 5-6 complete (fix wave + integration verify)
- Fix wave: 11/11 groups, 83 findings fixed, ~1.7M tokens, 32min
- Inline completions by main agent: C-56 (@floating-ui/react → @floating-ui/react-dom in both content.tsx files + package.json + tsdown external + lockfile), U-09 remainder (3 CossistantClient doc snippets), browser pub:* scripts (./dist)
- Skips resolved: C-56 done properly; "README preact claim false" finding was itself wrong — preact aliasing IS wired (tsdown.embed.config.ts:84-87); stale Jun 9 dist explained the React-flavored 679KB baseline
- Final: react 301/301, core 137, types 32, next 3, browser 18; tsc+biome clean everywhere
- widget.js 191KB → 128.6KB gzip (−33%)
- Follow-ups documented in task_plan.md
