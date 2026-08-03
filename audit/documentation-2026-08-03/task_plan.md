# Cossistant Documentation Accuracy Audit

## Goal

Produce a complete, evidence-backed, page-by-page audit of `apps/web/content/` against the current product and code, applying every rule in `apps/web/content/DOCUMENTATION.MD`, without editing documentation pages.

## Current Phase

Phase 6 — implement and validate release documentation improvements

## Phases

### Phase 1: Scope and coverage inventory

- [x] Inventory every content file and classify documentation, reference, editorial, and historical content.
- [x] Extract the mandatory review rubric from `DOCUMENTATION.MD`.
- [x] Establish a coverage ledger proving every in-scope page was reviewed.
- **Status:** complete

### Phase 2: Authoritative product/code map

- [x] Map documented packages, exports, components, configuration, endpoints, SDK behavior, and product capabilities to authoritative sources.
- [x] Record current package versions, public entry points, examples, and known product limitations.
- [x] Define evidence standards for verified, contradicted, incomplete, and unverified claims.
- **Status:** complete

### Phase 3: Page-by-page accuracy audit

- [x] Review every in-scope page against current code and product evidence.
- [x] Validate code examples, imports, configuration names, API shapes, links, and described behavior.
- [x] Record per-page findings with severity, evidence, and recommended remediation.
- **Status:** complete

### Phase 4: AAA human/AI quality audit

- [x] Apply readability, helpfulness, cross-reference, metadata, accessibility, stable-anchor, raw-markdown, `llms.txt`, and multi-format criteria.
- [x] Identify missing learning paths, migration/workaround guidance, and discoverability gaps.
- [x] Separate page-local problems from systemic documentation-platform gaps.
- **Status:** complete

### Phase 5: Completeness verification and report

- [x] Reconcile the coverage ledger with the filesystem inventory so no page is omitted.
- [x] Re-check high-severity claims against current authoritative files.
- [x] Produce a prioritized execution report with page-level fixes, cross-cutting workstreams, sequencing, and acceptance criteria.
- [x] Confirm no documentation content was edited before the report was complete.
- **Status:** complete

### Phase 6: Implement release documentation improvements

- [x] Apply every confirmed high- and medium-severity documentation correction.
- [x] Apply low-severity consistency and learning-path improvements where they are release-safe.
- [x] Add regression checks for broken code examples and high-risk claims where practical.
- [x] Run documentation, formatting, type, build, link, and relevant integration validation.
- [x] Produce a release-ready change summary and confirm only intentional files remain.
- **Status:** complete

## Review Rubric

Each page will be evaluated for:

1. Factual accuracy against current code and offered product behavior.
2. Completeness for the page's stated user goal.
3. Copy-paste correctness of examples and commands.
4. Readability, concision, progressive disclosure, terminology, and heading structure.
5. Human navigation: prerequisites, next steps, cross-links, workarounds, migrations, and feedback.
6. AI consumption: code-first instructions, stable anchors, raw Markdown, `llms.txt`, explicit inputs/outputs, and low ambiguity.
7. Metadata/accessibility: title/description, canonical/OG support, image alt text, semantic hierarchy, skip navigation, reduced motion, and touch targets where applicable.
8. Multi-format discoverability: package JSDoc/readmes, package output, MCP, and `AGENTS.md` guidance where relevant.

## Finding Severity

| Severity | Meaning |
|---|---|
| Critical | Causes unsafe behavior, data/security risk, or makes the documented primary flow unusable. |
| High | Materially incorrect API/product claim or copy-paste example that fails. |
| Medium | Important omission, misleading guidance, broken path/link, or substantial comprehension issue. |
| Low | Polish, consistency, discoverability, or minor clarity issue. |
| Pass | Verified accurate and meets the applicable rubric. |

## Evidence Standard

- **Verified:** Directly supported by current source, generated contracts, package exports, tests, or live repository configuration.
- **Contradicted:** Current authoritative evidence disagrees with the page.
- **Incomplete:** Accurate as written but missing information necessary for the stated task.
- **Unverified:** No sufficiently authoritative local evidence; report explicitly rather than infer.
- Historical changelog claims will be judged in their release-time context and for present-day labeling/link integrity, not rewritten as current API guidance.

## Key Questions

1. Which files are current developer documentation versus historical/editorial content, and how will every content file be accounted for?
2. Does every documented import, prop, option, command, route, endpoint, and product capability exist today?
3. Can a new user complete each documented task by copying the examples as written?
4. Where does the documentation fail the playbook's human and AI requirements?
5. What remediation sequence produces AAA documentation with the least duplication and drift risk?

## Decisions Made

| Decision | Rationale |
|---|---|
| Keep the audit under `audit/documentation-2026-08-03/` | Preserves evidence without modifying the documentation being reviewed. |
| Do not edit files under `apps/web/content/` | The user explicitly requested a report before execution. |
| Account for every content file before deciding applicability | Prevents silently narrowing “page by page” scope. |
| Require direct current-state evidence for accuracy claims | Green builds or plausible examples do not prove individual documentation claims. |
| Implement after completing the evidence pass | The user's latest instruction supersedes the earlier report-only constraint; finishing verification first avoids shipping speculative documentation changes. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Session catch-up described an old completed SDK-audit/PR state that conflicts with the current clean `main` worktree | 1 | Treat current git state as authoritative and isolate this documentation audit in a new directory. |
| Reduced-motion search included nonexistent `apps/web/src/styles` | 1 | Use the actual `apps/web/src` and discovered CSS files; do not repeat the invalid path. |
| Registry search included nonexistent `apps/web/registry` | 1 | Use `apps/web/registry.json` and `apps/web/src/registry/`, which are the actual manifest/source locations. |
| Theme-token search put a glob flag after explicit paths | 1 | Preserve the valid direct-file evidence and put `-g` before paths in future `rg` calls. |
| Support-state search included a guessed nonexistent REST route path and singular hook filename | 1 | Use the discovered `apps/api/src/rest/routers/support.ts` and `use-feature-flags.ts` paths; do not repeat guessed paths. |
| Email implementation read guessed a nonexistent `apps/api/src/mail/index.ts` | 1 | Use the provider routers and actual API mount discovered by repository search; do not guess an index barrel. |
| Self-host findings patch used an overlarge multi-file context and did not apply | 1 | Split the notes into smaller patches anchored to exact current sections. |
| Initial implementation searches used unquoted route-group paths and guessed `apps/web/src/env.ts` | 1 | Quoted paths containing parentheses/brackets and used repository-discovered environment files. |
| Initial blog patch did not match the exact current multi-file context | 1 | Split the changes into page-local patches using current anchors. |
| First docs-content validation reported duplicate-route and changelog-heading false positives | 1 | Corrected index-route normalization, duplicate heading suffixes, and collection-specific heading baselines. |
| `bun --cwd apps/web run postinstall` used Bun's options in the wrong order | 1 | Ran `bun run postinstall` from `apps/web`; Fumadocs generation passed. |
| Focused docs tests retained an expectation for the removed “Templates are coming soon” placeholder | 1 | Replaced it with assertions for the concrete build sequence; all 47 focused tests pass. |
| Sandboxed full build blocked Turbopack from binding a temporary local port | 1 | Re-ran the same uncached build with local-process permission; all 15 build tasks passed. |
| React package-output check was invoked from the repository root | 1 | Ran `bun run check:pack` from `packages/react`; 266 files and 563,475 unpacked bytes validated. |
| Public link check returned status 0 without network access | 1 | Re-ran with network access; all three public documentation links passed. |
| Build-artifact restore could not create `.git/index.lock` inside the filesystem sandbox | 1 | Re-ran the scoped `git restore` with repository metadata permission and removed Playwright result directories. |

## Constraints

- Do not edit documentation pages until the evidence pass is complete; then implement the confirmed improvements requested by the user.
- Product-shell and validation changes are limited to confirmed documentation-platform improvements requested for this release.
- The final report must be actionable enough to execute in a later goal.
- No page may be marked passing solely because no obvious issue was found.
