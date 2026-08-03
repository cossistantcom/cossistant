# Documentation Audit Findings

## Requirements

- Audit `apps/web/content/` page by page against current code and product capabilities.
- Apply all requirements in `apps/web/content/DOCUMENTATION.MD`.
- Make no documentation changes yet.
- Produce a complete evidence-backed execution report.
- Optimize recommendations for both human and AI readers.

## Playbook Requirements Extracted

- Be concise, skimmable, jargon-light, and friendly to non-native English readers.
- Use copy-paste-ready examples, beginning with the simplest path and revealing complexity progressively.
- Document workarounds, product gaps, migrations, and codemods where applicable.
- Cross-reference related material and provide explicit learning paths and page feedback.
- Prefer code and cURL over click-only UI instructions; structure tasks so AI assistants can execute them.
- Expose raw Markdown, stable heading anchors, and an `llms.txt` directory file.
- Provide proper metadata, OG/canonical behavior, alt text, semantic headings, skip navigation, reduced motion, and mobile tap targets.
- Distribute guidance through JSDoc, package output, MCP, and `AGENTS.md` where relevant.

## Scope Inventory

- 55 files exist under `apps/web/content/`.
- 43 rendered MDX pages: 30 under `docs/`, 4 under `blog/`, and 9 under `changelog/`.
- 11 navigation metadata files: 9 under `docs/`, one blog metadata file, and one changelog metadata file.
- `DOCUMENTATION.MD` is the governing playbook, not a rendered product-documentation page.
- No content category will be silently excluded. Developer docs will receive full current-code verification; blog tutorials will be checked as executable guidance; changelogs will be checked in release-time context plus current link/label integrity; every metadata file will be checked against its directory and rendered navigation intent.
- Documentation sections are: root/introduction (2 pages), quickstart (3), concepts (4), support component (9), advanced (2), user feedback (1), self-hosting (5), and other/reference material (4), totaling 30 pages.
- All 30 developer-documentation pages expose `title` and `description` frontmatter. All four blog pages expose title, description, date, author, and image fields.
- Changelog entries do not use the same `title` frontmatter convention; their exact schema and renderer must be checked before classifying this as a metadata defect.
- Navigation metadata explicitly orders every developer-documentation page. The “Others” navigation links to `https://cossistant.com/llms-full.txt`; the playbook separately requires an `llms.txt` directory file, so both route implementation and discoverability need verification.
- The root docs navigation orders self-hosting after “Others.” This may be intentional audience prioritization, but it will be evaluated as a learning-path decision rather than assumed correct.

## Authoritative Evidence Map

- SDK/package claims span `@cossistant/react`, `@cossistant/next`, `@cossistant/core`, `@cossistant/types`, `@cossistant/browser`, and `facehash`; their manifests, public exports, generated output, and integration examples are primary evidence.
- API claims include visitor identity, support feature flags/onboarding, feedback, uploads, MCP, REST/tRPC/WebSocket/auth, and API-key restrictions; route implementations and `packages/protocol/openapi.json` are primary evidence.
- Self-hosting claims depend on API/web environment schemas plus storage, email, Polar, Tinybird, and DataFast initialization branches.
- Product/infrastructure claims include hosting vendors, billing defaults, analytics, background jobs, licensing, and currently offered UI capabilities; repository configuration and deployment code are required before verification.

### Candidate issues awaiting authoritative verification

- The React support-widget blog contains two identical adjacent imports of `Support` and `SupportConfig`; if rendered literally, the copy-paste example redeclares both identifiers and fails to compile.
- Documentation describes automatic public-key discovery from `VITE_COSSISTANT_API_KEY`, `NEXT_PUBLIC_COSSISTANT_API_KEY`, and generic `COSSISTANT_API_KEY`; implementation behavior must be verified for each framework/build system.
- `others/contributors.mdx` states AGPL-3.0 with a non-commercial limitation while `others/mentions.mdx` states GPL-3.0. The repository license and commercial-license terms must resolve this contradiction.
- Contributor docs state web/API development ports 3000/3001 and REST+tRPC+WebSocket+auth support; current scripts and server configuration must verify all five claims.
- MCP docs describe a hosted OAuth-protected, read-only tool set; server routing, OAuth metadata, and registered tool handlers must be checked directly.
- Self-hosting pages declare concrete environment variables and default-on Polar/Tinybird behavior. These are high-risk drift points and require branch-by-branch configuration verification.

### Confirmed evidence: packages and license

- Current SDK package versions are 0.2.0. The documented React/Next/Core/Types/Browser packages and `facehash` all exist.
- All specifically documented React and Next public subpaths found so far exist in package export maps, including `support`, `provider`, `support-config`, `identify-visitor`, `hooks`, `feedback`, primitives, explicit feedback/file-upload hooks, CSS entries, and the new `lazy-support` entries.
- Root `@cossistant/react` imports remain valid public API. Focused imports are still preferable where documentation promises smaller Next route boundaries; root React imports are not automatically incorrect.
- `facehash` declares no runtime dependencies, supporting the blog's “zero dependencies” claim in the normal npm dependency sense; it does declare React/React DOM/Next peer dependencies.
- The root project declares Bun 1.3.1 and Node 20.9+, so the contributor prerequisite “Bun v1.2+” is compatible but underspecified relative to the reproducible package-manager version.
- The repository `LICENSE` is GNU AGPL-3.0 and explicitly permits charging for copies. Therefore:
  - **High:** `docs/others/contributors.mdx` describes AGPL-3.0 as “for non-commercial use,” which is not a restriction in the repository license and is materially misleading legal guidance.
  - **High:** `docs/others/mentions.mdx` calls the project GPL-3.0, contradicting the actual AGPL-3.0 license.
  - Any separate commercial license offering should be described as an alternative licensing option, not as a limitation of AGPL rights, unless authoritative legal terms elsewhere explicitly establish a different scope.

### Confirmed evidence: key resolution and self-host flags

- `resolvePublicKey()` implements the documented priority and recognizes explicit `publicKey`, `NEXT_PUBLIC_COSSISTANT_API_KEY`, generic `COSSISTANT_API_KEY`, and `VITE_COSSISTANT_API_KEY`. The API-key and quickstart claims about supported variable names are accurate at the SDK layer.
- `SupportProvider` accepts the documented `publicKey`, `apiUrl`, `wsUrl`, support config, default messages, quick options, connection callbacks, size, and default-open inputs.
- API environment parsing defines all documented storage variables: bucket, region, access/secret key, optional endpoint, path-style flag, public base URL, and CDN base URL. Upload code consumes those exact fields.
- `POLAR_ENABLED` defaults to true and billing code treats only explicit false as disabled, matching the billing page's stated default.
- Server and browser Tinybird flags default to true. The API also defines host, token, signing key, and workspace fields; DataFast defaults on unless explicitly false. The analytics page's flag names/default direction are supported, though the operational consequences still require page-level verification.
- Resend API key, webhook secret, and inbound-domain fields exist and are consumed. Claims about additional email providers and webhook flows still require implementation review.

### Confirmed evidence: documentation platform

- The site implements both `/llms.txt` and `/llms-full.txt`, and tests assert plain-text responses with noindex headers. The navigation label “llms.txt” currently points to the full variant; this is not absence of `llms.txt`, but the label/target distinction should be made explicit for humans and agents.
- The proxy rewrites docs, blog, and changelog requests advertising `Accept: text/markdown` to machine-readable MDX routes, with dedicated tests for all three content families. This satisfies the playbook's raw-Markdown transport requirement at the platform level pending page-level response verification.
- Shared metadata builders support canonical URLs and Open Graph types; docs and blog page routes call metadata generation from content frontmatter. Page-level metadata completeness still needs reconciliation.
- The repository includes dedicated docs navigation, table of contents, top bar, page actions, MDX component, sitemap, SEO-route, and search-metadata code/tests. These are the authoritative sources for the non-content parts of the AAA rubric.
- Docs pages generate dynamic OG images when page frontmatter does not provide one, canonical metadata, TechArticle JSON-LD, breadcrumb JSON-LD, one rendered H1, neighbour navigation, sidebar navigation, and a table of contents.
- **Medium systemic:** The docs page/layout does not render the playbook-mandated “Was this helpful?” feedback mechanism. Repository search found no equivalent helpfulness control in the docs route.
- **Medium systemic:** The lander/docs layouts contain a `<main>` landmark but no skip-navigation link or explicit skip target. Repository search found no skip-nav implementation for this surface.
- Raw content/AI affordances are unusually strong: page-copy/open-in-AI actions exist, per-page machine-readable routes exist, and both compact/full LLM indexes exist. Exact top-bar wiring remains to be checked, but the underlying implementation is present.
- Changelog frontmatter intentionally uses `version`, description, announcement text, date, and author rather than `title`; absence of `title` is schema-consistent and not itself a defect.
- The docs top bar does wire “Copy page,” source-on-GitHub, and open-in-Scira/ChatGPT/Claude/T3 actions to the per-page Markdown URL. This is a clear playbook pass for AI accessibility.
- Heading rendering provides/retains IDs through the MDX pipeline and exposes a table of contents, supporting stable anchors. Exact duplicate/special-character heading collisions will be checked across content.
- **Medium systemic:** Image rendering accepts missing `alt` and silently emits `alt=""`; the content schema does not enforce descriptive alt text. Individual content images therefore need an explicit audit, and the platform does not guarantee the playbook requirement.
- Reduced-motion handling exists for docs image zoom and some site animations, but there is no global docs-shell enforcement visible from the current search. Animated MDX demos must be assessed individually rather than marking the criterion globally satisfied.

### Confirmed evidence: MCP

- The hosted MCP endpoint default is exactly `https://api.cossistant.com/mcp` in production.
- The API implements Streamable HTTP at `/mcp`, disables legacy SSE, publishes OAuth protected-resource metadata, supports dynamic/public client registration, requires `support:read`, and exposes `WWW-Authenticate` for unauthenticated clients. The page's OAuth/no-static-secret guidance is accurate.
- Exactly four tools are registered and all are read-only: list websites, search knowledge, list conversations, and get conversation. Their names and purposes match the page exactly; no reply/resolve/priority mutation tools are registered.
- Tool implementations derive the teammate identity from the OAuth subject and call website-scoped support capabilities, supporting the access-scope statement.
- Local Cossistant claims on `docs/others/mcp.mdx` are verified. External Cursor/Claude Code/OpenCode configuration syntax remains pending verification against each vendor's current primary documentation.
- **Medium completeness candidate:** The page has no input/output reference for tool parameters (website selector, limits, filters, pagination) and no stated rate-limit behavior, even though the server enforces an MCP limiter. For an AAA tool integration, add a compact tool-reference section or link to generated schemas.

### Existing documentation test coverage

- The repository tests that registered support previews render, that selected learning-path links/order remain present, that registry commands/package-manager variants match generated integration guidance, and that docs metadata/AI routes are wired.
- The tests do **not** compile the literal MDX code fences or validate every documented prop/hook/event/type/environment variable. They are useful structural evidence but cannot establish page-by-page accuracy.
- Preview-backed examples are stronger evidence than standalone fences because their implementation code is imported and rendered in tests; however, the displayed source and prose around them still require comparison.
- The docs top bar derives “Widget v0.2.0” from the current React package manifest rather than changelog version, which avoids a common release-label drift issue.

### Page evidence: `docs/quickstart/api-keys.mdx`

- Settings → Developers exists and provides public/private key creation, revocation, and allowed-domain management.
- Public/private prefixes and browser/server usage match API format validation and OpenAPI security descriptions.
- Public authentication requires an Origin header, enforces the website allowlist, matches an apex entry to subdomains, and requires HTTPS/WSS for live keys in production. Test keys bypass the secure-protocol/localhost prohibition but still require an allowlisted hostname.
- Bare domains and full HTTP/HTTPS origins are accepted by the dashboard and normalized; backend authorization compares normalized hostnames.
- **Low clarification:** “Test keys work on localhost” can be read as automatic. The page already says all public keys require whitelisting, but AAA wording should state explicitly that localhost must remain/additionally be on the allowlist (new websites add it during onboarding).
- Overall factual status: **Pass with one low-severity clarification**.

### Page review: `docs/(root)/index.mdx`

- Gives a direct Next and React registry command and links to both quickstarts; examples are concise and use the actual registered item names already covered by integration-guide tests.
- Registry manifests confirm each command installs three local files (provider, support, bubble), the correct SDK plus motion/icon dependencies, the framework-specific API-key placeholder, and the correct support CSS import. The page's install-result summary is accurate.
- **Medium completeness:** The landing page has no prerequisites, API-key acquisition link, expected success state, browser/script-tag path, or decision help between registry and package install. Its broad description says Cossistant works with “your favorite frameworks and AI models,” while the page only presents Next.js and React; the exact supported-framework/model scope needs qualification.
- The two inline framework logos have accessible `<title>` elements. The cards provide meaningful visible labels.

### Page review: `docs/(root)/what.mdx`

- The open-source, default Support component, and reusable primitives claims are directionally supported by the AGPL repository and exported primitives.
- **High readability:** Multiple sentences contain grammar/tense errors and ambiguous phrasing (“external iframe and code,” “by time,” “ads blocker,” “every components … are,” “to defined”). This directly fails the playbook's non-native-reader and concise-language bar.
- **Medium accuracy/precision:** “Every component used in `<Support />`” is stronger than current evidence; some internal widget pieces are not necessarily exported as public headless primitives. Rephrase to “reusable primitives and hooks” unless an export-to-internal-component inventory proves complete parity.
- **Medium usefulness:** The page explains vision but offers no architecture diagram, concrete “hosted vs self-hosted / default vs custom” distinction, capability boundaries, or next-step links. Humans and agents cannot translate the principles into an implementation decision.

### Page review: `docs/quickstart/index.mdx` (Next.js)

- Registry command/install result, focused provider/style/lazy/support/config/identity imports, public-key name, and component hierarchy match current exports and registry sources.
- The Next-specific lazy wrapper uses `next/dynamic({ ssr: false })`; the claim that the complete Support UI leaves the initial route chunk is supported by the measured package integration audit.
- **Medium completeness:** The quickstart never links the API Keys page at the point the placeholder is introduced, does not tell users where to copy the key, and has no expected visual/network success check or first-line troubleshooting.
- **Low clarity:** It introduces custom default messages in the quickstart before explaining provider scope or why that step is optional; this is useful but better as a clearly optional “Next step.”
- Current accuracy status: **Pass with completeness improvements**; production example build still to be rerun as final evidence.

### Page review: `docs/quickstart/react.mdx`

- React registry/install/CSS/lazy widget/identity/default-message APIs exist and match current exports. The Vite path aligns with the repository integration.
- **High accuracy:** The “Other frameworks (CRA, Remix, etc.)” tab says setting `COSSISTANT_API_KEY` is sufficient. The SDK can read that variable only if the bundler exposes it to browser code. Create React App exposes only `REACT_APP_*` variables, and Remix does not automatically expose arbitrary server environment variables to the client. For non-Vite/Next clients, explicit `publicKey` (or documented bundler injection) must be the primary guidance.
- **Medium clarity:** A Next.js environment tab appears inside the `@cossistant/react` manual-install path even though the site provides a dedicated `@cossistant/next` quickstart/package. This creates an unnecessary choice and weakens the framework learning path.
- **Medium completeness:** Like the Next page, it lacks a direct API-key acquisition link, observable success criteria, and concise troubleshooting.
- The `LazySupport`/Suspense claim is supported for Vite; the actual repository React integration build/playwright suite will be part of final validation.

### Page review: `blog/how-to-add-a-support-widget-to-a-nextjs-app.mdx`

- All imports, props, CSS entries, identity fields, and default-message types shown exist. The tutorial is logically ordered and substantially copy-pasteable for App Router.
- **Medium performance drift:** It still teaches eager `<Support />` while the current release added and documented the `lazy-support` entry specifically to reduce initial Next route weight. The code remains correct, but a new “best path” tutorial should use `LazySupport`/Suspense or explicitly explain eager vs lazy tradeoffs.
- **Medium completeness:** It never says where to obtain the public key or links to API Keys; it also lacks an observable success check and troubleshooting for the common missing-key/domain/CSS failures.
- **Low style:** The article repeats several short marketing fragments (“It's product work,” “That matters”) that scan well but add length without implementation value. Tighten while preserving voice.

### Page review: `blog/how-to-add-a-support-widget-to-a-react-app.mdx`

- **High broken example:** The default-messages code fence imports `Support` and `SupportConfig` twice from the same module. Copying the fence causes duplicate identifier declarations and fails compilation.
- **High environment guidance:** The generic `COSSISTANT_API_KEY` advice has the same CRA/Remix exposure problem as the React quickstart. Explicit `publicKey` should be the safe generic default.
- **Medium performance drift:** It teaches eager root-package `Support`; current recommended simple-widget guidance is the lazy entry. Root imports are valid and Vite tree-shakes named imports, but built-in widget/audio deferral should be reflected in a current install tutorial.
- **Medium portability:** The custom-trigger example relies on Tailwind utility classes after the tutorial explicitly supports plain CSS. Plain-CSS readers get an unstyled trigger unless the example labels this assumption or supplies CSS.
- `Support.Trigger`, render props, positioning props, `Support.Content`, and `Support.Root` all exist; those composition claims are accurate.
- Both support-widget blog articles need related links/frontmatter curation: the Next article has an empty `related` list while the React article links back to Next, producing asymmetric discovery.

### Page review: `docs/concepts/index.mdx` (Visitors)

- **High privacy/accuracy:** The page says Cossistant uses browser/device fingerprinting for persistence. No fingerprint identifier implementation exists; identity persistence is a website-scoped visitor ULID stored in localStorage. Browser/device characteristics are collected as analytics/context, not used as a fallback identity fingerprint.
- **High privacy/completeness:** “Only browser-derived data (language, timezone)” materially understates collection. Current visitor data includes browser/version, OS/version, device/type, screen and viewport, referrer/UTM/click IDs, current page, and server-enriched location fields. The page should distinguish anonymous identity from collected technical/acquisition data and link privacy/retention guidance.
- The localStorage/session persistence, per-browser behavior, automatic creation, blocked flag, contact link, and cross-device restoration after identification are otherwise supported.
- **High identity-safety:** The `useVisitor` example calls `identify` only when no contact exists. If a shared browser changes signed-in accounts while a prior contact remains, the new user may not be identified. Use `IdentifySupportVisitor` as the safe default or document an identity-switch/reset pattern and make the hook effect key explicitly to the authenticated user's stable ID.

### Page review: `docs/concepts/contacts.mdx`

- Identification by stable `externalId` or email, multiple visitors per contact, contact-scoped conversation access, primitive-only metadata, dashboard contact views, and cross-device/storage-loss continuity are supported by current schemas and access queries.
- **High incorrect optimization claim:** The page says unchanged metadata never triggers an API call for either `setVisitorMetadata()` or rerendering `<IdentifySupportVisitor />`. Hash comparison exists only in `IdentifySupportVisitor`; direct `setVisitorMetadata()` always invokes the controller/API when a visitor exists.
- **High identity-safety:** The hook example repeats the `!visitor?.contact` guard and has the same account-switch hazard as the Visitors page.
- **Medium API semantics:** Explain that metadata updates merge into existing contact metadata and that setting keys to `null` is distinct from removing them; this matters for AI agents generating update calls.

### Page review: `docs/concepts/conversations.mdx`

- Status/priority values, last timeline item, real-time messages/typing/seen/status events, human+AI participants, tags, private items, unread tracking, and contact-scoped cross-device access are represented in current schemas/stores.
- **High unsupported product claim:** The page says a support agent can initiate a conversation from the dashboard. The current dashboard exposes actions/messages for existing conversations but no create-conversation UI or tRPC mutation; creation exists in the REST/widget flow. Remove the dashboard claim or implement/link the actual feature.
- **Medium completeness:** The page has no SDK/API example, no canonical conversation type table, no channel/assignee/sentiment fields, and no link to the current REST API reference. It explains the model but does not let a human or agent act on it.

### Page review: `docs/concepts/timeline-items.mdx`

- Canonical item fields, item types, visibility, actors, translation shape/audiences, message parts, event values, and original-text preservation align closely with the current schema; auto-type tables reduce drift risk.
- **Medium completeness:** The prose's part inventory omits several current public shapes (reasoning, tool calls, citations/source URLs/documents, step boundaries, event and feedback parts) and does not link to REST operations for listing/sending items.
- **Low precision:** “Complete audit trail” is absolute; deleted/filtered/private items and non-timeline operational activity make “structured conversation history” safer.

### Page review: `docs/support-component/index.mdx`

- The default widget, slot/class/prop customization paths, SupportConfig, visitor identity, theme, custom pages, Root, and generated Support prop table all map to current APIs. The preview is registered and render-tested.
- **Low performance consistency:** The 30-second code uses eager root `Support`, while current quickstarts recommend `lazy-support`. This overview may intentionally prioritize simplicity, but should link the lazy option and its tradeoff so the performance recommendation is consistent.
- **Medium completeness:** “Production-ready” is used without a checklist for key/domain configuration, identity/account switching, accessibility, error handling, privacy, or success monitoring.

### Page review: `docs/support-component/customization.mdx`

- `classNames`, `slotProps`, trigger/home slots, slot prop types, render fields, and preview implementations match current code and are compilation-tested as repository TSX sources.
- The page is a strong progressive-disclosure example: smallest styling change → trigger swap → home-page swap → clear stop/next decisions.
- **Medium portability:** Every code example assumes Tailwind utilities but the page does not state Tailwind as a prerequisite or provide a plain-CSS equivalent, even though the quickstarts support precompiled plain CSS.
- **Low accessibility:** The custom trigger examples have visible text, but the unread badge/dot semantics and focus-state expectations are not explained. An AAA customization page should identify which accessibility props the slot supplies and which responsibilities custom components inherit.

### Page review: `docs/support-component/theme.mdx`

- Host-token precedence, forced dark mode, ancestor `.dark`, root `data-color-scheme`, core color/radius/font adoption, and the shown default values align with current CSS.
- **Medium reference completeness:** The “Core token reference” is not complete relative to implemented/publicly described tokens (popover, secondary, accent, input, ring, destructive foreground, fonts, and additional background levels are omitted). Label it a starter set or generate a canonical table from CSS.
- **Low API completeness:** `theme="light"` is also supported but only forced dark mode is documented.
- **Low compatibility:** `color-mix(in oklch, …)` is central to derived shades, but browser support/fallback expectations are not stated.

### Page review: `docs/support-component/text.mdx`

- Built-in locales (`en`, `fr`, `es`), key names, custom locale overrides, explicit/visitor/English fallback chain, `Text`, `useSupportText`, variable formatting, and `data-key-name` debugging all match current implementation/tests.
- **Medium completeness:** There is no complete copy-key catalog, extraction workflow, locale completeness strategy, right-to-left guidance, or way to validate that a custom locale covers required strings. The Types page is linked, but an AI/human implementing localization still has to inspect source.
- Overall factual status: **Pass with localization workflow gaps**.

### Page review: `docs/support-component/routing.mdx`

- `customPages`, responsive mode, `Support.Root`, `Support.Router`, and `Support.Page` are current public APIs, and the two preview-backed layouts render in repository tests.
- **High broken primary example:** The “Smallest working change” navigates with `conversationId: "pending_docs_conversation"`. That value exists only in the documentation preview mock. The real SDK treats only the exported `PENDING_CONVERSATION_ID` (`"__pending__"`) as a not-yet-created conversation, so the copied example is handled as a real conversation ID and can fetch/send against a nonexistent conversation. Import the constant from `@cossistant/react/utils/id`.
- **Medium portability:** All layout examples use Tailwind classes without declaring Tailwind as a prerequisite or offering plain CSS, despite the SDK's Tailwind-optional package contract.

### Page review: `docs/support-component/support-state.mdx`

- The typed `createSupport` registration pattern, module augmentation, `SupportProvider.support`, React hooks, Core client methods, private-key mutation method, HTTP endpoint, three mutation target types, flag union, onboarding precedence/copy behavior, metadata replacement/null clearing, optimistic update, and realtime refresh all exist and match current code.
- **Medium execution ambiguity:** The “Core usage” sample is described as working outside React but uses a browser public key without saying that it must execute in a browser with an allowed `Origin`. A reader may put `support-runtime.ts` on a Next server, where public-key authentication is not the correct credential model. Label it browser-only or provide separate browser/private-server examples.
- **Medium API-reference quality:** The page exposes database implementation details (comma-separated text and JSONB) as the public “storage model.” Those details are accurate today but are not part of the SDK contract and create avoidable drift. Document observable precedence/persistence semantics first; move physical storage notes to self-hosting/database documentation.
- **Low copy-paste realism:** The cURL target uses `contact_123`, while current entity IDs are ULIDs. Use an environment variable or clearly valid-shaped example so users do not mistake the placeholder for the accepted ID format.
- Overall factual status: **Pass with execution and contract-boundary clarifications**.

### Page review: `docs/support-component/hooks.mdx`

- All named hooks, root exports, provider-optional client semantics, generated type targets, and shown method names exist. Auto-generated return/parameter tables substantially reduce signature drift.
- **High identity-safety:** The authentication example repeats the unsafe `!visitor?.contact` guard. On a shared browser that signs into a different account, an existing contact prevents re-identification. Prefer `IdentifySupportVisitor`, or compare the current contact's stable external identity and document account switching.
- **High broken behavior:** The `useHomePage` example renders a “View conversations” button wired to `home.openConversationHistory` but never provides `onOpenConversationHistory`; the hook intentionally no-ops without that callback. Add the navigation callback or remove the button.
- **Medium behavior completeness:** The direct `useMessageComposer` example relies on provider fallback for sending but passes no client to its typing reporter. Messages can send inside `SupportProvider`, while realtime typing from this direct hook path is disabled. Resolve the provider client inside `useMessageComposer` or document/pass the client explicitly.
- **Medium copy-paste quality:** Several examples use invalid-looking placeholders such as `conv_123`, depend on undeclared Tailwind styles, omit prop types (`user`), or demonstrate UI without loading/error/disabled handling. The APIs are real, but these examples are not consistently production-safe.
- **Medium discoverability:** The reference omits several public hook families (`useFeatureFlag(s)`, `useOnboarding`, feedback hooks, create/send mutations, conversations/timeline/realtime hooks) despite calling itself the canonical hooks reference. Either generate a complete index or narrow the title/scope.

### Page review: `docs/support-component/events.mdx`

- Event unions, payload shapes, callback props, subscription API, and emitter methods all exist and are backed by generated tables.
- **High product/behavior mismatch:** The built-in widget does not emit any of the documented lifecycle/message/error events. Repository-wide call-site search found `controller.emit()` only in the event context and tests; built-in send, receive, conversation lifecycle, and error paths never call it. Therefore callback props in the “Smallest working snippet” do not observe normal widget activity. Wire automatic emissions to the runtime or explicitly label the API as manual-only.
- **High non-executable example:** The custom emitter example calls an undefined `sendMessage()` function and casts any thrown value to `Error`. Replace it with `useSendMessage().mutateAsync()` or a complete helper so the page's copy-paste promise is true.
- **Medium analytics guidance:** Even after automatic emission exists, define delivery semantics (optimistic vs server-confirmed, duplicate/reconnect behavior, whether default messages count, and what “conversation end” means). Analytics consumers need those guarantees.

### Page review: `docs/support-component/types.mdx`

- Every auto-type-table source file and named reference exists, including the explicit reference aliases used for inferred schemas/classes. `SupportMode` matches the public union.
- **Medium completeness:** This is a curated type index rather than a canonical reference: it omits Support props/config, route/navigation types, slot/class names, feature/onboarding types, feedback/upload types, and many timeline part variants. Rename the claim or generate/search-link a complete export index.
- **Low heading style:** “Widget Types” and “Visitor And Website Data” do not follow the repository playbook's sentence-style, plain-language heading convention. Use sentence case consistently.

### Page review: `docs/advanced/index.mdx`

- The support source link is valid, and the SDK does expose reusable hooks/primitives used by the shipped widget. The page correctly positions this as the full-custom path.
- **Medium actionability:** More than half of the page is positioning and “templates are coming soon.” It offers no minimal architecture, provider setup, required state flow, accessibility checklist, or working custom shell. For an AAA advanced landing page, add a concrete build sequence and explicitly list what remains the integrator's responsibility.
- **Low maintenance:** “Coming soon” has no date/status link and becomes stale silently. Link an issue/roadmap or remove the promise.

### Page review: `docs/advanced/primitives.mdx`

- Every primitive named in the page is currently exported, and the controlled Trigger and runtime Window examples match their intended provider boundaries.
- **High bundle-guidance conflict:** The page's recommended `import { Primitives } from "@cossistant/react"` creates an observable namespace containing the entire primitive surface. The package-size audit measured the React namespace path at roughly 126 KB gzip in a worst-case browser bundle. Use named imports from `@cossistant/react/primitives` or leaf subpaths so consumers do not accidentally retain unrelated timeline, markdown, feedback, and input code.
- **Medium accessibility/production completeness:** The smallest custom shell is visually positioned but lacks dialog semantics, focus management, Escape behavior, focus return, responsive sizing, and accessible trigger/window labeling. A “headless” page must explicitly state these responsibilities and preferably provide a tested accessible shell.
- **Medium reference completeness:** The inventory is manually curated and omits exported components/utilities. Generate a table from `primitives/index.parts.ts` or label the list as selected building blocks.

### Page review: `docs/user-feedback/index.mdx`

- The drop-in widget, provider fallback, explicit-client override/null semantics, hook exports, rating constraints, topics/comments/trigger/source/conversation association, and auto-generated option/result tables match current implementation. Feedback without an existing conversation is persisted into a follow-up conversation, supporting the page's product framing.
- **High accessibility in copy-paste example:** The “Build your own” form has an unlabeled `<select>` and `<textarea>`, no fieldset/legend for the rating controls, and exposes `aria-invalid` without associated error text. This fails the playbook's AAA target and teaches inaccessible custom UI. Add visible labels, an announced error region, and grouped rating semantics.
- **Medium privacy/consent guidance:** The opening promotes identified feedback but never tells implementers to disclose the association, minimize metadata, or obtain consent where required. Add a short privacy note linked to visitor/contact data handling.
- **Medium success/troubleshooting:** The page does not show where feedback appears, how to verify a submission, or how to diagnose missing visitor context/domain allowlisting. Add an observable success path and common errors.
- **Low import consistency:** Examples mix root imports, `feedback`, and deep hook entries without explaining the bundle/ergonomic choice. Prefer the focused `@cossistant/react/feedback` entry for this feature and state when a deep entry is useful.

### Page review: `docs/self-host/index.mdx`

- The four covered decisions—billing, storage, email, and analytics—match current optional infrastructure branches, and the linked guides exist.
- **High completeness/positioning:** The page calls itself the self-host overview but does not cover the minimum deployable system: Postgres/migrations, Redis, API/web/workers, auth URLs/secrets/OAuth, public URLs/CORS, queues/QStash, AI/OpenRouter, secrets, health checks, backups, upgrades, or deployment topology. A user cannot self-host Cossistant from this section. Rename it “Optional infrastructure” or add a real deployment guide and prerequisite checklist.
- **Medium dependency clarity:** It presents billing, email, analytics, and uploads as the first setup order without first establishing the database, cache/queue, auth, and service processes those checks require.

### Page review: `docs/self-host/storage.mdx`

- Runtime variable names, public/CDN URL precedence, S3-compatible endpoint/path-style settings, presigned PUT flow, tenancy-aware key structure, and Terraform module location match current code.
- **High production-safety gap:** The recommended Terraform module sets `force_destroy = true`, disables every S3 public-access block, permits public reads for all objects, allows CORS from `*`, and creates long-lived IAM access keys. The page mentions public URLs but does not warn that this module is a permissive starter that should be hardened before production. Document restricted origins, retention/versioning, encryption, key rotation/roles, backups, and private/CDN delivery alternatives.
- **Medium operational incompleteness:** No prerequisites/version requirements, `terraform plan` review, remote/encrypted state guidance, output retrieval, secret handling, teardown warning, or rollback is documented. These are material for a module that emits credentials and can destroy a bucket.
- **Low configuration completeness:** `S3_SIGNED_URL_EXPIRATION_SECONDS` is a current runtime option (default 900 seconds) but is absent from the reference.

### Page review: `docs/self-host/billing.mdx`

- `POLAR_ENABLED` parsing/default, webhook mounting, customer/subscription branches, synthetic `self_hosted` plan, unlimited entitlements, unmetered AI view, hidden upgrades, and billing-page behavior are supported by source and dedicated tests.
- **Medium operational warning:** Disabling billing changes authorization/entitlements globally. Add an explicit warning not to use this mode as a hosted multi-tenant billing bypass and state that switching an existing deployment should be tested against subscription/customer data.
- Overall factual status: **Pass with deployment-risk guidance**.

### Page review: `docs/self-host/analytics.mdx`

- API/browser flags default on and use strict true parsing; disabling server ingestion/token generation and browser Tinybird UI branches is source/test-backed. DataFast omission is also tested.
- **High configuration completeness:** The enabled path names host/token/signing key/workspace but does not explain how to provision the repository's required Tinybird datasources/pipes or validate them. Pointing at a generic Tinybird installation is insufficient to make inbox metrics work.
- **Medium split-brain risk:** Server and browser flags can disagree, but the page does not require them to be changed together or describe failure modes. Add a configuration matrix and a health check.
- **Medium privacy/default:** Hosted web analytics defaults on even for self-hosters. The recommendation says to disable DataFast, but the initial overview should make the third-party request and opt-out explicit before deployment.

### Page review: `docs/self-host/email-setup.mdx`

- Provider selection, default Resend behavior, sender/inbound/credential variables, SES capability limits, Terraform module, bridge endpoints/headers/HMAC payload, coexistence strategy, and audience-helper caveat match current code.
- **High incorrect delivery-tracking claim:** The guide repeatedly says delivery events update delivery tracking/monitoring. Both Resend and SES routers explicitly return/continue on `email.delivered`; shared persistence handles only bounce, complaint, and failure suppression. Describe delivery as received-but-not-persisted, or implement delivery tracking.
- **Medium secret/production guidance:** The guide places long-lived SES access keys and a webhook secret in `.env` but does not discuss secret storage/rotation, IAM roles where available, replay window, sandbox exit, sending limits, suppression behavior, raw inbound-email retention, or personally identifiable data in S3/logs.
- **Medium verification:** The checklist lacks concrete commands/log signatures or a test-message procedure, so an AI agent cannot determine success without inventing steps.

### Page review: `docs/others/contributors.mdx`

- **High broken local setup:** The page says the API is on `http://localhost:3001`; current API default, web URL helpers, OAuth/MCP metadata, and tests use `http://localhost:8787`. Troubleshooting repeats the wrong port.
- **High broken command:** It tells schema contributors to run `bun db:generate`, but `apps/api/package.json` exposes `generate`, not `db:generate`.
- **High false validation claim:** `bun run docs:links` checks only `packages/react/README.md`; it does not scan MDX documentation. The contributor workflow tells documentation authors this command validates their changes when it does not.
- **High licensing:** The page ends at an empty `## License` heading. Elsewhere the repository incorrectly describes AGPL as non-commercial; this page must link the exact repository license and avoid adding non-AGPL restrictions.
- **Medium setup accuracy:** The pinned package manager is Bun 1.3.1, while the page says 1.2+; `bun dev` starts every workspace `dev` task selected by Turbo, not only the three services listed. The guide omits required environment-file/bootstrap steps and workers/Tinybird/example processes that may start or fail.
- **Medium test coverage:** The pre-PR checklist does not include the repository-wide `bun test`, release gates, OpenAPI drift, package-output, browser size, or example Playwright checks relevant to published SDK changes.
- **Low filename claim:** Tests are also colocated as `*.test.tsx`, not only `*.test.ts`.

### Page review: `docs/others/mcp.mdx`

- Local server behavior and all four tools are verified against current code. Current official Cursor, Claude Code, and OpenCode documentation supports the shown remote URL/OAuth configuration shapes; Claude's exact `--transport http` command and OpenCode's `type: "remote"` object are current.
- **Medium completeness:** Add parameter/output examples, pagination/limit behavior, rate limits, tool error semantics, OAuth revoke/logout steps, and the required `support:read` scope. The current prompt-only smoke test cannot diagnose tool-level failures.
- **Low client troubleshooting:** OpenCode exposes `opencode mcp auth/list/debug/logout`, Cursor Agent exposes MCP login/list tools, and Claude exposes authentication clearing through `/mcp`; linking these official paths would make the setup agent-executable.
- Overall factual status: **Pass with tool-reference gaps**.

### Page review: `docs/others/mentions.mdx`

- **High license error:** It says GPL-3.0, but the repository license is GNU AGPL-3.0. Correct the identifier and link the repository license.
- **Medium volatile/unsupported hosting absolutes:** “all our projects” on Vercel and the Hono backend on Railway are deployment-state claims with no repository-owned source or last-reviewed date. Use scoped present-tense wording and link the managed-cloud architecture/subprocessor source.
- **Low professionalism/accessibility:** “we paid for the license ofc” is informal for an attribution page; “NextJS” should be “Next.js,” and link-purpose text should identify each credited asset/use precisely.

### Page review: `docs/others/third-party-services.mdx`

- Repository evidence supports active use of Vercel-oriented web hosting, Railway references for the API, AWS S3/CloudFront, Upstash Workflow/QStash, Postgres/Drizzle, Better Auth, Polar, Resend, OpenStatus, Tinybird, and DataFast. Current official sources support the specific SOC 2 claims checked for Railway, Tinybird, Resend, Upstash, Vercel, and AWS CloudFront.
- **High security-document quality:** The page is marketing copy, not a usable vendor/subprocessor disclosure. It has no last-reviewed date, data categories, processing purpose, region, retention, subprocessor role, DPA/trust links, customer configuration responsibility, or change-notification mechanism.
- **High overbroad assurance:** “All third-party services” are said to have SOC 2/GDPR/encryption/audits/penetration tests/high availability/DR, while individual bullets mark only a subset SOC 2 and no evidence is attached. Replace blanket assurances with vendor-specific, dated, directly sourced facts.
- **Medium incomplete vendor inventory:** Current code also materially uses OpenRouter for AI/embeddings and Google/GitHub OAuth, plus AWS SES in the self-host path; these data processors/integrations are absent. Clarify whether the page is exhaustive, managed-cloud-only, or illustrative.
- **Medium product privacy:** “visitor tracking and geolocation data” is important processing but the page does not describe the data, lawful/customer controls, or link retention/privacy documentation.

### Page review: `blog/facehash-avatar-library-for-react.mdx`

- Package/install/root imports, deterministic same-input behavior, compound Avatar/Image/Fallback API, size/colors/3D/initial props, TypeScript types, no runtime dependency declarations, and use inside Cossistant are supported by current package code/tests.
- **High broken code:** The customization example uses `shape="round" | "squircle" | "square"`, but `FacehashProps` has no `shape` property. These three copied examples fail TypeScript and the prop has no runtime effect.
- **High implementation drift:** The article says “The entire thing is CSS-based”; the current package describes itself and implements avatars as SVG-first React output, with CSS used for interaction/animation. Correct the architecture claim.
- **Medium default drift:** `intensity3d="dramatic"` and `showInitial` are presented as opt-in customizations, but both are current defaults. Show meaningful alternatives (`none`/`subtle`, `showInitial={false}`, `interactive={false}`, `variant="solid"`).
- **Medium dependency precision:** “Zero-dependency” is defensible for npm runtime dependencies, but React/React DOM are required peer dependencies and Next is optional. Say “no bundled runtime dependencies beyond React peers” to avoid surprising package consumers.
- **Medium evidence/maintenance:** Framework compatibility and bundle-lean claims have no tested matrix or measured size on the page. Link the actual package compatibility/build evidence or avoid absolutes.

### Page review: `blog/introducing-cossistant.mdx`

- The current product supports a React Support component, reusable primitives, shared AI/human conversations, customization, and open-source source access, so the central launch narrative remains aligned.
- **Medium roadmap ambiguity:** “Skills you write. Logic you control. Integrations you build.” is stated as part of the vision, but public code-defined AI skills are not documented as a currently available SDK. Label vision/roadmap separately from shipped capabilities and link current features.
- **Medium readability:** The article opens with “Before writting,” contains awkward headings (“Code-first AI agents and Human together”), repeated slogans, and all-caps emphasis. Edit for grammar, concise claims, and non-native-English readability while preserving the first-person editorial voice.
- **Low conversion path:** The CTA says install the package but links no quickstart, API-key step, or current release. Add one concrete next action.

### Page reviews: `changelog/*.mdx`

- `2026-01-16-v0.0.29.mdx`, `2026-01-31-v0.0.30.mdx`, `2026-02-10-v0.0.33.mdx`, `2026-02-13-v0.1.0.mdx`, and `2026-03-11-v0.1.2.mdx` are internally consistent historical records. Their package versions and release-time claims are supported by repository history; they pass with normal historical-context caveats.
- **High broken historical example (`2025-12-23-v0.0.28.mdx`):** The controlled-widget prose calls the callback `setOpen`, the example omits the `useState` import, and it passes a nonexistent `onEvent` prop. The release-time API already used `open` plus `onOpenChange` and exposed specific callbacks rather than `onEvent`. Preserve the historical release claim but make the sample executable.
- **Low measurement precision (`2026-02-15-v0.1.1.mdx`):** “Reduced bundle size by 400KB” and “saving 120KB” do not say whether the figures are raw, minified, or compressed. Label historical measurement units/baseline where evidence remains available, or qualify them as approximate.
- **Medium release-label integrity (`2026-02-19.mdx`):** Git history shows this began as `2026-02-19-v0.1.2.mdx`, then was renamed when a second v0.1.2 entry was added on March 11. Its optional `version` field is now absent, so the entry renders as an unlabeled product update. Add an explicit product-update label or explain that it is not a package release; do not invent a second package version.
- **High asynchronous-loader race (`2026-04-20-v0.2.0.mdx`):** Both script-tag examples mark `loader.js` as `async` and immediately call `window.Cossistant.init()` in the following inline script. An async external script is not guaranteed to execute before that call, so `window.Cossistant` can be undefined. The loader safely queues calls only after it has run. Use a blocking/deferred ordering that guarantees the stub exists, or install an inline queue before loading asynchronously.
- **Medium upgrade clarity (`2026-04-20-v0.2.0.mdx`):** The upgrade command installs both React and Next even though `@cossistant/next` already depends on the matching React package and the v0.1.0 entry correctly announced that only Next is required. Use framework-specific install tabs. Keep the version-pinned CDN example first and label `latest` as intentionally accepting unreviewed upgrades.

### Navigation metadata review (11 `meta.json` files)

- Every docs page and docs section is included exactly once in its local navigation manifest; no metadata entry points to a missing page. Blog and changelog roots are valid collection metadata.
- **Medium learning-path order:** Root docs navigation puts “Others” before “Self-Host.” Put the implementation/deployment path before contributor/attribution references so the main learning flow is not interrupted.
- **Low label precision:** The “llms.txt” navigation item points to `/llms-full.txt`. Both routes exist, but the label should say “Full docs for LLMs” (or point to `/llms.txt`) so humans and agents can predict the payload.
- **Pass:** Section titles and page order otherwise match their directories and rendered intent.

### Mechanical content checks

- A read-only inventory check reconciled all 43 MDX routes and all 11 navigation manifests: no missing frontmatter, missing local navigation target, omitted local page, or broken docs/blog/changelog path was found.
- All docs pages have title/description frontmatter; all blog pages satisfy their required schema. Changelog `version` is intentionally optional in the source schema, so the February product update needs clearer labeling rather than a fabricated version.
- **Medium heading hierarchy:** `docs/concepts/timeline-items.mdx` jumps from `## Translation Parts` to `#### Translation Part Shape` and `#### Example`. These should be level-three headings. Other apparent heading jumps came from shell comments inside code fences, not rendered document structure.
- ScreenshotFrame entries include descriptive alt text. Blog frontmatter images have no content-level alt field and the schema does not require one; the renderer must derive meaningful article-image alt text rather than silently expose an empty value.

## Coverage Ledger

### Rendered pages (43)

| # | Page | Category | Audit status |
|---:|---|---|---|
| 1 | `blog/facehash-avatar-library-for-react.mdx` | Executable tutorial | Reviewed |
| 2 | `blog/how-to-add-a-support-widget-to-a-nextjs-app.mdx` | Executable tutorial | Reviewed |
| 3 | `blog/how-to-add-a-support-widget-to-a-react-app.mdx` | Executable tutorial | Reviewed |
| 4 | `blog/introducing-cossistant.mdx` | Product/editorial | Reviewed |
| 5 | `changelog/2025-12-23-v0.0.28.mdx` | Historical release record | Reviewed |
| 6 | `changelog/2026-01-16-v0.0.29.mdx` | Historical release record | Reviewed |
| 7 | `changelog/2026-01-31-v0.0.30.mdx` | Historical release record | Reviewed |
| 8 | `changelog/2026-02-10-v0.0.33.mdx` | Historical release record | Reviewed |
| 9 | `changelog/2026-02-13-v0.1.0.mdx` | Historical release record | Reviewed |
| 10 | `changelog/2026-02-15-v0.1.1.mdx` | Historical release record | Reviewed |
| 11 | `changelog/2026-02-19.mdx` | Historical release record | Reviewed |
| 12 | `changelog/2026-03-11-v0.1.2.mdx` | Historical release record | Reviewed |
| 13 | `changelog/2026-04-20-v0.2.0.mdx` | Historical release record | Reviewed |
| 14 | `docs/(root)/index.mdx` | Developer docs | Reviewed |
| 15 | `docs/(root)/what.mdx` | Developer docs | Reviewed |
| 16 | `docs/advanced/index.mdx` | Developer docs | Reviewed |
| 17 | `docs/advanced/primitives.mdx` | Developer docs | Reviewed |
| 18 | `docs/concepts/contacts.mdx` | Developer docs | Reviewed |
| 19 | `docs/concepts/conversations.mdx` | Developer docs | Reviewed |
| 20 | `docs/concepts/index.mdx` | Developer docs | Reviewed |
| 21 | `docs/concepts/timeline-items.mdx` | Developer docs | Reviewed |
| 22 | `docs/others/contributors.mdx` | Developer/reference docs | Reviewed |
| 23 | `docs/others/mcp.mdx` | Developer/reference docs | Reviewed |
| 24 | `docs/others/mentions.mdx` | Attribution/reference | Reviewed |
| 25 | `docs/others/third-party-services.mdx` | Security/reference docs | Reviewed |
| 26 | `docs/quickstart/api-keys.mdx` | Developer docs | Reviewed |
| 27 | `docs/quickstart/index.mdx` | Executable quickstart | Reviewed |
| 28 | `docs/quickstart/react.mdx` | Executable quickstart | Reviewed |
| 29 | `docs/self-host/analytics.mdx` | Self-hosting docs | Reviewed |
| 30 | `docs/self-host/billing.mdx` | Self-hosting docs | Reviewed |
| 31 | `docs/self-host/email-setup.mdx` | Self-hosting docs | Reviewed |
| 32 | `docs/self-host/index.mdx` | Self-hosting docs | Reviewed |
| 33 | `docs/self-host/storage.mdx` | Self-hosting docs | Reviewed |
| 34 | `docs/support-component/customization.mdx` | SDK docs | Reviewed |
| 35 | `docs/support-component/events.mdx` | SDK reference | Reviewed |
| 36 | `docs/support-component/hooks.mdx` | SDK reference | Reviewed |
| 37 | `docs/support-component/index.mdx` | SDK docs | Reviewed |
| 38 | `docs/support-component/routing.mdx` | SDK docs | Reviewed |
| 39 | `docs/support-component/support-state.mdx` | SDK reference | Reviewed |
| 40 | `docs/support-component/text.mdx` | SDK docs | Reviewed |
| 41 | `docs/support-component/theme.mdx` | SDK docs | Reviewed |
| 42 | `docs/support-component/types.mdx` | SDK reference | Reviewed |
| 43 | `docs/user-feedback/index.mdx` | SDK/product docs | Reviewed |

### Navigation and governance files (12)

| File | Audit status |
|---|---|
| `DOCUMENTATION.MD` | Applied as governing rubric |
| `blog/meta.json` | Reviewed |
| `changelog/meta.json` | Reviewed |
| `docs/meta.json` | Reviewed |
| `docs/(root)/meta.json` | Reviewed |
| `docs/advanced/meta.json` | Reviewed |
| `docs/concepts/meta.json` | Reviewed |
| `docs/others/meta.json` | Reviewed |
| `docs/quickstart/meta.json` | Reviewed |
| `docs/self-host/meta.json` | Reviewed |
| `docs/support-component/meta.json` | Reviewed |
| `docs/user-feedback/meta.json` | Reviewed |

## Page-by-Page Findings

All 43 rendered pages are reviewed above. Each non-pass finding includes severity, current-code evidence, and a concrete remediation; unchanged historical claims were assessed in release-time context.

## Cross-Cutting Findings

- Literal MDX fences are not compiled, allowing nonexistent props, duplicate imports, undefined helpers, unsafe async ordering, and docs-mock-only IDs to ship.
- Identity examples repeatedly optimize for the first login but do not handle account switching on a shared browser.
- Quickstarts often omit key acquisition, allowed-origin requirements, observable success, and first-line troubleshooting.
- “Canonical” hook/type references are curated rather than generated and do not declare their scope.
- Tailwind-only examples are routinely presented on pages that claim plain-CSS/framework-neutral support.
- The docs shell already excels at canonical/OG/JSON-LD metadata, raw Markdown, `llms.txt`, copy-source, GitHub, and open-in-AI delivery, but lacks skip navigation and page feedback.
- Self-hosting coverage documents optional vendors before the minimum deployable topology and omits material production-safety warnings.
- Security/privacy language understates collected visitor context and overstates third-party assurances.

## Prioritized Execution Plan

1. Fix every broken or unsafe copy-paste path: React duplicate imports/environment guidance, pending-conversation constant, hook no-op, feedback labels, Facehash props, changelog props/loader ordering, contributor port/commands, license names, and false event/email/visitor claims.
2. Add a deterministic content validator to CI/release checks for frontmatter, navigation coverage, internal links/anchors, heading hierarchy, image alt requirements, and known unsafe snippet patterns; keep literal high-risk examples under source assertions or compilable fixtures.
3. Make the core learning paths complete: API-key link, explicit public key for generic bundlers, allowed-origin note, success checks, troubleshooting, lazy widget guidance, focused imports, and next actions.
4. Reframe self-hosting around prerequisites/topology and harden the storage/email/analytics/billing guidance with explicit production and privacy warnings.
5. Add the playbook-mandated skip link and per-page helpfulness feedback, plus global reduced-motion behavior for documentation chrome.
6. Expand curated references and vendor/MCP tables only from generated or dated sources; label scope and last review so they fail visibly instead of drifting silently.

## Resources

- `apps/web/content/DOCUMENTATION.MD` — mandatory documentation playbook.
- Current repository source, package manifests/exports, tests, OpenAPI contract, and integrations — authoritative product/code evidence.

## Issues Encountered

| Issue | Resolution |
|---|---|
| A reduced-motion search included nonexistent `apps/web/src/styles` | Retained valid results from existing roots and will use `apps/web/src`/actual CSS paths for subsequent searches. |
| A registry search included nonexistent `apps/web/registry` | Used the actual `apps/web/registry.json` and `apps/web/src/registry/` paths discovered by `rg --files`. |
| A theme-token `rg` placed `-g` after explicit file arguments, so ripgrep treated it as a path | Used the valid direct-file output and will place all glob options before paths in later searches. |
