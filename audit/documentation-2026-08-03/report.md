# Cossistant documentation audit — release execution report

Date: 2026-08-03

Scope: every file under `apps/web/content/`

Coverage: 43/43 rendered MDX pages, 11/11 navigation manifests, and `DOCUMENTATION.MD`

## Implementation result

All confirmed release blockers and medium-severity task-completion gaps in this
report were remediated in the same release change. The implementation also adds
a permanent 43-page content gate, CI/publish enforcement, page feedback, skip
navigation, zoom support, reduced-motion handling, and focused regressions.

The final release sweep passed uncached typechecks (20 tasks), lint (19 tasks),
builds (15 tasks), and unit tests (18 tasks). The API suite passed 707 tests, the
web suite passed 698 tests, both framework Playwright suites passed 4/4, React
package output validation passed, OpenAPI drift passed, public documentation
links passed, and the browser widget measured 124.0 KB gzip against its 136.7 KB
hard ceiling. Generated build and test artifacts were removed before commit.

## Executive result

The pre-remediation audit found a strong documentation platform, but content
that was not yet release-safe at an AAA standard. It found no missing routes or
navigation targets, and the site already provided excellent machine-readable
delivery: canonical/OG/JSON-LD metadata, raw Markdown negotiation, `/llms.txt`,
`/llms-full.txt`, copy-source, GitHub, and open-in-AI actions.

The release blockers are content correctness and executable guidance. Confirmed failures include duplicate imports, nonexistent props, a docs-only conversation ID in the public SDK path, a no-op hook example, unsafe account-switch identity patterns, wrong contributor commands and ports, an async CDN loader race, incorrect license names, and claims that do not match runtime behavior for events, email delivery, visitor identity, and dashboard conversation creation.

The findings ledger contains 34 High, 56 Medium, and 19 Low annotations. Some annotations describe the same systemic root cause from both the evidence map and the affected page; implementation should fix the root cause once and add a regression check.

## What already passes

- All 43 rendered content files have valid required frontmatter for their collection.
- All 30 developer-doc pages have title and description metadata.
- All 11 navigation manifests resolve and account for every local page.
- No broken local docs/blog/changelog route was found in the mechanical link pass.
- Package versions and nearly all documented public package subpaths exist.
- `/llms.txt`, `/llms-full.txt`, raw Markdown delivery, canonical URLs, dynamic OG, TechArticle JSON-LD, breadcrumb JSON-LD, page H1, table of contents, and previous/next navigation are implemented.
- API Keys, billing-disable behavior, most support props, locale APIs, support-state semantics, and the four MCP tools are factually sound with smaller completeness gaps.

## Release blockers

| Workstream | Confirmed blocker | Required release fix |
|---|---|---|
| React tutorial | Duplicate `Support`/`SupportConfig` imports; generic env advice is unsafe for CRA/Remix | Make the fence compile; use explicit `publicKey` as the generic path |
| Visitor identity | Three samples skip identification whenever any prior contact exists | Prefer `IdentifySupportVisitor` or compare stable external identity and document account switching |
| Routing | Public example uses docs-only `pending_docs_conversation` | Import and use `PENDING_CONVERSATION_ID` |
| Hooks | History button has no callback and is intentionally a no-op | Provide `onOpenConversationHistory` or remove the action |
| Events | Default widget does not emit the documented automatic lifecycle events; custom sample calls undefined `sendMessage` | Document current manual emitter behavior and use a complete mutation example, or implement runtime emission separately |
| Feedback | Copy-paste form lacks labels/grouping/error announcement | Ship an accessible example |
| Primitives/bundle | Namespace import can retain the whole primitive surface | Teach named focused imports from `/primitives` or leaf entries |
| Facehash | `shape` prop does not exist; CSS-only architecture claim is obsolete | Use current props and describe SVG-first output |
| Contributor setup | Wrong API port, nonexistent DB command, docs link check does not inspect content, empty license section | Correct commands/port/license and add a real content validator |
| Licensing | “Non-commercial AGPL” and “GPL-3.0” contradict the repository AGPL-3.0 license | Use GNU AGPL-3.0 and describe commercial licensing only as an alternative |
| Visitor/privacy claims | Fingerprinting claim is false and collected context is materially understated | Describe website-scoped localStorage identity and the actual technical/acquisition/location fields |
| Product claims | Dashboard-initiated conversations are not currently offered | Remove or clearly scope the claim |
| Email | Provider routers ignore delivered events while docs claim delivery tracking | State that delivered events are accepted but not persisted |
| CDN changelog | Async loader can race `window.Cossistant.init()` | Guarantee loader/stub ordering or preinstall the queue |
| Storage | Recommended Terraform module is permissive/destructive without a production warning | Add explicit hardening and state/credential/teardown guidance |
| Self-hosting | Overview omits the minimum deployable topology | Add prerequisites/topology or accurately rename it as optional infrastructure |
| Third parties | Blanket security assurances are unsupported and processor inventory is incomplete | Replace with dated vendor-specific facts and data-processing detail |

## Page-by-page disposition

| Page | Disposition | Main action |
|---|---|---|
| `docs/(root)/index.mdx` | Improve | Add prerequisites, API-key/success path, framework choice, and browser path |
| `docs/(root)/what.mdx` | Rewrite | Fix grammar; separate hosted/self-hosted and default/custom architecture |
| `docs/quickstart/api-keys.mdx` | Pass with clarification | Say localhost still must be allowlisted |
| `docs/quickstart/index.mdx` | Improve | Link key acquisition; add success/troubleshooting; keep lazy path primary |
| `docs/quickstart/react.mdx` | Blocked | Fix generic bundler environment guidance and add success/troubleshooting |
| `docs/concepts/index.mdx` | Blocked | Correct fingerprinting/privacy claims and identity example |
| `docs/concepts/contacts.mdx` | Blocked | Correct metadata deduplication and identity example; explain merge/null semantics |
| `docs/concepts/conversations.mdx` | Blocked | Remove dashboard-create claim; add actionable API/type references |
| `docs/concepts/timeline-items.mdx` | Improve | Complete part inventory, soften audit-trail absolute, fix H2→H4 hierarchy |
| `docs/support-component/index.mdx` | Improve | Link lazy path and add production checklist |
| `docs/support-component/customization.mdx` | Improve | Declare Tailwind assumption and custom-component accessibility duties |
| `docs/support-component/theme.mdx` | Improve | Label token table as starter set; document light and fallback expectations |
| `docs/support-component/routing.mdx` | Blocked | Use the exported pending ID constant; label styling assumption |
| `docs/support-component/support-state.mdx` | Improve | Label browser/public-key context; remove DB storage details from SDK contract |
| `docs/support-component/text.mdx` | Improve | Add key-catalog/coverage/RTL workflow |
| `docs/support-component/hooks.mdx` | Blocked | Fix identity, no-op history, typing-client, placeholders, and scope claim |
| `docs/support-component/events.mdx` | Blocked | Match manual runtime behavior and make the send example executable |
| `docs/support-component/types.mdx` | Improve | Label as curated or generate a full export index |
| `docs/user-feedback/index.mdx` | Blocked | Make the form accessible; add privacy and success/troubleshooting |
| `docs/advanced/index.mdx` | Improve | Replace “coming soon” with a concrete build sequence |
| `docs/advanced/primitives.mdx` | Blocked | Use focused imports and state headless accessibility responsibilities |
| `docs/self-host/index.mdx` | Blocked | Add core topology/prerequisites before optional services |
| `docs/self-host/billing.mdx` | Pass with warning | Explain global entitlement impact and migration risk |
| `docs/self-host/storage.mdx` | Blocked | Add production hardening and Terraform operational safety |
| `docs/self-host/email-setup.mdx` | Blocked | Correct delivery-event claim; add secret/verification guidance |
| `docs/self-host/analytics.mdx` | Blocked | Document repository Tinybird resources, flag matrix, and privacy default |
| `docs/others/contributors.mdx` | Blocked | Fix setup, validation, release checks, and license section |
| `docs/others/mcp.mdx` | Improve | Add tool inputs/outputs, scope, limits, errors, and auth troubleshooting |
| `docs/others/mentions.mdx` | Blocked | Correct license and remove unsupported hosting absolutes |
| `docs/others/third-party-services.mdx` | Blocked | Replace marketing assurance with dated processor disclosure |
| `blog/how-to-add-a-support-widget-to-a-nextjs-app.mdx` | Improve | Use lazy widget path and add key/success/troubleshooting |
| `blog/how-to-add-a-support-widget-to-a-react-app.mdx` | Blocked | Fix duplicate imports, env advice, lazy path, and CSS portability |
| `blog/facehash-avatar-library-for-react.mdx` | Blocked | Remove nonexistent prop; correct architecture/default/dependency claims |
| `blog/introducing-cossistant.mdx` | Improve | Separate roadmap from shipped features; edit grammar; add quickstart CTA |
| `changelog/2025-12-23-v0.0.28.mdx` | Blocked | Fix callback wording/import and remove nonexistent `onEvent` prop |
| `changelog/2026-01-16-v0.0.29.mdx` | Pass | No release edit required |
| `changelog/2026-01-31-v0.0.30.mdx` | Pass | No release edit required |
| `changelog/2026-02-10-v0.0.33.mdx` | Pass | No release edit required |
| `changelog/2026-02-13-v0.1.0.mdx` | Pass | No release edit required |
| `changelog/2026-02-15-v0.1.1.mdx` | Clarify | Qualify historical bundle figures |
| `changelog/2026-02-19.mdx` | Clarify | Label as a product update rather than an unlabeled package release |
| `changelog/2026-03-11-v0.1.2.mdx` | Pass | No release edit required |
| `changelog/2026-04-20-v0.2.0.mdx` | Blocked | Fix loader ordering and framework-specific upgrade command |

## Cross-cutting AAA gaps

- No “Was this helpful?” mechanism on docs pages.
- No skip-navigation link/target in the lander/docs shell.
- Reduced-motion handling is component-specific rather than a reliable docs-shell baseline.
- Image alt text is not schema-enforced.
- Literal MDX code fences are not compiled or contract-checked.
- Quickstarts do not consistently include prerequisites, observable success, common errors, and next steps.
- Tailwind assumptions are not consistently declared on a package that also supports precompiled CSS.
- Curated reference pages use canonical language without complete generated coverage.

## Implementation sequence and acceptance criteria

1. Correct all High findings that affect executable examples, security/privacy/legal accuracy, or current product behavior.
2. Correct Medium findings that are necessary to finish the page's stated task; defer only large new product documentation that cannot be verified for this release, and label the current boundary honestly.
3. Add `check:docs-content` and run it in CI and before Changesets publishes. It must fail on missing navigation pages, unresolved internal routes/anchors, invalid heading hierarchy outside fences, missing required metadata/alt text, and known high-risk snippet regressions.
4. Add skip navigation and page feedback with accessible names and keyboard focus behavior.
5. Build the Fumadocs source, typecheck the web app, run focused docs/platform tests, build the web app, and run the repository release sweep.
6. Confirm no generated content/build artifacts remain and only intentional source/config/audit files are changed.

Detailed evidence for every statement is in `findings.md`; execution progress and command failures are in `progress.md`.
