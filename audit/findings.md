# Audit Findings — @cossistant/react / next / browser

Generated 2026-07-02 by 12-dimension multi-agent audit (98 agents). Findings ≥medium were adversarially verified; 28 verifications failed on session limits and are listed as UNCERTAIN (to be hand-verified). 0 findings were refuted.

## Dimension summaries

- **api-dx**: The @cossistant/react public surface is thoughtfully designed overall — explicit exports map (no wildcards, enforced by test), compound components with rich JSDoc, and a publint-clean dist. But there are two high-impact issues: the pub:release/pub:beta/pub:next scripts run `npm publish` from the package root where npm ignores publishConfig.directory (verified via `npm pack --dry-run`: the tarball nests dist/ under a root package.json whose exports point at missing ./src files, so the next scripted release would be a fully broken install), and every primitives module plus two of the five documented provider-optional hooks lack the "use client" directive, breaking the README's own deep-import examples in Next.js RSC. Secondary DX papercuts: "./styles.css" is the only export pointing into gitignored dist/ (unresolvable on fresh clone, breaking the react-vite example), the primitives barrel drops most *Props types (Avatar's are unreachable entirely — no subpath either), and the package root re-exports the internal styled CoButton as `Button`, colliding in name with the headless Button primitive.

- **provider-lifecycle**: The provider/controller lifecycle architecture is mostly well thought out (deferred destroy for StrictMode replay, useSyncExternalStore bridging, updateOptions for live config), but it has several real bugs. The worst: IdentifySupportVisitor deterministically latches `hasIdentified` before the website/visitor has loaded, so visitor identification silently never happens on normal page loads; and the provider's always-defaulted props (`defaultOpen`, `size`, `autoConnect`) are re-pushed through `updateOptions` on every effect re-run, force-closing an open widget when any unstable prop changes identity, stomping externally injected controller config, and killing the localStorage persistence of isOpen/size. Additionally, putting the `support` object in the controller useMemo deps causes a full controller/client/WebSocket teardown-and-reboot on every parent render for the common inline-object case.

- **realtime**: The realtime layer's store logic (seen/typing/processing) is solid, with TTL cleanup and monotonic timestamp guards, and the event filter is correct and well-tested. The serious problems are in the connection lifecycle: events missed during a disconnect are never backfilled (messages silently vanish from open conversations), RealtimeClient.connect()/reconnect() leak duplicate sockets by not clearing the pending backoff timer, connect() cannot recover after a permanent close, and the exported RealtimeProvider permanently kills its client under React StrictMode — the exact bug class already fixed in the sibling SupportProvider. Several smaller issues (stale callbacks, per-event context re-renders that also explain the act warnings, per-render resubscription in the store hooks, and tests that assert against copies of code) round out the picture.

- **hooks**: The hooks layer is generally well-engineered (SSR guards, useSyncExternalStore bridging, timer cleanups, tested draft persistence), but the shared useClientQuery fetch abstraction has three verified correctness bugs that hit every consumer: background fetch failures escape as unhandled promise rejections into the host app, store-derived refetchOnMount flags cause a duplicate network request on every successful initial load (conversation list, conversation, and timeline all double-fetch), and caller-supplied refetch args poison argsRef so switching conversations after paginating fetches the new conversation with the old conversation's cursor. The most user-damaging finding is in the composer wiring: useMessageComposer fires sendMessage.mutate without awaiting, which defeats useMultimodalInput's tested rollback contract and permanently loses the visitor's typed message, attachments, and localStorage draft when a send fails. Secondary issues include a dedup key that can make fetchNextPage a no-op, a transition hook that strands the launcher icon invisible on rapid toggles, and sound effects that are silent in Chrome/Safari because the eagerly-created AudioContext is never resumed. All findings were verified by reading the code and, where behavioral, reproduced with temporary bun tests (since removed).

- **primitives-a11y**: The primitives layer is generally well-structured (consistent forwardRef + useRenderElement pattern, sensible role/aria defaults on the timeline, working focus trap and Escape handling in Window), but the core composition utility has real merge bugs: the asChild Slot clobbers child event handlers and styles, and refs are re-created every render. Two user-visible input bugs stand out — Enter submits mid-IME composition for CJK users, and the Window primitive throws without a provider despite advertising controlled props. Accessibility is partially wired: the trigger/window pair lacks aria-controls and a dialog name, the star-rating selector exposes no selected state to AT, and several timeline aria-labels are nonsensical. Timeline correctness is solid for append/replace but has no scroll anchoring for the top-pagination path it explicitly exposes, and sender precedence differs between TimelineItem and TimelineItemGroup.

- **feedback**: The feedback module is well-structured (clean context layering, helpful out-of-provider errors, good SSR safety, solid hook test coverage) but the default panel ships two real user-facing bugs: failed submissions are completely silent (the hook computes submitError but the panel never renders it), and passing onClick to Feedback.Trigger silently replaces the internal toggle so the widget stops opening. There are also meaningful a11y gaps (unnamed aria-modal dialog, rating state invisible to assistive tech), an input-wipe bug when topics/defaultTopic resolve asynchronously, and a footprint miss: the module imports the full @floating-ui/react interactions package when only the 10KB @floating-ui/react-dom positioning API is used.

- **support-ui**: The default <Support /> widget is well-architected (compound components, slots, persisted store, locale system), but several real defects undermine it: the provider re-applies `defaultOpen` (defaulted to `false`) through `updateOptions`, which force-closes the widget on host re-renders and makes the persisted open-state feature dead code; the window primitive traps Tab for the entire document while the non-modal floating widget is open; and `theme="light"` silently doesn't force light mode. A second tier of issues blocks i18n (hardcoded English relative times and tool strings, region-subtag content overrides never resolving) and degrades a11y/styling (non-`co-` Tailwind color utilities silently missing from the published stylesheet, icon-only buttons with no accessible names).

- **next-parity**: @cossistant/next is a structurally sound thin wrapper: all 9 re-export entries carry "use client" banners that are preserved verbatim in the minified dist output (verified in both the committed dist and a fresh tsdown build), styles.css/support.css are one-line @import shims onto @cossistant/react rather than stale copies, and prepare-package.ts correctly resolves workspace:* to 0.2.0. The real problems are in publish output and parity: the shipped .d.ts files import a runtime helper module that has no declaration file (verified TS7016 for consumers with skipLibCheck:false), and next exposes only 12 of react's ~41 subpath exports, so the deep-import style that react's own README advertises fails with ERR_PACKAGE_PATH_NOT_EXPORTED when ported to @cossistant/next. Remaining issues are polish: root barrel divergence (next exports utils, react does not), a broken docs URL in a near-empty npm README, dangling sourceMappingURL comments after map deletion, and an orphaned @types/react peerDependenciesMeta entry.

- **browser-embed**: The embed architecture is well designed — loader-derived asset URLs (no data-attribute injection surface), shadow-DOM CSS isolation with :root-free compiled CSS, a clean teardown API, and, contrary to the audit hypothesis, the preact/compat aliasing IS wired into tsdown.embed.config.ts and verified present in dist/embed/widget.js (no React/scheduler markers). However, the core "script-tag story" is broken as documented: the README's async-loader + immediate init() snippet throws a TypeError because no pre-load stub exists, and the queue replay hard-aborts (dropping init) if any method precedes init. The 191KB-gzip widget.js is dominated by avoidable payload — all of zod v4 + @hono/zod-openapi pulled in for two zod-free helper functions, plus ~24KB of inline base64 audio — and npm packaging has real hazards (react ^19 as a hard dependency vs @cossistant/react's >=18 peer range risks dual-React crashes; the tarball ships ~580KB of duplicated vendored d.ts).

- **build-packaging**: The publish pipeline's core machinery (prepare-package.ts export rewriting, rewrite-dist-types.ts, check-package-output.ts) is solid — all ~40 export subpaths verified present and correctly mapped in dist/package.json — but the release scripts themselves are a landmine: npm ignores publishConfig.directory, so running the documented pub:release from the package root packs a broken tarball (dist/-prefixed files plus a root package.json whose main/exports point at ./src/*, absent from the tarball). On footprint, the biggest issue is that zod v4 (with its full i18n locale set) plus @hono/zod-openapi is bundled into widget.js (~200KB of the 679KB) and into every @cossistant/react consumer's app bundle via @cossistant/core's client importing runtime helpers from a zod-heavy @cossistant/types module. Smaller issues: ulid is a dead dependency of @cossistant/react, dist ships minified with no sourcemaps and stripped @__PURE__ annotations, and "headless" primitives pull the full 15KB icon registry plus tailwind-merge.

- **ssr-safety**: No module-scope browser-API access exists (nothing crashes at import time in Node), and nearly all window/document/navigator/observer usage is correctly confined to effects and handlers. The two real SSR problems are structural: (1) the support store synchronously rehydrates persisted state (including isOpen) from localStorage during the first client render, guaranteeing hydration mismatches for returning visitors under Next.js SSR, and (2) every ./primitives/* subpath entry plus several hook/util entries ship without "use client" (verified in both src and dist), so importing them from a Server Component crashes — a major gap for a package advertised as Next.js-ready. A cluster of render-time Date/locale formatting sites (day separators, message timestamps, formatTimeAgo, default-message timestamps that render "Invalid Date" in SSR HTML) produce hydration mismatches whenever the widget is server-rendered open (defaultOpen or persisted-open).

- **docs-accuracy**: Docs accuracy is generally strong: every named import, hook signature, slot prop, data attribute, theme token, and registry claim I checked in the React/Next quickstarts, support-component pages, primitives, and user-feedback docs matches the source. The real failures cluster in three areas: (1) every provider-free snippet constructs `new CossistantClient({ publicKey })`, which fails to compile and fetches "undefined/..." at runtime because `apiUrl`/`wsUrl` are required with no defaults; (2) the browser CDN embed is broken as documented (async loader + immediate `window.Cossistant.init()` throws) and has zero docs-site coverage; (3) env-var guidance outside Next.js/Vite (the "Other" tab and the AI-prompt/onboarding code that uses `process.env.COSSISTANT_API_KEY` in Vite entry files) produces configurations that can never resolve a key in the browser.

- **state-consistency**: Cross-cutting data flow in @cossistant/react is architecturally sound — optimistic sends reuse client-generated ULIDs that the server preserves, so the store's merge-by-id cleanly dedupes WS echoes, and seen/read-receipt maps are keyed to avoid double counting. The serious problems are in failure and lifecycle paths: a failed send destroys the user's typed message (composer clears before the fire-and-forget mutation settles while core removes the optimistic item), client-clock createdAt sent during conversation creation gets 400-rejected for visitors with >5-minute clock skew, nothing resyncs the timeline after a WebSocket drop, and the standalone RealtimeProvider is permanently dead under StrictMode. Secondary issues include a sticky pagination cursor in useClientQuery that leaks into later refetches/conversation switches and prop-change desync in useConversationLifecycle.

## CONFIRMED findings (verified against code)

### C-01 [CRITICAL] [bug] IdentifySupportVisitor latches hasIdentified before visitor loads, so identification never runs
- **File**: packages/react/src/identify-visitor.tsx:83  |  **Dimension**: provider-lifecycle
- **Description**: The identify effect runs on mount (child effects fire before the provider's start effect even kicks off fetchWebsite), so `website` is null and `useVisitor().identify` bails with a console.warn and returns null (use-visitor.ts:118-123 `if (!visitorId) { safeWarn(...); return null; }`). The component then unconditionally calls `setHasIdentified(true)` anyway. When the website/visitor loads moments later, the effect re-runs but Case 1 is permanently blocked by `hasIdentified`, so the visitor is never associated with a contact. The same latch also permanently swallows transient network failures (controller.identify catches and returns null), and there is no in-flight guard, so StrictMode's replayed effect can fire duplicate identify POSTs when the visitor is already loaded. There are zero tests for this exported component.
- **Evidence**: `await identify({ externalId, email, name: name ?? undefined, image: image ?? undefined });
setHasIdentified(true);`
- **Suggested fix**: At the top of shouldIdentify, bail early when `!visitor` (visitor not yet loaded); only call `setHasIdentified(true)` when `identify()` returns a non-null result; and guard concurrent runs with a `useRef` in-flight flag. Add a regression test that mounts IdentifySupportVisitor before the website fetch resolves and asserts identify is called once after it resolves.
- **Verifier**: Confirmed by both code reading and an empirical reproduction against the real SupportProvider. Code chain: (1) provider.tsx renders children unconditionally and only calls controller.start() in its own effect (provider.tsx:263), which runs AFTER child effects; the controller's initial state is `website: null` with no synchronous cache hydration (core/support-controller.ts:390), so on first commit 

### C-02 [HIGH] [build] pub:release publishes a broken tarball: npm ignores publishConfig.directory
- **File**: packages/react/package.json:140  |  **Dimension**: api-dx
- **Description**: The publish scripts run `npm publish` from the package root, relying on `"publishConfig": { "directory": "dist" }`. That key is a pnpm extension — npm (verified with npm 11.16.0) ignores it and packs the root layout. Verified with `npm pack --dry-run --json` in packages/react: the tarball contains 266 files all under `dist/` plus the ROOT package.json, whose `main`/`exports` point at `./src/index.ts` — which is excluded by `"files": ["dist"]`. Anyone installing that release gets a package where every import fails to resolve. The currently published 0.2.0 is dist-shaped (so a past publish was done differently, e.g. cd dist), but the checked-in scripts are the documented path and will ship a dead package next release. packages/next/package.json line 91 has the identical landmine.
- **Evidence**: `"pub:release": "bun run build && npm publish --access public",`
- **Suggested fix**: Publish the rewritten dist manifest directly: `"pub:release": "bun run build && npm publish ./dist --access public"` (npm packs a folder's own package.json when given a path). Apply the same to pub:beta/pub:next in both packages/react and packages/next, and delete the ignored publishConfig.directory or keep it only for pnpm users.
- **Verifier**: Verified end-to-end. packages/react/package.json:140 runs `npm publish --access public` from the package root, relying on `publishConfig.directory: "dist"` (lines 130-133), which npm (11.16.0 installed) ignores — it is a pnpm extension. A live `npm pack --dry-run --json` in packages/react reproduces the broken tarball: 266 files, all under dist/ plus the ROOT package.json, whose main/exports point

### C-03 [HIGH] [ssr] All primitives and two documented provider-optional hooks are missing "use client"
- **File**: packages/react/src/primitives/trigger.tsx:1  |  **Dimension**: api-dx
- **Description**: The root barrel (src/index.ts), ./hooks barrel, ./provider, ./support, ./feedback and ./realtime all carry "use client", but none of the subpath-exported primitives modules do (primitives/index.ts, index.parts.ts, button.tsx, trigger.tsx, window.tsx, multimodal-input.tsx, conversation-timeline.tsx, timeline-item.tsx, timeline-item-group.tsx, router.tsx, day-separator.tsx, avatar/*), nor do hooks/use-create-conversation.ts and hooks/use-send-message.ts (while their siblings use-file-upload/use-submit-feedback/use-feedback-form have it), nor internal/hooks.ts and utils/use-render-element.tsx. All of these call React hooks (trigger.tsx uses useCallback/useStoreSelector). The README's headless quickstart tells users to `import { SupportTrigger } from "@cossistant/react/primitives/trigger"` — pasting that into a Next.js App Router file yields the confusing "useState only works in a Client Component" error instead of an automatic client boundary. tsdown demonstrably preserves the directive per-module (dist/provider.js starts with "use client"; dist/primitives/trigger.js does not), so this is purely missing source banners. Radix/shadcn-quality peers ship the directive on every client entry.
- **Evidence**: `import * as React from "react";
import { useStoreSelector } from "../hooks/private/store/use-store-selector";`
- **Suggested fix**: Add "use client"; as the first line of every subpath-exported client module: all files under src/primitives/ (including avatar/*), src/hooks/use-create-conversation.ts, src/hooks/use-send-message.ts, src/internal/hooks.ts, and src/utils/use-render-element.tsx.
- **Verifier**: Verified in source: only timeline-item-attachments.tsx among ~30 primitives files has "use client"; trigger.tsx calls React.useCallback (lines 120, 137) and useStoreSelector (line 135) with no directive. hooks/use-create-conversation.ts and use-send-message.ts lack it while sibling use-file-upload.ts has it at line 1, proving the omission is accidental. package.json exports expose all these as dir

### C-04 [HIGH] [bug] Failed feedback submission is completely silent in the default panel
- **File**: packages/react/src/feedback/components/panel.tsx:248  |  **Dimension**: feedback
- **Description**: useFeedbackForm exposes `submitError` and per-field `error` strings, but FeedbackPanel never renders any of them. On a network failure or thrown client error (e.g. 'Visitor context is unavailable.' from use-submit-feedback.ts:85), handleSubmit catches the rejection ('Error state is owned by useSubmitFeedback'), isPending flips back to false, and the button label returns to 'Send' with zero visible or announced feedback. The user believes their feedback was sent (or is confused why nothing happened) and their submission is lost. index.test.tsx:143 even asserts `expect(source).not.toContain('role="alert"')`, locking in the absence of an error surface.
- **Evidence**: `onClick={() => {
	void feedback.handleSubmit();
}}`
- **Suggested fix**: Render `feedback.submitError` (and field errors) in the form footer inside a `role="alert"` element, e.g. `{feedback.submitError ? <p role="alert" className="text-co-destructive text-xs">{feedback.submitError}</p> : null}`, and update the index.test.tsx assertion that currently forbids role="alert".
- **Verifier**: Verified in code: FeedbackPanel (packages/react/src/feedback/components/panel.tsx) never renders feedback.submitError or any fields.*.error — grep confirms submitError is consumed nowhere outside use-feedback-form.ts. handleSubmit swallows rejections (use-feedback-form.ts:373 'catch { // Error state is owned by useSubmitFeedback. }'), so on network/API failure or 'Visitor context is unavailable.' 

### C-05 [HIGH] [bug] Consumer onClick on Feedback.Trigger silently replaces the internal toggle, breaking open/close
- **File**: packages/react/src/feedback/internal/trigger.tsx:67  |  **Dimension**: feedback
- **Description**: FeedbackTriggerPrimitive builds its props as `{ ..., onClick: toggle, ...props }` — the consumer's rest props are spread after the internal onClick. FeedbackTriggerProps extends ButtonHTMLAttributes, so `<Feedback.Trigger onClick={trackClick}>` type-checks fine, but the spread replaces `toggle` entirely and the widget can never open. The inverse happens in asChild mode: the Slot in use-render-element.tsx (line 74, `React.cloneElement(children, { ...props, ref, className })`) overwrites the child element's own onClick with toggle, silently discarding the consumer handler. Neither path composes handlers.
- **Evidence**: `"aria-expanded": isOpen,
onClick: toggle,
...props,`
- **Suggested fix**: Compose handlers instead of overwriting: extract the consumer's onClick and call both, e.g. `onClick: (e) => { props.onClick?.(e); if (!e.defaultPrevented) toggle(); }` (Radix composeEventHandlers pattern), and do the same for the child's handlers in the Slot's cloneElement.
- **Verifier**: Verified in code. (1) Non-asChild: packages/react/src/feedback/internal/trigger.tsx:63-68 builds props as `onClick: toggle, ...props` — the consumer rest-props spread comes after the internal handler, so a consumer onClick fully replaces toggle. The public Feedback.Trigger (src/feedback/index.tsx:213-218) is a passthrough whose props extend ButtonHTMLAttributes, so `<Feedback.Trigger onClick={fn}>

### C-06 [HIGH] [bug] Failed message send permanently loses the visitor's typed message and attachments
- **File**: packages/react/src/hooks/use-message-composer.ts:218  |  **Dimension**: hooks
- **Description**: useMultimodalInput.submit() implements optimistic clearing with rollback: it snapshots the message/files, clears the composer, awaits onSubmit, and on rejection restores the message, files, and localStorage draft (this contract is explicitly tested in draft-persistence.test.tsx: 'restores the draft after a failed submit' and 'keeps the persisted draft while submit is in flight'). useMessageComposer breaks the contract: its async onSubmit calls the fire-and-forget `sendMessage.mutate(...)` (which internally does `void mutateAsync(opts).catch(() => {})`) and returns immediately. submit() therefore treats every send as success: it revokes file URLs and calls reset(), which clears the persisted draft, before the network request even completes. When the send later fails, the catch/rollback path never runs, and the core client also removes the optimistic timeline item (client.ts sendMessage catch -> removeTimelineItem), so the visitor's text and attachments vanish everywhere with no way to recover. It also makes the docstring on draftPersistenceId ('message text is restored after reloads/crashes until submit succeeds') false — the draft is cleared at call time, not on success.
- **Evidence**: `onSubmit: async ({ message: messageText, files }) => {
  // Stop typing indicator
  stopTyping();
  // Send the message
  sendMessage.mutate({`
- **Suggested fix**: In useMessageComposer's onSubmit, await the send so failures propagate to useMultimodalInput's rollback: `await sendMessage.mutateAsync({ conversationId, message: messageText, files, ... })` (drop the inner onError wiring or dedupe the double onError call). This makes submit clear the draft only after the request succeeds and restores the composer on failure.
- **Verifier**: Verified end-to-end. useMultimodalInput.submit() (packages/react/src/hooks/private/use-multimodal-input.ts:193-224) implements snapshot/clear/await-onSubmit with restore-on-throw, and this contract is explicitly tested (draft-persistence.test.tsx:179, :224). useMessageComposer's onSubmit (use-message-composer.ts:218) calls sendMessage.mutate(), which is fire-and-forget: use-send-message.ts:310-314

### C-07 [HIGH] [bug] Every background fetch failure surfaces as an unhandled promise rejection in the host app
- **File**: packages/react/src/hooks/private/use-client-query.ts:197  |  **Dimension**: hooks
- **Description**: execute() rethrows on failure (`throw normalized`, line 175) after storing the error in state, but all effect-driven call sites discard the promise without a catch: initial/dependency fetch (line 197 `void execute(argsRef.current)`), the refetchInterval timer (line 215), and the window-focus/visibility refetch (line 237). Any failed request from useConversations, useConversation, useConversationTimelineItems, useWebsiteStore, etc. (e.g. visitor goes offline, ad-blocker blocks the API, transient 5xx during polling) produces an unhandled promise rejection in the embedding application. Verified by mounting a probe: bun test reported the queryFn error escaping uncaught through use-client-query.ts:197. For an embeddable SDK this pollutes host error trackers (Sentry `onunhandledrejection`), spams the console, and can crash runtimes that treat unhandled rejections as fatal.
- **Evidence**: `void execute(argsRef.current);
...
const normalized = toError(raw);
setError(normalized);
setIsLoading(false);
throw normalized;`
- **Suggested fix**: Only rethrow for imperative callers: have the internal effect/interval/focus call sites use `execute(argsRef.current).catch(() => {})` (error is already captured in state), or add a `shouldThrow` flag to execute that is true only when invoked via the public `refetch`.
- **Verifier**: Verified in packages/react/src/hooks/private/use-client-query.ts: execute() rethrows after storing error in state (lines 171-175 'throw normalized'), and all three effect-driven call sites discard the promise with no catch — mount/dependency effect (line 197 'void execute(argsRef.current);'), refetchInterval timer (line 215), and focus/visibilitychange handler (line 237). The rejection path is rea

### C-08 [HIGH] [bug] Store-derived refetchOnMount flag triggers a duplicate network request on every successful initial load
- **File**: packages/react/src/hooks/private/use-client-query.ts:198  |  **Dimension**: hooks
- **Description**: The mount/refetch effect includes `refetchOnMount` in its dependency array, and once `hasMountedRef.current` is true any dep change unconditionally fetches (`shouldFetchInitially = hasMountedRef.current ? true : ...`). useConversation passes `refetchOnMount: !conversation`, useConversations passes `selection.conversations.length === 0`, and useConversationTimelineItems passes `selection.items.length === 0` — all flip from true to false exactly when the first fetch lands in the store. That flip re-runs the effect and issues a second, identical request (not deduplicated, because the first already completed and was removed from the in-flight map). Verified with a probe test: FETCH COUNT: 2. Every widget open therefore double-fetches the conversation list, and every conversation open double-fetches the conversation and its timeline page — doubling API load for all users.
- **Evidence**: `const shouldFetchInitially = hasMountedRef.current
  ? true
  : refetchOnMount || !hasFetchedRef.current;
...
}, [enabled, execute, refetchOnMount, ...dependencies]);`
- **Suggested fix**: Remove `refetchOnMount` from the effect dependency array and read it through a ref (`refetchOnMountRef.current`) inside the effect, so changes to the flag alone never re-trigger a fetch; only `enabled`, `execute`, and `dependencies` should re-run it.
- **Verifier**: Independently reproduced: a probe test mounting useClientQuery with a store-derived refetchOnMount flag (exactly the useConversation pattern) yielded FETCH COUNT: 2. Mechanism verified in use-client-query.ts:187-198 — refetchOnMount is in the effect dep array, and after first mount shouldFetchInitially is unconditionally true, so the true→false flip (caused by core client ingesting the first respo

### C-09 [HIGH] [bug] Stale pagination cursor is reused when switching conversations, fetching the wrong timeline page
- **File**: packages/react/src/hooks/private/use-client-query.ts:141  |  **Dimension**: hooks
- **Description**: execute() persists caller-supplied args into argsRef (`argsRef.current = nextArgs`), and argsRef is only re-synced when `initialArgs` identity changes (lines 125-127). In useConversationTimelineItems, initialArgs is `baseArgs`, memoized solely on `options.limit`/`options.cursor` — it does NOT change when the conversation switches. So after fetchNextPage({ cursor: nextCursor }) runs for conversation A, argsRef holds A's cursor; when the user switches to conversation B, the dependency-driven effect calls `execute(argsRef.current)` and queryFn issues `getConversationTimelineItems({ conversationId: B, cursor: <A's cursor> })`, loading a wrong/partial page (or nothing) for the new conversation. Verified with a probe test mimicking the real memoized baseArgs: CALLS ended with {"cursor":"cursor-from-conv-A","convId":"conv-B"}. The same poisoning makes refetchInterval/focus refetches re-request the old paginated page instead of the newest items after any fetchNextPage.
- **Evidence**: `const nextArgs = args ?? argsRef.current;
argsRef.current = nextArgs;`
- **Suggested fix**: Do not persist explicit refetch args into argsRef (use them for that call only: `const nextArgs = args ?? argsRef.current;` without the assignment), or reset `argsRef.current = initialArgs` whenever the effect's `dependencies` change so a conversation switch always starts from the base args.
- **Verifier**: Verified by code reading and an independent runtime probe. use-client-query.ts:141 persists explicit refetch args into argsRef, which is only re-synced when initialArgs identity changes (lines 125-127). In useConversationTimelineItems, initialArgs (baseArgs) is memoized only on options.limit/options.cursor (use-conversation-timeline-items.ts:60-70), so a conversation switch leaves argsRef holding 

### C-10 [HIGH] [bug] Enter submits mid-IME-composition in MultimodalInput
- **File**: packages/react/src/primitives/multimodal-input.tsx:52  |  **Dimension**: primitives-a11y
- **Description**: The keydown handler submits on Enter without checking KeyboardEvent.isComposing (or keyCode 229). For CJK users typing with an IME, pressing Enter to confirm a candidate word fires onSubmit, sending a half-composed message. grep confirms 'isComposing' appears nowhere in the package, and the default widget composer wires this primitive directly to send (support/components/multimodal-input.tsx:210).
- **Evidence**: `if (e.key === "Enter" && !e.shiftKey) {
	e.preventDefault();
	onSubmit?.();`
- **Suggested fix**: Guard the submit branch: `if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing)`.
- **Verifier**: Verified at packages/react/src/primitives/multimodal-input.tsx:51-55: handleKeyDown submits on Enter+!shiftKey with e.preventDefault() and onSubmit?.() with no isComposing/keyCode-229 guard; grep confirms 'isComposing' appears nowhere in packages/react/src. The default widget composer (src/support/components/multimodal-input.tsx:210) wires this primitive's onSubmit to handleSubmit which sends the 

### C-11 [HIGH] [bug] asChild Slot clobbers the child's own event handlers and style
- **File**: packages/react/src/utils/use-render-element.tsx:74  |  **Dimension**: primitives-a11y
- **Description**: Slot spreads the parent-injected props over the child via cloneElement, so any prop the primitive injects (onClick, onKeyDown, onScroll, style, type...) silently replaces the child's identically named prop instead of composing. Example: `<Trigger asChild><button onClick={track}>Help</button></Trigger>` — the child's onClick is dropped and replaced by the trigger's toggle; `<ConversationTimeline asChild><div style={{padding:8}}/>` loses the child's style because the mask style object replaces it. Radix Slot composes handlers (child first, then slot) and merges style; this Slot only merges className.
- **Evidence**: `return React.cloneElement(children, {
	...props,
	ref: mergedRef,
	className: [(children.props as any).className, props.className]`
- **Suggested fix**: In Slot, compose function props (`(...a) => { childProps[k]?.(...a); props[k]?.(...a); }` for keys matching /^on[A-Z]/), merge style objects (`{...props.style, ...childProps.style}`), keep the existing className merge.
- **Verifier**: Verified at packages/react/src/utils/use-render-element.tsx:74-80: Slot spreads parent-injected props over the child via cloneElement, merging only className and ref — any same-named child prop is replaced. Concretely reachable: primitives/trigger.tsx:181 injects `onClick: onClick ?? toggle`, so `<Trigger asChild><button onClick={track}>` drops `track` (and the asChild pattern is explicitly docume

### C-12 [HIGH] [bug] updateOptions effect re-applies defaultOpen on every re-run, force-closing an open widget
- **File**: packages/react/src/provider.tsx:235  |  **Dimension**: provider-lifecycle
- **Description**: SupportProviderInner always passes `defaultOpen` (defaulted to false at line 202) into `controller.updateOptions(...)`, and the core controller translates it into `supportStore.updateConfig({ isOpen: nextOptions.defaultOpen })` (support-controller.ts:748-750). The effect's dep array includes `onWsConnect`, `onWsDisconnect`, `onWsError`, `defaultMessages`, `quickOptions`, and `support` — all of which are typically inline literals in consumer JSX. Any parent re-render with an unstable prop identity re-runs the effect and snaps `isOpen` back to `defaultOpen`, closing the widget while the user is interacting with it (e.g. mid-message). The same call also stomps `size`.
- **Evidence**: `controller.updateOptions({
	autoConnect,
	defaultMessages: defaultMessages ?? [],
	quickOptions: quickOptions ?? [],
	size,
	defaultOpen,`
- **Suggested fix**: Treat `defaultOpen` as init-only: pass it to `createSupportController` but remove it from the `updateOptions` call (and from the effect deps). If live control of open state is desired, expose a separate controlled `open` prop instead of reusing `defaultOpen`.
- **Verifier**: Verified end-to-end: provider.tsx:202 defaults defaultOpen to false so it is never undefined; the effect at provider.tsx:229-252 unconditionally passes it to controller.updateOptions with deps including defaultMessages, quickOptions, support, and the three onWs* callbacks (typically inline literals in consumer JSX); support-controller.ts:748-751 translates it into supportStore.updateConfig({ isOpe

### C-13 [HIGH] [bug] Events missed while the WebSocket is down are never backfilled after reconnect
- **File**: packages/core/src/support-controller.ts:579  |  **Dimension**: realtime
- **Description**: There is no replay or refetch mechanism after a reconnect. handleRealtimeStateChange only fires the onWsConnect/onWsDisconnect callbacks; nothing refetches conversations or timeline items when the connection transitions disconnected->connected. The widget's timeline hook (packages/react/src/hooks/use-conversation-timeline-items.ts:100-102) defaults refetchOnWindowFocus to false and only refetches on mount when the store is empty. So if the socket drops (network blip, laptop sleep, backoff up to 30s), any timelineItemCreated/conversationUpdated events emitted during the gap are permanently invisible in an open conversation until a full page reload — the visitor sits waiting for an agent reply that already arrived.
- **Evidence**: `const handleRealtimeStateChange = () => { ... runtimeOptions.onWsConnect?.(); ... lastRealtimeStatus = realtimeState.status;`
- **Suggested fix**: In handleRealtimeStateChange, on a disconnected->connected transition (when a previous connection existed), force-refresh state: void currentClient.listConversations() and re-fetch timeline items for conversations already in timelineItemsStore (or expose a resync() the react hooks trigger on isConnected rising edge).
- **Verifier**: Verified in code: (1) handleRealtimeStateChange (packages/core/src/support-controller.ts:579-607) only invokes onWsConnect/onWsDisconnect/onWsError callbacks on status transitions — no refetch of conversations or timeline items. (2) The core client constructs RealtimeClient with only onEvent (client.ts:161-164); RealtimeClient's socket.onopen (realtime-client.ts:591-608) just resets heartbeat/pres

### C-14 [HIGH] [bug] RealtimeProvider permanently destroys its client under React StrictMode and never reconnects
- **File**: packages/react/src/realtime/provider.tsx:121  |  **Dimension**: realtime
- **Description**: The unmount cleanup destroys the RealtimeClient and nulls the ref, but StrictMode's simulated unmount/remount re-runs effects without re-rendering. On remount the connect effect calls client.connect(auth) on the already-destroyed instance (RealtimeClient.connect early-returns when destroyed), and nothing recreates the client because creation only happens during render. With Next.js reactStrictMode (default in dev, and enabled in apps/web), realtime stays dead after mount until some unrelated parent re-render happens to recreate the client. This is the same bug class commit 41fd069d ('fix: react strict mode') fixed in src/provider.tsx via deferred disposal, but realtime/provider.tsx was not fixed.
- **Evidence**: `useEffect(
	() => () => {
		clientRef.current?.destroy();
		clientRef.current = null;
	},
	[]
);`
- **Suggested fix**: Mirror the deferred-disposal pattern from src/provider.tsx: schedule destroy() in a setTimeout(0) that the effect setup cancels on remount; alternatively recreate the client inside the connect effect when clientRef.current is null or destroyed.
- **Verifier**: Verified end-to-end: realtime/provider.tsx:121-127 destroys the client and nulls the ref on cleanup with no deferral; the connect effect (lines 103, 112-118) closes over the render-scope client, and StrictMode's simulated remount re-runs effects without re-rendering, so it calls connect() on the destroyed instance, which early-returns (core/realtime-client.ts:466-468, destroyed flag is irreversibl

### C-15 [HIGH] [bug] connect()/reconnect() do not clear a pending reconnect timer, producing duplicate orphaned sockets
- **File**: packages/core/src/realtime-client.ts:476  |  **Dimension**: realtime
- **Description**: scheduleReconnect() arms a timer that calls openSocket(). disconnect() clears it, but connect() (on auth change) and reconnect() do not. If auth changes during a backoff window (e.g. dashboard session token refresh while offline) or reconnect() is called, closeSocket()+openSocket() create socket A, then the stale timer fires and openSocket() creates socket B, overwriting this.socket. Socket A completes its handshake but its handlers early-return on `this.socket !== socket` and it is never closed — a leaked live connection the server counts as a second presence, per occurrence. This is directly reachable through @cossistant/react's RealtimeProvider (auth prop change, reconnect()).
- **Evidence**: `this.auth = resolved;
		this.reconnectAttempt = 0;
		this.closeSocket();
		this.openSocket();`
- **Suggested fix**: Call this.clearReconnectTimer() at the top of connect() and reconnect() (or inside openSocket()), and have openSocket() call closeSocket() first if this.socket is non-null.
- **Verifier**: Verified in packages/core/src/realtime-client.ts: connect() (L465-480) and reconnect() (L489-496) call closeSocket()+openSocket() without clearReconnectTimer(), while disconnect() (L483) does clear it — proving the omission. scheduleReconnect() (L788-791) arms a setTimeout (up to 30s backoff) that calls openSocket(), and openSocket() (L588-589) unconditionally creates a new WebSocket and overwrite

### C-16 [HIGH] [ssr] All ./primitives/* subpath entries (plus several hook/util entries) ship without "use client" despite using hooks
- **File**: packages/react/src/primitives/index.ts:1  |  **Dimension**: ssr-safety
- **Description**: package.json exposes 20+ direct subpaths (./primitives, ./primitives/window, ./primitives/timeline-command-block, ./hooks/use-create-conversation, ./hooks/use-send-message, ./internal/hooks, ./utils, ./utils/use-render-element, …). None of these files contain a "use client" directive, yet they call useState/useEffect/useRef (e.g., primitives/window.tsx:93 'React.useRef<HTMLDivElement>(null)', hooks/use-send-message.ts:180 'useState(false)'). Verified the built output preserves directives per-file: dist/index.js starts with "use client" but dist/primitives/index.js, dist/primitives/window.js, dist/hooks/use-send-message.js, dist/internal/hooks.js and dist/utils/use-render-element.js do not. Importing any of these subpaths from a Next.js App Router Server Component crashes with an invalid-hook/react-server error — the shadcn-style consumption pattern this package is built around. Inconsistently, sibling entries use-feedback-form/use-file-upload/use-submit-feedback DO have the directive.
- **Evidence**: `export * from "./index.parts";  // src/primitives/index.ts — no "use client"; dist/primitives/index.js: import{__export as e}from"../_virtual/rolldown_runtime.js"...`
- **Suggested fix**: Add "use client"; as the first line of every subpath entry module that defines or re-exports hook-using code (all primitives/*.tsx, primitives/index.ts, hooks/use-create-conversation.ts, hooks/use-send-message.ts, internal/hooks.ts, utils/use-render-element.tsx, utils/index.ts), matching what Radix ships; verify dist output retains the banner.
- **Verifier**: Verified end-to-end. package.json exposes ./primitives, ./primitives/window, ./primitives/trigger, ./hooks/use-send-message, ./internal/hooks, ./utils, ./utils/use-render-element as direct subpaths, and none of those source files contain "use client" while they call client-only hooks (src/primitives/window.tsx:93 React.useRef; src/hooks/use-send-message.ts:180 useState(false); src/primitives/trigg

### C-17 [HIGH] [bug] SupportProvider always re-applies defaultOpen=false, force-closing the widget and defeating persisted open state
- **File**: packages/react/src/provider.tsx:202  |  **Dimension**: support-ui
- **Description**: SupportProviderInner defaults `defaultOpen = false` and passes it (always defined) to createSupportController and, on every dependency change, to controller.updateOptions. Core treats any defined defaultOpen as an imperative setter: `if (nextOptions.defaultOpen !== undefined) { supportStore.updateConfig({ isOpen: nextOptions.defaultOpen }); }` (packages/core/src/support-controller.ts:748). The updateOptions effect depends on defaultMessages, quickOptions, support, and onWs* callbacks — all commonly passed inline — so any host re-render that changes one of those identities snaps the widget closed while the visitor is using it. Even in the static case, the mount-time clobber means the localStorage-persisted `isOpen` (explicitly persisted in core's support-store) is overwritten to false on every page load, so the widget never stays open across MPA/SSR navigations, and <Support defaultOpen> re-opens on every load even after the user closed it.
- **Evidence**: `size = "normal",
	defaultOpen = false,
}: SupportProviderProps) {  ...  React.useEffect(() => {
		controller.updateOptions({ ... defaultOpen, ... });
	}, [autoConnect, controller, defaultMessages, defaultOpen, onWsConnect, ...]);`
- **Suggested fix**: Default `defaultOpen` to `undefined` in SupportProvider/SupportProviderInner and omit it from updateOptions entirely (apply it only once at controller creation, and only when no persisted state exists). In core, remove the `defaultOpen` branch from updateOptions so it can never act as a runtime open/close setter.
- **Verifier**: Verified by code reading and a live repro against the real controller. (1) SupportProviderInner defaults defaultOpen=false (packages/react/src/provider.tsx:202,359) and always passes it defined to both createSupportController (line 216) and controller.updateOptions (line 235). (2) Core treats any defined defaultOpen as an imperative setter: support-controller.ts:748-751 `supportStore.updateConfig(

### C-18 [HIGH] [bug] Focus trap hijacks Tab for the whole document while the non-modal floating widget is open
- **File**: packages/react/src/primitives/window.tsx:192  |  **Dimension**: support-ui
- **Description**: SupportWindow installs a document-level keydown handler whenever the widget is open (trapFocus defaults to true). The floating widget has no backdrop and the host page stays fully interactive, but if focus is anywhere on the host page the handler does `if (!container.contains(active)) { e.preventDefault(); first?.focus(); }` — every Tab press on the host page is cancelled and focus is yanked into the widget. A keyboard user who opens the chat can no longer Tab through the host page until they close the widget. The always-on `aria-modal="true"` (line 231) compounds this by telling screen readers the rest of the page is inert, and the global Escape listener closes the widget even when the user presses Escape inside an unrelated host modal.
- **Evidence**: `// If focus is outside the container, bring it back
if (!container.contains(active)) {
	e.preventDefault();
	first?.focus();
}`
- **Suggested fix**: For the floating (non-modal) window, only wrap focus when the event target is already inside the container (remove the outside-focus recapture), drop aria-modal="true" (use role="dialog" only), and only handle Escape when focus is within the widget. Keep full trapping for the mobile fullscreen case where the widget genuinely is modal.
- **Verifier**: Verified in src: window.tsx:198 installs a document-level keydown handler while open (trapFocus defaults true at line 85), and lines 192-195 cancel any Tab whose active element is outside the widget and force-focus the widget's first focusable element. The default <Support /> floating path (support/components/content.tsx:386) renders <Primitive.Window asChild> with no overrides and no backdrop — o

### C-19 [MEDIUM] [dx] "./styles.css" export points into gitignored dist/, unresolvable before build and inconsistent with all other exports
- **File**: packages/react/package.json:64  |  **Dimension**: api-dx
- **Description**: Every export in the map points at ./src/* except "./styles.css", which points at ./dist/styles.css. dist/ is gitignored (`git check-ignore packages/react/dist` confirms), so on a fresh clone `import "@cossistant/react/styles.css"` cannot resolve until someone runs the react package's full build. This breaks the in-repo consumers that use it: examples/react-vite/src/main.tsx line 4 (`import "@cossistant/react/styles.css"`), packages/next/src/styles.css (`@import "@cossistant/react/styles.css"`), and the docs quickstarts. Contributors and anyone consuming the repo via git get a module-not-found error from the very first documented import.
- **Evidence**: `"./support.css": "./src/support.css",
"./styles.css": "./dist/styles.css",`
- **Suggested fix**: Make the compiled sheet part of the dev flow: either add a turbo/workspace task so `bun run build:css` runs before examples/apps dev (e.g. a `dev` dependsOn in turbo.json), or emit styles.css into src/ as a committed generated artifact and point the export at ./src/styles.css like everything else (prepare-package already strips the ./src prefix).
- **Verifier**: Verified at packages/react/package.json:64: "./styles.css": "./dist/styles.css" is the sole export pointing into dist/ (all others use ./src/*), and git check-ignore confirms .gitignore:28 ignores packages/react/dist, so the file is absent on a fresh clone. All three claimed consumers exist: examples/react-vite/src/main.tsx:4 imports "@cossistant/react/styles.css" (the vite config only aliases rea

### C-20 [MEDIUM] [dx] Primitives barrel drops most *Props types; Avatar prop types are unreachable entirely
- **File**: packages/react/src/primitives/index.parts.ts:8  |  **Dimension**: api-dx
- **Description**: Nearly every primitive source file exports its prop types (ButtonProps, WindowProps, WindowRenderProps, MultimodalInputProps, FileInputProps, ConversationTimelineProps/-Container/-Loading/-EmptyProps, TimelineItemProps/-ContentProps/-TimestampProps/-RenderProps, all seven TimelineItemGroup*Props, AvatarProps/AvatarFallbackProps/AvatarImageProps), but index.parts.ts re-exports only the components for these, while inconsistently exporting types for Trigger, DaySeparator, Feedback*, Router and ToolActivityRow. Users of the documented `Primitives.*` namespace cannot type wrappers (e.g. `React.FC<Primitives.ButtonProps>` doesn't exist). Worse, `./primitives/avatar` is the only primitive with no subpath in the exports map (every sibling file has one), so AvatarProps/AvatarFallbackProps/AvatarImageProps — exported by src/primitives/avatar/index.parts.ts — are unreachable through any published entry point.
- **Evidence**: `export { Avatar, AvatarFallback, AvatarImage } from "./avatar";
export { Button } from "./button";`
- **Suggested fix**: In src/primitives/index.parts.ts re-export the prop types alongside each component (e.g. `export { Avatar, type AvatarProps, ... } from "./avatar"`, `export { Button, type ButtonProps } from "./button"`, etc.), and add `"./primitives/avatar": "./src/primitives/avatar/index.ts"` to the exports map for consistency.
- **Verifier**: Verified: src/primitives/index.parts.ts re-exports only components for Avatar (line 8), Button (line 9), ConversationTimeline* (16-21), MultimodalInput/FileInput (46-49), TimelineItem* (59-64), TimelineItemGroup* (73-80), Window (100), while each source file exports the corresponding *Props types (e.g. button.tsx:4 ButtonProps, window.tsx:5/10 WindowRenderProps/WindowProps, avatar/index.parts.ts:1

### C-21 [MEDIUM] [dx] Package root exports internal styled CoButton as `Button`, colliding with the headless Button primitive
- **File**: packages/react/src/support/index.tsx:1004  |  **Dimension**: api-dx
- **Description**: src/index.ts does `export * from "./support"`, and support/index.tsx re-exports the internal cva-styled widget button (`CoButton`, hardcoded co-* Tailwind classes) as `Button`, plus the internal widget `Header`, at the package root. So `import { Button } from "@cossistant/react"` autocompletes to a different component than `import { Button } from "@cossistant/react/primitives/button"` — same name, same package, one styled-internal and one headless. The root surface also leaks low-level realtime store mutators (applyConversationTypingEvent, setTypingState, clearProcessingFromTimelineItem, ...) via `export * from "./realtime"` in src/index.ts. For a first-time consumer the top-level namespace mixes public API with widget internals.
- **Evidence**: `export { CoButton as Button } from "./components/button";
export { Header } from "./components/header";`
- **Suggested fix**: Stop re-exporting CoButton/Header from support/index.tsx (or rename to SupportButton/SupportHeader if genuinely public), and replace src/index.ts's `export * from "./realtime"` with a named export list limited to the provider/hook surface (RealtimeProvider, useRealtime, useRealtimeConnection, and their types).
- **Verifier**: Verified at packages/react/src/support/index.tsx:1004-1005: `export { CoButton as Button }` and `export { Header }` are re-exported at the package root via `export * from "./support"` (src/index.ts:9). CoButton is the cva-styled internal widget button (hardcoded co-* Tailwind classes in support/components/button.tsx), while the headless `Button` primitive (primitives/button.tsx:14) is a different 

### C-22 [MEDIUM] [bug] In-progress feedback is wiped when topics/defaultTopic resolve or change while the user is typing
- **File**: packages/react/src/hooks/use-feedback-form.ts:288  |  **Dimension**: feedback
- **Description**: The reset effect depends on `resetForm`, whose useCallback identity changes whenever `resolvedDefaultTopic` changes. If the host app loads topics asynchronously (topics: [] then ['Bug', ...] with defaultTopic='Bug'), or changes defaultTopic, `resolvedDefaultTopic` flips value, `resetForm` gets a new identity, and the effect fires — destroying the user's rating, comment, touched state, and even `hasSubmitted` (the success screen snaps back to an empty form) while the panel is open and the user is mid-input.
- **Evidence**: `React.useEffect(() => {
	resetForm();
}, [conversationId, resetForm]);`
- **Suggested fix**: Reset only on actual conversationId changes: keep the previous id in a ref (`const prevId = React.useRef(conversationId)`) and call resetForm() inside the effect only when `prevId.current !== conversationId`, so resetForm identity churn from topic props no longer wipes state.
- **Verifier**: Verified in use-feedback-form.ts: the effect at line 288-290 depends on `resetForm`, whose only unstable dep is `resolvedDefaultTopic` (a string memo over topics/defaultTopic; `resetSubmitFeedback` is a stable `useCallback(..., [])` in use-submit-feedback.ts:147). Any value change of the resolved default topic (e.g. topics loading async "" -> "Bug", or defaultTopic prop changing) gives resetForm a

### C-23 [MEDIUM] [a11y] Feedback dialog has no accessible name and claims aria-modal without inert background
- **File**: packages/react/src/feedback/internal/window.tsx:205  |  **Dimension**: feedback
- **Description**: FeedbackWindow renders `role="dialog"` with `aria-modal="true"` but no aria-label or aria-labelledby, so screen readers announce an unnamed dialog. aria-modal="true" additionally tells assistive tech that the rest of the page is inert, which is false — the popover doesn't portal, doesn't set inert/aria-hidden on siblings, and the page stays interactive. The trigger also lacks `aria-controls` pointing at the window id despite setting aria-haspopup/aria-expanded (internal/trigger.tsx:65-66).
- **Evidence**: `props: {
	role: "dialog",
	"aria-modal": "true",`
- **Suggested fix**: Give the dialog a default accessible name (e.g. `"aria-label": "Feedback"`, overridable via props, or aria-labelledby referencing an id on the panel's 'Share feedback' h2), drop aria-modal (or make the background truly inert while open), and add `"aria-controls": id` to FeedbackTriggerPrimitive using the shared window id.
- **Verifier**: All three claims verified in source. (1) Unnamed dialog: packages/react/src/feedback/internal/window.tsx:205-206 hardcodes `role: "dialog", "aria-modal": "true"` with no aria-label/aria-labelledby. The only consumer is components/content.tsx:210 (`<FeedbackWindow asChild>`), which passes nothing else, and neither `Content` nor the public `Feedback.Content` (index.tsx:243-279) forwards any props to

### C-24 [MEDIUM] [a11y] Rating selector exposes no selected state to assistive technology
- **File**: packages/react/src/primitives/feedback-rating-selector.tsx:48  |  **Dimension**: feedback
- **Description**: Each star is a plain button with only an aria-label ('Rate N out of 5'). The current selection is conveyed exclusively through icon fill color and a `data-rating-active` styling attribute — there is no aria-pressed, aria-checked, or radiogroup semantics, so a screen-reader user cannot tell which rating (if any) is selected, and the five buttons aren't grouped under any label. Hover preview also only works with a mouse (onMouseEnter/onMouseLeave), with no focus-based equivalent.
- **Evidence**: `<button
	aria-label={labelForRating(ratingValue)}
	...
	data-rating-active={isFilled}`
- **Suggested fix**: Add `aria-pressed={value === ratingValue}` to each button and `role="group"` with an aria-label (e.g. 'Rate this experience') on the wrapping div (or implement the radiogroup pattern), and mirror hover preview on focus via onFocus={() => onHoverChange?.(ratingValue)}.
- **Verifier**: Verified at packages/react/src/primitives/feedback-rating-selector.tsx:48-67 — each star button has only aria-label plus styling-only data-rating-active; no aria-pressed/aria-checked/radio semantics, and a repo-wide grep confirms no such attributes exist anywhere in packages/react/src. The wrapper div (lines 39-42) has no role or accessible name, and both consumers (feedback/components/panel.tsx:2

### C-25 [MEDIUM] [bug] handleSubmit has no in-flight guard, allowing duplicate feedback submissions from custom UIs
- **File**: packages/react/src/hooks/use-feedback-form.ts:352  |  **Dimension**: feedback
- **Description**: handleSubmit validates rating/topic/comment but never checks isPending (which isn't even in its dependency list). The default panel is protected only because its button renders `disabled={!canSubmit}`. Headless consumers — the module's primary audience — wiring handleSubmit to a form onSubmit or a non-disabled button can fire it twice before React re-renders (Enter-key repeat, double click, programmatic calls), producing two POSTs and duplicate feedback records.
- **Evidence**: `event?.preventDefault();
setHasAttemptedSubmit(true);
resetSubmitFeedback();

if (
	rawIsRatingMissing ||`
- **Suggested fix**: Add a ref-based in-flight guard in handleSubmit: `if (inFlightRef.current) return; inFlightRef.current = true;` before submitFeedback and reset it in a finally block (a ref avoids the stale-closure problem a plain isPending check would have).
- **Verifier**: Verified: handleSubmit (use-feedback-form.ts:346-392) checks only field-missing flags and never isPending (absent from its dep array), despite the hook computing canSubmit = isValid && !isPending at line 210. No layer below guards either: useSubmitFeedback.mutateAsync (use-submit-feedback.ts:68) fires the POST unconditionally, core restClient.submitFeedback (rest-client.ts:1033) has no idempotency

### C-26 [MEDIUM] [bug] Global Escape handler ignores event.defaultPrevented and irrecoverably destroys typed feedback
- **File**: packages/react/src/feedback/internal/window.tsx:117  |  **Dimension**: feedback
- **Description**: While open, FeedbackWindow attaches a window-level keydown listener that closes on any Escape press, without checking event.defaultPrevented or whether a higher layer (a host app modal, combobox, or the select dropdown) already consumed the key. Closing unmounts the panel (useRenderElement `enabled: open` returns null) and FeedbackPanel's resetForm wipes everything, so a user pressing Escape to dismiss a host overlay — or by habit while composing — loses their entire comment with no way to recover.
- **Evidence**: `const handleKeyDown = (event: KeyboardEvent) => {
	if (event.key === "Escape") {
		closeWindow();
	}
};`
- **Suggested fix**: Guard the handler with `if (event.defaultPrevented) return;` and only close when focus is inside the widget (`containerRef.current?.contains(document.activeElement)`); longer-term, preserve draft comment/rating across close/reopen instead of resetting on every close.
- **Verifier**: Verified: window.tsx:117-124 attaches a window-level keydown listener while open that calls closeWindow() on any Escape with no event.defaultPrevented check (and no event.isComposing check — grep confirms neither string appears anywhere in packages/react/src). Closing destroys the draft two ways: useRenderElement (use-render-element.tsx:104) returns null when enabled=false, unmounting FeedbackPane

### C-27 [MEDIUM] [dx] Default panel text is hardcoded English despite the SDK shipping a full locale system
- **File**: packages/react/src/feedback/components/panel.tsx:112  |  **Dimension**: feedback
- **Description**: The support widget localizes all copy through src/support/text (en/fr/es locales plus per-key overrides driven by visitor.language), but the feedback panel hardcodes 'Share feedback', 'Leave a quick note any time…', 'Thanks for the feedback', 'Send another', 'Done', 'Rate this experience', and the close-button aria-labels with no props to override them. use-feedback-form.ts:51 even types the submit label as the literal union `"Rating needed" | "Send" | "Sending..."`, making localization impossible without forking the panel. A French site using the localized support widget gets an English-only feedback popover.
- **Evidence**: `<h2 className="font-semibold text-base">Share feedback</h2>`
- **Suggested fix**: Route panel strings through the existing support text runtime (add feedback.* keys to locales/keys.ts and en/fr/es), or at minimum accept a `labels`/`text` prop on FeedbackPanel/FeedbackProps and widen FeedbackFormSubmitState.label to string.
- **Verifier**: Verified in source: panel.tsx hardcodes ~14 English strings (line 112 'Share feedback', 118 aria-label 'Close feedback', 139 'Thanks for the feedback', 151 'Send another', 154 'Done', 227 'Rate this experience', 233 'Rate ${rating} out of 5', etc.) with no text-runtime import, while only topicPlaceholder/commentPlaceholder are overridable (lines 35-36). use-feedback-form.ts:51 types the submit lab

### C-28 [MEDIUM] [bug] fetchNextPage can silently return the in-flight first-page request because the dedup key omits the actual cursor
- **File**: packages/react/src/hooks/use-conversation-timeline-items.ts:82  |  **Dimension**: hooks
- **Description**: The dedup queryKey is built from `baseArgs.cursor` (the static options.cursor, normally undefined), not the cursor actually being requested. fetchNextPage -> refetch({ cursor: selection.nextCursor }) runs through executeWithDeduplication with the same key as the first-page fetch, so if any first-page request is in flight (guaranteed to be common given the double-fetch bug, plus interval/focus refetches), the pagination call returns the existing page-1 promise and the older page is never requested — 'load older messages' does nothing until clicked again. Two rapid fetchNextPage calls with different cursors collapse the same way.
- **Evidence**: `queryKey: conversationId
  ? `timeline:${conversationId}:${baseArgs.limit}:${baseArgs.cursor ?? ""}`
  : undefined,`
- **Suggested fix**: Include the effective request cursor in the deduplication key (compute the key per-execution from the resolved args inside useClientQuery), or have `refetch`/fetchNextPage bypass deduplication entirely since they are explicit user actions.
- **Verifier**: Verified in code: the dedup key at use-conversation-timeline-items.ts:82 is built from the static options.cursor (baseArgs.cursor, normally undefined), never from the cursor actually requested. fetchNextPage -> refetch({cursor: nextCursor}) flows into executeWithDeduplication (use-client-query.ts:151) with that same static key, and executeWithDeduplication (lines 64-67) returns any existing in-fli

### C-29 [MEDIUM] [bug] useTransitionSwap gets stuck in the 'exit' phase on rapid key toggle, leaving the trigger icon invisible
- **File**: packages/react/src/hooks/use-transition-swap.ts:26  |  **Dimension**: hooks
- **Description**: When activeKey changes A->B, the effect sets phase='exit' and schedules the swap after exitDuration. If activeKey returns to A before the timeout fires (A->B->A within 100ms), the cleanup clears the timeout and the effect re-run early-returns because `activeKey === displayedKey` — without ever resetting phase, which stays 'exit' forever. Verified with a probe test: after toggling chat->typing->chat and waiting 200ms, state was displayedKey='chat', phase='exit'. The only consumer (support/components/trigger.tsx line 51) renders `opacity-0 scale-90` whenever phase !== 'enter', so a quick widget open/close or a typing indicator that starts and clears within 100ms (typing event immediately followed by the agent's message) leaves the launcher button showing no icon until the key changes again.
- **Evidence**: `useEffect(() => {
  if (activeKey === displayedKey) {
    return;
  }`
- **Suggested fix**: In the early-return branch, recover from a cancelled swap: `if (activeKey === displayedKey) { setPhase((p) => (p === "exit" ? "enter" : p)); return; }`.
- **Verifier**: Reproduced with a probe test using the project's own test harness: after chat->typing->chat within the 100ms exitDuration and a 250ms wait, the hook state was {displayedKey:"chat", phase:"exit"} (control test with slow toggle behaved correctly). The early return at use-transition-swap.ts:26-28 fires after the cleanup cancels the pending swap timeout, and nothing ever resets phase, so it stays "exi

### C-30 [MEDIUM] [bug] useSoundEffect creates a suspended AudioContext at mount and never calls resume(), so widget sounds never play; context is also never closed
- **File**: packages/react/src/hooks/use-sound-effect.ts:140  |  **Dimension**: hooks
- **Description**: The mount effect eagerly constructs `new AudioContext()` (lines 52-61) when the trigger renders — i.e. at page load, before any user gesture. Under Chrome/Safari autoplay policy such a context is created in the 'suspended' state and stays suspended even after the user interacts, unless resume() is called; play() starts the source (`source.start(0)`) without ever checking `audioContext.state` or calling resume() (verified: no `resume` anywhere in src/). Result: the new-message and typing sounds used by DefaultTrigger (use-new-message-sound / use-typing-sound) are silent for the whole session in most real page loads, while isPlaying is incorrectly reported as true. Additionally the unmount cleanup (lines 159-164) only stops the source node and never calls `audioContext.close()`, leaking a hardware audio context per hook instance (the default trigger creates two) on each remount — browsers cap concurrent AudioContexts (~6 in Chrome).
- **Evidence**: `// Start playback
source.start(0);
setIsPlaying(true);`
- **Suggested fix**: In play(), resume a suspended context before starting: `if (audioContext.state === "suspended") { void audioContext.resume(); }` (or create the context lazily on first play, which happens inside/after a user gesture). In the unmount cleanup, call `void audioContextRef.current?.close()` and null the ref.
- **Verifier**: Verified in use-sound-effect.ts: the AudioContext is eagerly created in the mount effect (lines 52-61) when the always-rendered DefaultTrigger mounts at page load (trigger.tsx:32-41), i.e. before any user gesture, so it starts 'suspended' under autoplay policy. Grep confirms zero resume() and zero close() calls anywhere in packages/react/src, and play() (lines 140-141) does source.start(0); setIsP

### C-31 [MEDIUM] [build] Shipped d.ts files import _virtual/rolldown_runtime.js which has no declaration file, breaking consumers with skipLibCheck:false
- **File**: packages/next/tsdown.config.ts:14  |  **Dimension**: next-parity
- **Description**: tsdown's dts output for the entries that use namespace/default re-exports (index.ts, support/index.tsx, feedback/index.tsx, primitives/index.ts) emits `import { __export, __reExport } from "./_virtual/rolldown_runtime.js"` at the top of the published .d.ts files, but only _virtual/rolldown_runtime.js (no .d.ts) is emitted. Reproduced with a fresh tsdown build into a scratch dir, then type-checked a minimal consumer (`import { SupportProvider } from "@cossistant/next"`) with skipLibCheck:false: tsc reports TS7016 'Could not find a declaration file for module ../_virtual/rolldown_runtime.js' from index.d.ts, support/index.d.ts, and feedback/index.d.ts. Next.js defaults skipLibCheck:true so many apps are shielded, but any strict consumer or downstream library hits hard type errors originating inside @cossistant/next. @cossistant/react's dist d.ts is clean (its rewrite-dist-types.ts step exists but handles a different problem; next has no dts post-processing at all).
- **Evidence**: `dts: true,  // next dist/index.d.ts line 1: import { __export, __reExport } from "./_virtual/rolldown_runtime.js";`
- **Suggested fix**: Add a post-build step to the next build script (analogous to react's rewrite:types) that strips the unused `import { __export, __reExport } from ".../_virtual/rolldown_runtime.js";` line from every dist .d.ts (the helpers are never referenced in the declarations), or emit a dist/_virtual/rolldown_runtime.d.ts declaring the two helpers.
- **Verifier**: Reproduced end-to-end. (1) packages/next/tsdown.config.ts line 14 has `dts: true` with no d.ts post-processing anywhere in the build script (packages/next/package.json "build": "tsdown && rm -rf dist/node_modules dist/packages && find dist -name '*.map' -delete && ..."). (2) A fresh tsdown build (run into a scratch outDir with the repo's tsdown) emits `import { __export, __reExport } from "./_virt

### C-32 [MEDIUM] [dx] next exposes only 12 of react's ~41 subpath exports; all 29 granular primitive/hook/util paths are missing
- **File**: packages/next/package.json:33  |  **Dimension**: next-parity
- **Description**: react's exports map includes 20 per-primitive paths (./primitives/button ... ./primitives/window), 5 per-hook paths (./hooks/use-create-conversation etc.), 4 per-util paths, and ./internal/hooks; next's exports map has none of them. react's own README markets the deep-import style ('shadcn of customer support'): `import { SupportTrigger } from "@cossistant/react/primitives/trigger"` and `import { useSubmitFeedback } from "@cossistant/react/hooks/use-submit-feedback"` (packages/react/README.md lines 56-57), and docs (apps/web/content/docs/user-feedback/index.mdx lines 330-332) explicitly tell Next.js users to fall back to the barrels — confirming the gap is known but unresolved. Verified: `import('@cossistant/next/primitives/trigger')` fails with ERR_PACKAGE_PATH_NOT_EXPORTED against the built package. A Next.js user porting any documented deep-import example by swapping the package name gets a resolution error; the barrel workaround negates the tree-shaking/discoverability benefit the granular paths exist for.
- **Evidence**: `"./primitives": "./src/primitives/index.ts",  // react has "./primitives/button", "./primitives/trigger", "./hooks/use-send-message", ... next has none`
- **Suggested fix**: Mirror react's granular exports: add one-line 'use client' re-export files (e.g. src/primitives/trigger.tsx containing `export * from "@cossistant/react/primitives/trigger";`) for the 20 primitives, 5 hooks, and 4 utils, plus matching package.json exports entries; the existing src/**/*.tsx tsdown glob already builds them. Alternatively, document explicitly that deep imports must use @cossistant/react (a direct dependency of next).
- **Verifier**: Verified against source: packages/next/package.json exports (lines 33-45) contain only 12 barrel subpaths, while packages/react/package.json (lines 33-73) additionally exports 20 ./primitives/*, 5 ./hooks/use-*, 4 ./utils/*, and ./internal/hooks paths — all absent from next. scripts/prepare-package.ts only remaps the existing exports map to dist (no subpath generation), and packages/next/src/primi

### C-33 [MEDIUM] [bug] Window primitive crashes without SupportProvider despite provider-free props
- **File**: packages/react/src/primitives/window.tsx:92  |  **Dimension**: primitives-a11y
- **Description**: SupportWindow exposes `isOpen`/`onOpenChange` props for controlled/provider-free usage (like Trigger, whose provider-free usage is an explicitly tested pattern in trigger.test.tsx), but it unconditionally calls useSupportConfig(), which throws 'useSupportConfig must be used within a cossistant SupportProvider' (support-store.ts:247-257). Rendering `<Primitive.Window isOpen={open} onOpenChange={setOpen}>` outside the provider crashes the host app.
- **Evidence**: `const { isOpen, close } = useSupportConfig();`
- **Suggested fix**: Use useOptionalSupportConfig() and fall back: `const config = useOptionalSupportConfig(); const open = isOpenProp ?? config?.isOpen ?? false;` and use `config?.close` in closeFn.
- **Verifier**: Verified: window.tsx:92 unconditionally calls useSupportConfig(), which throws 'useSupportConfig must be used within a cossistant SupportProvider' (support-store.ts:247-257) when rendered outside the provider, even though SupportWindow exposes isOpen/onOpenChange for controlled usage and is publicly exported (index.parts.ts:100 'SupportWindow as Window'). The optional variant useOptionalSupportCon

### C-34 [MEDIUM] [dx] Passing onClick to Trigger silently disables opening the widget
- **File**: packages/react/src/primitives/trigger.tsx:181  |  **Dimension**: primitives-a11y
- **Description**: The trigger uses `onClick ?? toggle`, so a consumer adding an analytics/onClick handler (`<Trigger onClick={track}>Help</Trigger>`) replaces the toggle entirely and the widget stops opening, with no warning. Every established primitive library composes the user handler with the internal one.
- **Evidence**: `onClick: onClick ?? toggle,`
- **Suggested fix**: Compose instead of replace: `onClick: (e) => { onClick?.(e); if (!e.defaultPrevented) toggle(); }`.
- **Verifier**: Verified at packages/react/src/primitives/trigger.tsx:181 — `onClick: onClick ?? toggle,` with `onClick` destructured out of props (line 102), so a consumer-supplied onClick fully replaces the internal toggle and the widget silently stops opening. useRenderElement (src/utils/use-render-element.tsx) performs no handler composition, no JSDoc documents onClick as an opt-out (the separate onToggleOpen

### C-35 [MEDIUM] [bug] Multi-line code blocks starting with a package-manager command get mangled into a bogus one-line command block
- **File**: packages/react/src/primitives/command-block-utils.ts:38  |  **Dimension**: primitives-a11y
- **Description**: normalizeInput collapses ALL whitespace (including newlines) to single spaces first, then checks `normalized.includes("\n")` — which is always false after the replace, so the multi-line rejection is dead code. A fenced block like ```npm install foo\ncd foo``` is parsed as `npm install` with args `foo cd foo`, rendered as a command block with variants like `yarn add foo cd foo`; the user copies a broken command. renderMarkdownToken (timeline-item.tsx:239) feeds every non-inline code token through mapCommandVariants, so any AI/agent reply containing a multi-line setup snippet hits this.
- **Evidence**: `const normalized = input.replace(/\s+/g, " ").trim();
if (!normalized || normalized.includes("\n") || normalized.includes("\r")) {`
- **Suggested fix**: Check the raw input before collapsing: `if (/[\n\r]/.test(input.trim())) return null;` then normalize spaces.
- **Verifier**: Verified by reading and executing the code. normalizeInput (packages/react/src/primitives/command-block-utils.ts:38-39) runs `input.replace(/\s+/g, " ").trim()` before checking `normalized.includes("\n")`, so the multi-line rejection is provably dead code. The path is reachable: tiny-markdown preserves newlines in fenced code token content (markdown-parser.ts:390 `codeLines.join("\n")`), and timel

### C-36 [MEDIUM] [bug] AvatarFallback hides while the image is loading, leaving a blank avatar
- **File**: packages/react/src/primitives/avatar/fallback.tsx:76  |  **Dimension**: primitives-a11y
- **Description**: AvatarImage only renders once status === "loaded" (image.tsx:92 `enabled: imageLoadingStatus === "loaded"`), but AvatarFallback also refuses to render while status === "loading". During the whole network fetch neither part renders, so avatars are empty boxes on slow connections. The `delayMs` prop already exists to prevent flashes on fast loads, making the extra "loading" exclusion both redundant and harmful.
- **Evidence**: `const shouldRender =
	canRender &&
	imageLoadingStatus !== "loaded" &&
	imageLoadingStatus !== "loading";`
- **Suggested fix**: Drop the loading exclusion: `const shouldRender = canRender && imageLoadingStatus !== "loaded";` (delayMs handles fast-load flashes).
- **Verifier**: Verified in code: fallback.tsx:76-79 hides AvatarFallback when imageLoadingStatus is "loading", while image.tsx:92 only renders the <img> when status === "loaded". image.tsx:68 sets status to "loading" in a useLayoutEffect (before paint) for the entire network fetch, so neither image nor fallback renders during the download. Reachable in the shipped default widget: support/components/avatar.tsx:12

### C-37 [MEDIUM] [bug] TimelineItem sender precedence contradicts getTimelineItemSender (visitor-first vs user-first)
- **File**: packages/react/src/primitives/timeline-item.tsx:56  |  **Dimension**: primitives-a11y
- **Description**: TimelineItem derives sender as visitor-first (`isVisitor = item.visitorId !== null` wins), while utils/timeline-item-sender.ts documents and implements the opposite precedence used by TimelineItemGroup and hooks: "user -> AI agent -> visitor so tool and event rows that include multiple IDs are grouped/rendered according to the acting sender" (verified by timeline-item-group.test.ts 'prefers user sender over ai and visitor ids'). A tool/event item carrying visitorId alongside userId/aiAgentId is grouped as team_member/AI by the group but rendered/labelled as 'visitor' by TimelineItem's render props and aria-label — misaligned bubbles/labels for the same item.
- **Evidence**: `const isVisitor = item.visitorId !== null;
const isAI = item.aiAgentId !== null;
...
const senderType = isVisitor ? "visitor" : isAI ? "ai" : "human";`
- **Suggested fix**: Derive sender via getTimelineItemSender(item) in TimelineItem and map its SenderType to the isVisitor/isAI/isHuman flags.
- **Verifier**: Verified: timeline-item.tsx:52-56 derives sender visitor-first (`const isVisitor = item.visitorId !== null; ... senderType = isVisitor ? "visitor" : isAI ? "ai" : "human"`), while utils/timeline-item-sender.ts:32-43 implements user->AI->visitor precedence (documented at lines 27-31 as intentional for "tool and event rows that include multiple IDs") and is used by TimelineItemGroup (timeline-item-g

### C-38 [MEDIUM] [bug] Loading older items via onScrollStart jumps the scroll position (no prepend anchoring)
- **File**: packages/react/src/primitives/conversation-timeline.tsx:186  |  **Dimension**: primitives-a11y
- **Description**: The timeline exposes onScrollStart/hasMore explicitly for top-of-list pagination, but the auto-scroll effect only handles append/remove/replace of the LAST item; nothing compensates scrollTop when items are prepended. At scrollTop<=2 (exactly where onScrollStart fires) browser scroll anchoring is inactive (and Safari has no overflow-anchor at all), so after older messages load the viewport snaps to the top of the newly loaded batch instead of staying on the message the user was reading — the classic chat-pagination jump.
- **Evidence**: `const atTop = scrollTop <= TOP_THRESHOLD_PX;
if (atTop && !isAtTop.current) {
	onScrollStart?.();
}`
- **Suggested fix**: In the items effect, detect prepend (items.length grew but lastItemKey unchanged), capture scrollHeight before via useLayoutEffect, then set `element.scrollTop += element.scrollHeight - prevScrollHeight`.
- **Verifier**: Verified in packages/react/src/primitives/conversation-timeline.tsx: the auto-scroll effect (lines 128-170) only handles append (appendedNewItem requires lastItemKey change), replace (requires !hasNewItems), and remove; a prepend (length grows, last key unchanged, not pinned to bottom) matches no branch, and no scrollTop compensation exists anywhere in the package. onScrollStart fires at scrollTop

### C-39 [MEDIUM] [a11y] FeedbackRatingSelector has no radiogroup semantics or selected-state exposure
- **File**: packages/react/src/primitives/feedback-rating-selector.tsx:48  |  **Dimension**: primitives-a11y
- **Description**: The rating widget is five independent buttons; the current rating is only conveyed via the non-semantic `data-rating-active` attribute and icon color. Screen reader users hear 'Rate 3 out of 5, button' with no way to know which rating is selected, and there is no radiogroup/arrow-key pattern. The wrapper div also has no group label.
- **Evidence**: `<button
	aria-label={labelForRating(ratingValue)}
	...
	data-rating-active={isFilled}`
- **Suggested fix**: Give the wrapper `role="radiogroup"` + `aria-label="Rating"`, each button `role="radio"` + `aria-checked={value === ratingValue}` (or minimally `aria-pressed`), and roving tabindex with ArrowLeft/ArrowRight handling.
- **Verifier**: Verified in packages/react/src/primitives/feedback-rating-selector.tsx: the wrapper (line 39) is a bare div with no role or group label, and each star button (lines 48-67) exposes selection only via data-rating-active (line 59) and icon color (lines 72/76) — no aria-checked/aria-pressed/aria-current, no roving tabindex or arrow keys. Grep across packages/react/src shows zero occurrences of radiogr

### C-40 [MEDIUM] [a11y] Dialog wiring incomplete: Window has no accessible name and Trigger lacks aria-controls
- **File**: packages/react/src/primitives/window.tsx:230  |  **Dimension**: primitives-a11y
- **Description**: SupportWindow renders role="dialog" aria-modal="true" with a default id but no default aria-label/aria-labelledby, so AT announces an unnamed dialog. SupportTrigger sets aria-haspopup="dialog" and aria-expanded (trigger.tsx:179-180) but never aria-controls, so the trigger/dialog relationship is not programmatically linked even though the window's id ("cossistant-window") is a known default.
- **Evidence**: `role: "dialog",
"aria-modal": "true",
id,
tabIndex: -1,`
- **Suggested fix**: Add a default `"aria-label": "Support"` (overridable via props spread) in Window, and add `"aria-controls": "cossistant-window"` (prop-overridable) to the Trigger's injected props.
- **Verifier**: Verified in code: window.tsx:229-233 injects role="dialog"/aria-modal="true"/id with no default aria-label or aria-labelledby (default id "cossistant-window" at line 87), and trigger.tsx:178-180 injects aria-haspopup="dialog" and aria-expanded but never aria-controls (grep confirms aria-controls appears nowhere in react/browser src). Not mitigated by callers: the shipped default Support component 

### C-41 [MEDIUM] [bug] support object in controller useMemo deps recreates the entire controller on every render
- **File**: packages/react/src/provider.tsx:221  |  **Dimension**: provider-lifecycle
- **Description**: The owned controller is memoized on `[apiUrl, publicKey, support, wsUrl]`. `support` is an object (`AnySupportConfig`) that consumers almost always pass as an inline literal (`support={{...}}`), giving it a new identity on every parent render. Each render then creates a brand-new controller and CossistantClient, the start effect schedules `destroy()` of the previous one (realtime disconnect, subscriptions cleared, conversation stores dropped) and boots the new one (website refetch, WebSocket reconnect, conversation prefetch). The result is a network/reconnect storm and visible widget state resets on every app re-render. This dep is redundant: `support` changes are already synced in place via `updateOptions` -> `client.updateConfiguration({ support })` (support-controller.ts:725-729).
- **Evidence**: `[apiUrl, publicKey, support, wsUrl]`
- **Suggested fix**: Remove `support` from the useMemo dependency array (keep `[apiUrl, publicKey, wsUrl]`), letting the existing updateOptions effect propagate support config changes to the live client.
- **Verifier**: Verified in code: packages/react/src/provider.tsx:221 includes `support` in the controller useMemo deps, so any identity change recreates the controller and CossistantClient (support-controller.ts:364); the start effect (provider.tsx:254-281) then destroys the old controller (realtime disconnect, support-controller.ts:669) and boots the new one (fetchWebsite :649, WS reconnect, conversation prefet

### C-42 [MEDIUM] [bug] Provider prop defaults override externally injected controller configuration on mount
- **File**: packages/react/src/provider.tsx:354  |  **Dimension**: provider-lifecycle
- **Description**: SupportProvider defaults `autoConnect = true`, `size = "normal"`, `defaultOpen = false` and the updateOptions effect applies them to `controller = externalController ?? ownedController`. A consumer who creates a controller with `createSupportController({ autoConnect: false, defaultOpen: true, size: "larger" })` and passes it via the `controller` prop gets all three silently reverted on mount: `runtimeOptions.autoConnect` is forced true (triggering an unwanted WebSocket connection via `syncRealtimeConnection()` at the end of updateOptions), isOpen is forced false, and size reset to "normal". This makes controller-level configuration of these options unusable with the provider.
- **Evidence**: `autoConnect = true,
...
size = "normal",
	defaultOpen = false,`
- **Suggested fix**: Do not default these props in SupportProvider/SupportProviderInner; apply fallbacks only when constructing the owned controller (e.g. `autoConnect: autoConnect ?? true` inside createSupportController's options), and pass the raw possibly-undefined props to updateOptions so `!== undefined` guards skip them for external controllers.
- **Verifier**: Verified end-to-end. SupportProvider (provider.tsx:354,358-359) defaults autoConnect=true, size="normal", defaultOpen=false and the mount effect (provider.tsx:229-240) applies them via controller.updateOptions() to `externalController ?? ownedController`. In core (support-controller.ts:717-719, 742-749, 761), updateOptions unconditionally overwrites runtimeOptions.autoConnect, resets size, and map

### C-43 [MEDIUM] [bug] Persisted isOpen/size are always stomped at controller creation, and localStorage is written during render
- **File**: packages/react/src/provider.tsx:202  |  **Dimension**: provider-lifecycle
- **Description**: The core support store persists `isOpen` and `size` to localStorage and restores them at creation (support-store.ts PersistedConfig). But SupportProviderInner always passes defaulted `size`/`defaultOpen` to `createSupportController`, which unconditionally applies `supportConfigPatch.isOpen = options.defaultOpen; ... supportStore.updateConfig(supportConfigPatch)` (support-controller.ts:336-348), overwriting the just-restored persisted values and immediately re-persisting the defaults. The isOpen/size persistence feature is therefore dead for all React SDK users (widget never stays open across page loads). Because this happens inside `React.useMemo`, it is also a render-phase localStorage write — including from the discarded StrictMode double-invocation render, which violates render purity.
- **Evidence**: `size = "normal",
	defaultOpen = false,
}: SupportProviderProps) {
	const ownedController = React.useMemo(`
- **Suggested fix**: Only include `size`/`isOpen` in the creation patch when the consumer explicitly provided the props (pass undefined through instead of defaulting, per the previous finding), so persisted state wins otherwise; and move the initial `updateConfig` side effect out of render (e.g. defer it to `start()`).
- **Verifier**: Verified end-to-end. The store intentionally persists and restores isOpen/size (support-store.ts:99 PersistedConfig, persistState:213-216, getInitialState:176-197; test support-store.test.ts:38-55 asserts restored isOpen=true). createSupportController's `!== undefined` guards (support-controller.ts:338-344) are designed to skip when unset, but SupportProvider AND SupportProviderInner both default 

### C-44 [MEDIUM] [footprint] Orphan owned controller is created (with side effects) even when an external controller is injected
- **File**: packages/react/src/provider.tsx:204  |  **Dimension**: provider-lifecycle
- **Description**: The `ownedController` useMemo runs unconditionally, so passing `controller={externalController}` still constructs a full unused controller: a CossistantClient (7 stores + RealtimeClient), env-var key resolution, and a support store that reads AND writes the shared `cossistant-support-store` localStorage key during render (its creation patch writes `isOpen:false, size:"normal"`, transiently clobbering state persisted by the external controller's own store, which uses the same key). In StrictMode dev, two such orphans are created per mount and never destroyed.
- **Evidence**: `const ownedController = React.useMemo(
		() =>
			createSupportController({`
- **Suggested fix**: Return null from the memo when an external controller is provided: `React.useMemo(() => (externalController ? null : createSupportController({...})), [externalController, apiUrl, publicKey, wsUrl])` and keep `controller = externalController ?? ownedController` with a non-null assertion on the owned branch.
- **Verifier**: Verified: provider.tsx:204-224 runs createSupportController unconditionally in useMemo, ignored when `controller` prop is set (`externalController ?? ownedController`). Construction has real side effects: createSupportStore reads localStorage (support-store.ts:186) and — because SupportProvider always passes size="normal"/defaultOpen=false defaults, making supportConfigPatch non-empty (support-con

### C-45 [MEDIUM] [footprint] Whole-snapshot selector + snapshot-keyed context value re-renders every useSupport consumer on any store change
- **File**: packages/react/src/provider.tsx:283  |  **Dimension**: provider-lifecycle
- **Description**: The provider selects the entire controller snapshot (`(state) => state`) and memoizes the context value on `[controller, snapshot]`. The snapshot object is rebuilt on every stateStore or supportStore notification — including navigation pushes, open/close, and unread recalculations — even though the context value's exposed fields (website, unreadCount, isLoading, etc.) are unchanged. Every internal widget navigation therefore produces a new SupportContext value and re-renders all `useSupport()` consumers across the host app (e.g. custom unread badges). `useSupport` additionally calls `useSupportStore()` which also subscribes to the full support store state.
- **Evidence**: `const snapshot = useStoreSelector(
		controller,
		React.useCallback((state) => state, [])
	);`
- **Suggested fix**: Select only the fields the context exposes and compare them with a shallow-equality `isEqual` in useStoreSelector (e.g. select `{website, unreadCount, isLoading, error, configurationError, client, defaultMessages, quickOptions, isOpen}`), so navigation-only changes do not churn the context value.
- **Verifier**: Verified end-to-end: provider.tsx:283-286 selects the whole controller snapshot with an identity selector and Object.is equality, and memoizes the context value on [controller, snapshot] (line 306). The controller (core/support-controller.ts:415-427) subscribes to BOTH stateStore and supportStore and rebuilds the snapshot via buildSnapshot (lines 239-253) — a fresh object spread — on every notific

### C-46 [MEDIUM] [bug] Destroyed controller can never restart: deferred destroy breaks under Activity/offscreen remounts
- **File**: packages/react/src/provider.tsx:273  |  **Dimension**: provider-lifecycle
- **Description**: The start effect's cleanup schedules `controller.destroy()` on a 0ms timeout, cancelled if the effect re-runs in the same tick (StrictMode replay). But core `start()` guards `if (started || destroyed) { return; }` (support-controller.ts:623) with no way back. If effects are cleaned up and re-run later than one macrotask — React 19's `<Activity>` hiding the subtree, or any offscreen state-preserving remount — the same memoized controller instance is destroyed, and the subsequent `start()` is a permanent no-op: no store subscriptions, realtime disconnected forever, a frozen dead widget with no error.
- **Evidence**: `const timeoutId = globalThis.setTimeout(() => {
					pendingDisposals.delete(controller);
					controller.destroy();
				}, 0);`
- **Suggested fix**: Make the lifecycle reversible: either have `destroy()` act as a stop (reset `destroyed`/`started` so `start()` can re-subscribe and reconnect), or in the provider detect `controller.isDestroyed?.()` in the start effect and recreate the owned controller via state.
- **Verifier**: Verified in code: provider.tsx:273-276 schedules `controller.destroy()` on a 0ms setTimeout in the start effect's cleanup, cancellable only if the effect re-runs within one macrotask (provider.tsx:255-261). Core's lifecycle is irreversible: start() guards `if (started || destroyed) return` (support-controller.ts:623) and destroy() sets `destroyed = true` and clears ALL cleanupFns including the cre

### C-47 [MEDIUM] [bug] connect() early-return on unchanged auth prevents any recovery after a permanent close
- **File**: packages/core/src/realtime-client.ts:472  |  **Dimension**: realtime
- **Description**: After a permanent close (codes 1008/1011 — and servers send 1011 on transient internal errors), scheduleReconnect is skipped but this.auth is retained. Every later connect() call with the same credentials (the widget's syncRealtimeConnection in support-controller.ts calls connect on every option/website update) hits `!authChanged(...)` and returns while status is 'disconnected'. The widget has no automatic reconnect path and never calls reconnect(), so one 1011 close kills realtime for the entire session until page reload.
- **Evidence**: `if (!authChanged(this.auth, resolved)) {
			return;
		}`
- **Suggested fix**: Change the guard to `if (!authChanged(this.auth, resolved) && this.state.status !== "disconnected") return;` (or clear this.auth when handling a permanent close so a later connect() proceeds).
- **Verifier**: Verified all links of the chain: (1) realtime-client.ts:472 early-returns on unchanged auth with no status check; (2) on permanent close (PERMANENT_CLOSE_CODES = {1008, 1011}, line 14) the onclose handler returns before scheduleReconnect (lines 633-638) and this.auth is never cleared; (3) the server sends 1011 for any unexpected (5xx) auth error during upgrade (apps/api/src/ws/socket.ts:1180-1185)

### C-48 [MEDIUM] [bug] onConnect/onDisconnect/onError props of RealtimeProvider are captured once and never updated (no-op effect)
- **File**: packages/react/src/realtime/provider.tsx:106  |  **Dimension**: realtime
- **Description**: The callbacks are passed to the RealtimeClient constructor on first render and there is no API call to update them; the effect that claims to 'update callbacks without recreating client' has an empty body. RealtimeClient stores them once (onConnectCallback = options.onConnect). Any consumer passing closures that capture current state (e.g. onError showing a toast tied to the active route) will have the first render's stale closure invoked for the lifetime of the connection.
- **Evidence**: `// Update callbacks without recreating client
	useEffect(() => {
		// Callbacks are captured in the RealtimeClient constructor closures,
		// but the onEvent writes to refs/state which are always current.
	}, [onConnect, onDisconnect, onError]);`
- **Suggested fix**: Hold the latest callbacks in refs and pass stable wrappers to the constructor (onConnect: () => onConnectRef.current?.()), updating the refs in the effect; delete the misleading comment.
- **Verifier**: Verified end-to-end. RealtimeProvider (packages/react/src/realtime/provider.tsx:91-101) constructs RealtimeClient once behind a ref guard, passing onConnect/onDisconnect/onError raw; RealtimeClient (packages/core/src/realtime-client.ts:456-458) assigns them only in the constructor ("this.onConnectCallback = options.onConnect ?? null") with no setter or reassignment anywhere in the file, and invoke

### C-49 [MEDIUM] [bug] lastEvent in the context value re-renders every consumer and re-subscribes every useRealtime on each realtime event
- **File**: packages/react/src/realtime/provider.tsx:163  |  **Dimension**: realtime
- **Description**: Every incoming event calls setLastEvent, invalidating the memoized context value, so all useRealtimeConnection/useRealtime consumers re-render per event (typing previews alone arrive every ~800ms per active visitor). Worse, useRealtime's subscription effect depends on the whole context object (use-realtime.ts:126 `[connection]`), so each event tears down and re-creates every handler subscription. The same pattern exists in the widget's WebSocketProvider (src/support/context/websocket.tsx:79-86), whose `realtime.subscribe((event) => setLastEvent(event))` is also the async setState path behind the 'update to WebSocketProvider was not wrapped in act' test warnings.
- **Evidence**: `subscribe,
			lastEvent,
			connectionId: connectionState.connectionId,
		...
		[connectionState, send, sendRaw, subscribe, lastEvent, reconnect, identity]`
- **Suggested fix**: Remove lastEvent from the context value (expose it via a separate useSyncExternalStore-backed hook for the rare consumers that need it), and change use-realtime.ts effect deps from [connection] to [connection.subscribe].
- **Verifier**: Verified end-to-end. (1) provider.tsx:94-96 calls setLastEvent for every event (core realtime-client.ts:726 invokes onEventCallback per dispatched event), and lastEvent is in the context useMemo deps (provider.tsx:170), so every useRealtimeConnection consumer re-renders per event. (2) use-realtime.ts:126 depends on the whole context object ([connection]), so every event tears down and re-creates a

### C-50 [MEDIUM] [dx] Public WebSocketProvider silently ignores its wsUrl/autoConnect/publicKey/onConnect/onDisconnect/onError props
- **File**: packages/react/src/support/context/websocket.tsx:55  |  **Dimension**: realtime
- **Description**: WebSocketProvider is publicly exported (src/support/index.tsx:1012) and its props type advertises wsUrl, autoConnect, publicKey and connection callbacks, but the implementation destructures them into unused underscore bindings (autoConnect and publicKey are not even read). A user rendering <WebSocketProvider onError={...} wsUrl={...}> gets no error callbacks and no custom URL with zero warning; the props only 'work' when going through SupportProvider, which wires them into the controller instead.
- **Evidence**: `wsUrl: _wsUrl,
	onConnect: _onConnect,
	onDisconnect: _onDisconnect,
	onError: _onError,`
- **Suggested fix**: Either wire the callbacks (subscribe to client.realtime.onStateChange and diff status like support-controller's handleRealtimeStateChange) or remove the dead props from WebSocketProviderProps so misuse fails at compile time.
- **Verifier**: Verified in packages/react/src/support/context/websocket.tsx: WebSocketProviderProps (lines 32-42) advertises publicKey/wsUrl/autoConnect/onConnect/onDisconnect/onError, but the component (lines 55-63) destructures wsUrl/onConnect/onDisconnect/onError into unused underscore bindings and never destructures publicKey/autoConnect; the body only uses client.realtime from useSupport(). The component an

### C-51 [MEDIUM] [bug] theme="light" prop silently does nothing — widget stays dark on dark-mode hosts
- **File**: packages/react/src/support/components/theme-wrapper.tsx:16  |  **Dimension**: support-ui
- **Description**: SupportProps documents `theme` as "Force a specific theme", but ThemeWrapper only handles "dark": for "light" it renders children bare. Since support.css switches palettes via `.dark :where(.cossistant, [data-cossistant-root])`, any host with `class="dark"` on <html>/<body> keeps the widget dark even when the integrator passes theme="light". The prop silently doesn't work in exactly the case it exists for.
- **Evidence**: `if (theme === "dark") {
	return (
		<div className="dark" data-color-scheme="dark">...
// Light or undefined - render children directly to inherit theme from parent
return <>{children}</>;`
- **Suggested fix**: When theme="light", wrap children in a marker (e.g. data-color-scheme="light") and add a CSS override so `[data-color-scheme="light"]` re-applies the light token set with higher specificity than `.dark :where(...)` (e.g. `.dark :where(...)[data-color-scheme="light"], .dark [data-color-scheme="light"] :where(...)`).
- **Verifier**: Verified in code: SupportProps documents theme as "Force a specific theme" (support/index.tsx:106-108), but ThemeWrapper (theme-wrapper.tsx:16-25) only wraps for "dark" and returns bare children for "light" — identical to omitting the prop. The dark palette is activated by `.dark :where(.cossistant, [data-cossistant-root])` (support/support.css:250-251), and the widget root (root.tsx:32-36) render

### C-52 [MEDIUM] [bug] goBack between two conversations jumps to HOME and wipes the entire navigation history
- **File**: packages/core/src/store/support-store.ts:289  |  **Dimension**: support-ui
- **Description**: goBack's "safeguard" compares only page names, ignoring params. Using the documented SDK surface (SupportHandle.openConversation / controller.openConversation) to open conversation A then conversation B puts CONVERSATION(A) on the stack with CONVERSATION(B) current; pressing the widget's back arrow then matches `previous.page === current.page` and resets to HOME with `previousPages: []`, instead of returning to conversation A. The user loses both their expected back target and all remaining history. Same-page navigations with different params (also possible for custom pages registered via Support.Page) are legitimate history entries, not a stuck state.
- **Evidence**: `// Safeguard: If the previous page is the same as the current page,
if (previous.page === current.navigation.current.page) {
	return {
		navigation: {
			previousPages: [],
			current: { page: "HOME" } as NavigationState<Routes>,`
- **Suggested fix**: Compare full navigation states (page AND params, e.g. shallow-equal params) before triggering the safeguard, so CONVERSATION(A) -> CONVERSATION(B) goBack correctly returns to A; also have navigate() skip pushing when the new state deep-equals the current one to prevent true duplicates.
- **Verifier**: Verified in packages/core/src/store/support-store.ts:287-297: goBack's safeguard compares only `previous.page === current.navigation.current.page` (params ignored) and on match resets to HOME with `previousPages: []`. The scenario is reachable via the documented SDK surface: SupportHandle.openConversation (packages/react/src/support/context/handle.tsx:105-112) and controller.openConversation (pack

### C-53 [MEDIUM] [docs] Relative timestamps and tool-activity strings are hardcoded English, bypassing the locale system
- **File**: packages/react/src/support/utils/time.ts:18  |  **Dimension**: support-ui
- **Description**: The widget ships fr/es locales and a content-override system, but formatTimeAgo returns hardcoded English ("now", "Yesterday", "3 days ago", "2 weeks ago") and is rendered in customer-facing conversation previews via use-conversation-preview.ts:200. Other customer-visible strings also bypass i18n: timeline-search-knowledge-tool.tsx:43-65 ("Searching knowledge base...", "Knowledge base lookup failed", "Finished knowledge base search") and timeline-message-item.tsx:251 ("Download file"). A French visitor with locale="fr" sees mixed French/English UI with no override hook to fix it.
- **Evidence**: `if (diffMins < 1) {
	return "now";
}
if (diffMins < 60) {
	return `${diffMins}m ago`;
}
...
if (diffDays === 1) {
	return "Yesterday";`
- **Suggested fix**: Route these strings through the SupportText system: add text keys (e.g. time.now/time.minutesAgo/tool.searchKnowledge.*/common.actions.downloadFile) with en/fr/es entries, and reimplement formatTimeAgo on Intl.RelativeTimeFormat(locale) so it localizes for free.
- **Verifier**: Verified in source: formatTimeAgo (support/utils/time.ts:18-42) returns hardcoded English ("now", "Yesterday", "N days ago") and feeds customer-facing conversation previews via use-conversation-preview.ts:200 -> conversation-button-link.tsx:119, which itself uses useSupportText() for its other strings — producing mixed-language UI. The package ships a real i18n system (SupportTextProvider with en/

### C-54 [MEDIUM] [bug] Locale-keyed content overrides with region subtags (e.g. "pt-BR") never match and fall back to English
- **File**: packages/react/src/support/text/runtime.ts:211  |  **Dimension**: support-ui
- **Description**: SupportTextContentOverrides<Locale> explicitly allows custom locale keys (`Partial<Record<SupportLocale | Locale, ...>>`), and Support is generic over Locale precisely to support values like "pt-BR" or "en-US". But normalizeOverrides stores override keys as full lowercased tags ("pt-br") while buildLocaleChain normalizes lookups to the base language ("pt-BR" -> "pt"). resolveMessage therefore never finds the override and silently renders the built-in English string — the advertised mechanism for adding a non-builtin language is broken whenever a region subtag is used.
- **Evidence**: `byLocale.set(
	locale.toLowerCase(),
	localizedValue as SupportLocaleMessages[typeof key]
);
/* vs buildLocaleChain: */ const normalized = normalizeLocaleString(value); // "pt-BR" -> "pt"`
- **Suggested fix**: In normalizeOverrides, key byLocale with the same normalizeLocaleString() used by buildLocaleChain (optionally also keeping the full tag for exact matches), so `content={{ key: { "pt-BR": ... } }}` resolves when locale="pt-BR".
- **Verifier**: Verified the asymmetry in packages/react/src/support/text/runtime.ts: normalizeOverrides stores override keys as the full lowercased tag ("pt-BR" -> "pt-br", line 211-214), while buildLocaleChain normalizes lookup locales to the base language via normalizeLocaleString ("pt-BR" -> "pt", lines 140-162). resolveMessage (lines 234-239) queries byLocale with chain entries ("pt", "en"), never "pt-br", s

### C-55 [MEDIUM] [build] Non-co-prefixed Tailwind color utilities are silently absent from the published styles.css
- **File**: packages/react/src/support/components/button.tsx:7  |  **Dimension**: support-ui
- **Description**: CoButton uses host-theme color utilities (`focus-visible:border-ring`, `focus-visible:ring-ring/50`, `aria-invalid:border-destructive`, `aria-invalid:ring-destructive/20`) and primitives/tool-activity-row.tsx:30-38 uses `text-muted-foreground`, `text-destructive/70`, `text-primary/70`. The widget's Tailwind build only defines `--color-co-*` tokens, so none of these rules exist in dist/styles.css (verified: zero matches for ring-ring, border-ring, text-muted-foreground, aria-invalid:border-destructive). For non-Tailwind hosts, every button's focus indicator degrades to a full-opacity currentColor ring, aria-invalid styling is missing entirely, and tool-activity rows lose their muted/error colors; for Tailwind hosts they compile against the host's unscoped theme, producing unpredictable colors.
- **Evidence**: `"...outline-none transition-all hover:cursor-pointer focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20..."`
- **Suggested fix**: Replace all non-prefixed theme colors with their co- equivalents (focus-visible:border-co-ring, focus-visible:ring-co-ring/50, aria-invalid:*-co-destructive*, text-co-muted-foreground, text-co-primary/70, text-co-destructive/70) and add a lint/CI grep that fails on `(ring|border|bg|text)-(ring|destructive|primary|muted|accent|foreground)` without the co- prefix under src/support, src/primitives, and src/feedback.
- **Verifier**: Verified: button.tsx:7 base cva contains shadcn-copied unprefixed utilities (focus-visible:border-ring, focus-visible:ring-ring/50, aria-invalid:border-destructive, aria-invalid:ring-destructive/20) while the widget theme (support/support.css @theme inline, lines 205-246) defines only --color-co-* tokens; dist/styles.css empirically has zero matches for border-ring/ring-ring/text-muted-foreground/

### C-56 [LOW] [footprint] Feedback module imports full @floating-ui/react (169KB ESM) when only @floating-ui/react-dom (10.6KB) APIs are used
- **File**: packages/react/src/feedback/components/content.tsx:10  |  **Dimension**: feedback
- **Description**: content.tsx imports only useFloating, autoUpdate, flip, offset, shift, and the Placement type — every one of which is exported by @floating-ui/react-dom (10,578 bytes ESM). Instead it imports from @floating-ui/react (168,972 bytes ESM, plus the extra `tabbable` and `@floating-ui/utils` dependencies), whose useFloating wraps the react-dom version with the full FloatingContext/event machinery that this code never uses. The same import exists in src/support/components/content.tsx:10. This bloats every npm consumer's bundle and contributes to the 679KB browser widget.js, directly against the tiny-footprint goal.
- **Evidence**: `import {
	autoUpdate,
	flip,
	offset,
	type Placement,
	shift,
	useFloating,
} from "@floating-ui/react";`
- **Suggested fix**: Change both import sites to `from "@floating-ui/react-dom"` (drop-in for these symbols; only unused return fields like `context` differ), replace the `@floating-ui/react` dependency in packages/react/package.json with `@floating-ui/react-dom`, and rebuild the browser widget.
- **Verifier**: Verified: packages/react/src/feedback/components/content.tsx:3-10 and packages/react/src/support/components/content.tsx:3-10 import only useFloating/autoUpdate/flip/offset/shift/Placement from "@floating-ui/react" (dep at packages/react/package.json:89), and every used option (placement, strategy, middleware, whileElementsMounted, open, elements.reference) and return field (refs, update, x, y, isP

### C-57 [LOW] [a11y] Default trigger and header close/back buttons have no accessible name
- **File**: packages/react/src/support/components/trigger.tsx:129  |  **Dimension**: support-ui
- **Description**: The default floating trigger — the sole entry point to the widget — is an icon-only <button> with no aria-label (its content is SVG icons, and in the chevron/typing states there is no text alternative at all). The header's close and back CoButtons (header.tsx:52 and :64) are likewise icon-only with no label, and image-lightbox.tsx hardcodes English aria-labels ("Close lightbox", "Previous image") bypassing the locale system. Screen-reader users hear unnamed "button" for the widget's primary controls. The codebase already localizes aria-labels elsewhere (multimodal-input.tsx:180,225), so the pattern exists.
- **Evidence**: `return (
	<button
		className={cn(
			"fixed right-4 bottom-4 z-[9999] flex size-14 cursor-pointer items-center justify-center rounded-full bg-co-primary...",
		...
		onClick={toggle}
		type="button"
	>`
- **Suggested fix**: Add localized aria-labels via useSupportText: dynamic `aria-label={isOpen ? text("common.actions.close") : text("common.actions.openSupport")}` on the default trigger, aria-label on the header close/back CoButtons, and text keys for the lightbox labels.
- **Verifier**: Partially as described. Verified: the default trigger button (trigger.tsx:129) and header back/close CoButtons (header.tsx:52,64) have no aria-label, and image-lightbox.tsx:141/153/161 hardcodes English aria-labels ("Close lightbox", "Previous image", "Next image") despite a locale system used for aria-labels elsewhere (multimodal-input.tsx:180,225). BUT the claimed failure ("screen-reader users h

## UNCERTAIN findings (verifier unavailable — hand-verify before fixing)

### U-01 [CRITICAL] [bug] Documented CDN install snippet throws TypeError: async loader gives no pre-load stub before inline init() runs
- **File**: packages/browser/README.md:37  |  **Dimension**: browser-embed
- **Description**: The README (and npm README, copied by prepare-package) tells users to load loader.js with `async` and immediately call `window.Cossistant.init()` in the next inline script. `window.Cossistant` is only created when loader.js executes (loader-runtime.ts installs the stub), and an async external script virtually never executes before the inline script that follows it in the HTML. Result: `TypeError: Cannot read properties of undefined (reading 'init')` and the widget never initializes — the primary '<script> chat-sdk' story is broken as documented. There is also no official inline pre-stub snippet (Intercom/GA pattern), and even a hand-written stub is discarded by loader-runtime.ts:113 unless it has BOTH `__queue` and `__assets` keys, silently dropping queued calls.
- **Evidence**: `<script async src="https://cdn.cossistant.com/widget/latest/loader.js"></script>
<script>
  window.Cossistant.init({`
- **Suggested fix**: Document an inline stub snippet that creates the queue before the async loader runs, e.g. `window.Cossistant=window.Cossistant||{__queue:q=[],init:(...a)=>q.push({method:'init',args:a}),show:...}` (or generate it), and relax the adoption check in loader-runtime.ts:113 to only require `__queue` (assets are re-assigned on line 117 anyway). Alternatively drop `async` from the documented snippet.

### U-02 [CRITICAL] [bug] User's message text and files are irrecoverably lost when a send fails
- **File**: packages/react/src/hooks/use-message-composer.ts:218  |  **Dimension**: state-consistency
- **Description**: useMultimodalInput.submit() optimistically clears the composer (message state, files, localStorage draft via reset()) and only restores it if onSubmit throws. But useMessageComposer's onSubmit calls sendMessage.mutate(), which is fire-and-forget: in use-send-message.ts:312 mutate is `void mutateAsync(opts).catch(() => {})`, so onSubmit always resolves successfully before the network request finishes. On a failed send, the restore path in use-multimodal-input.ts:212-216 never runs. Meanwhile @cossistant/core client.sendMessage removes the optimistic timeline item on error (client.ts:633). Net result: the message vanishes from the timeline, the composer is empty, and the persisted draft was cleared — the visitor must retype everything.
- **Evidence**: `sendMessage.mutate({
	conversationId,
	message: messageText,  // onSubmit resolves immediately; mutate = void mutateAsync(opts).catch(() => {})`
- **Suggested fix**: In useMessageComposer's onSubmit, `await sendMessage.mutateAsync({...})` instead of calling mutate(), so a rejected send propagates to useMultimodalInput's catch block, which restores message/files/draft and sets the error state. Drop the now-duplicate onError forwarding inside the mutate options to avoid double onError calls.

### U-03 [HIGH] [bug] Queued command replay aborts the whole queue (including init) when any pre-init method throws
- **File**: packages/browser/src/embed/widget-runtime.ts:320  |  **Dimension**: browser-embed
- **Description**: The loader stub happily queues any call order (e.g. `Cossistant.show(); Cossistant.init({...})` or `identify()` before `init()`). On widget.js load, the replay loop calls each method directly; `show`/`hide`/`toggle`/`identify` go through requireWidget() (line 141) which throws 'requires window.Cossistant.init() to be called first'. The throw is uncaught inside installCossistantBrowserRuntime(), aborting the loop, so the queued `init` that follows is never executed — the widget never mounts and an uncaught error surfaces during widget.js evaluation. The queue contract (deferred execution) is violated by strict runtime semantics.
- **Evidence**: `for (const queuedCall of existing?.__queue ?? []) {
	const method = api[queuedCall.method];
	if (typeof method === "function") {
		(method as (...args: unknown[]) => unknown)(...queuedCall.args);`
- **Suggested fix**: Wrap each replayed call in try/catch (console.error the failure) so one bad call cannot swallow the queued init; optionally reorder replay to run `init` calls first, or defer show/hide/toggle/identify replays until after a widget exists.

### U-04 [HIGH] [dx] react/react-dom are hard dependencies pinned to ^19, conflicting with @cossistant/react's >=18 <20 peer range — dual-React crash for React 18 hosts
- **File**: packages/browser/package.json:39  |  **Dimension**: browser-embed
- **Description**: @cossistant/browser declares react/react-dom as regular dependencies (^19.2.0) while @cossistant/react declares them as peerDependencies (>=18 <20). In an npm app on React 18, the browser package gets a nested react@19: mount-support-widget.js resolves `react`/`react-dom/client` to the nested 19 copy, while @cossistant/react's components resolve `react` to the host's 18 copy. Rendering SupportProvider (React 18 instance) through createRoot from react-dom 19 produces 'Invalid hook call'/context failures — the npm surface of the package is broken for React 18 consumers, and even matching-version hosts risk shipping a duplicate React (~40KB gzip).
- **Evidence**: `"react": "^19.2.0",
    "react-dom": "^19.2.0"`
- **Suggested fix**: Move react and react-dom to peerDependencies with the same range as @cossistant/react (">=18 <20"). The CDN embed is unaffected since tsdown.embed.config.ts aliases them to preact/compat at build time.

### U-05 [HIGH] [footprint] widget.js bundles all of zod v4 + @hono/zod-openapi because two schema-free helpers live in the zod schema module
- **File**: packages/types/src/api/support.ts:1  |  **Dimension**: browser-embed
- **Description**: Reported here because it directly bloats the browser embed: core's client.ts and store/support-state-store.ts import `applySupportOnboardingUpdate`/`normalizeSupportOnboardingState` from @cossistant/types/api/support — a module whose top-level consts build zod schemas with `.refine().openapi()` calls that rolldown cannot tree-shake as pure. The embed bundles core dist with `noExternal: [/.*/]`, so widget.js (679KB min/191KB gzip) contains the full zod v4 string-format validators (verified markers in dist/embed/widget.js: base64url x101, ksuid x55, E.164 x46, too_big x58, toJSONSchema x5) plus the zod-openapi wrapper — easily on the order of 100KB+ minified — even though the two helpers used at runtime (lines 148-203) contain zero zod code. This is the single biggest lever on the 191KB gzip embed.
- **Evidence**: `import { z } from "@hono/zod-openapi";`
- **Suggested fix**: Move normalizeSupportOnboardingState and applySupportOnboardingUpdate (plus normalizeSupportFeatureFlags if needed) into a zod-free module, e.g. packages/types/src/api/support-runtime.ts, and update the two core imports; re-export from support.ts for compatibility. widget.js then drops zod/@hono/zod-openapi entirely.

### U-06 [HIGH] [build] pub:release scripts publish a broken package — npm ignores publishConfig.directory
- **File**: packages/react/package.json:140  |  **Dimension**: build-packaging
- **Description**: All three packages' pub:release/pub:beta/pub:next scripts run `npm publish` from the package root, relying on `publishConfig: { directory: "dist" }`. That key is a pnpm-only feature; npm (verified on npm 11.16.0 with `npm pack --dry-run` from packages/react) packs the ROOT package.json plus 264 files under a `dist/` prefix. The resulting package's main/module/types/exports all point at ./src/*.ts files that are not in the tarball — every import of @cossistant/react would fail to resolve. The published 0.2.0 on npm is correct (flattened dist layout), meaning the last release was done by manually publishing from inside dist/ — the scripts as written will ship a broken release the first time someone follows them. Same pattern exists in packages/next/package.json (line 91) and packages/browser/package.json (line 58). Note also that check-package-output.ts exists but is not wired into any build/publish script.
- **Evidence**: `"pub:release": "bun run build && npm publish --access public" ... "publishConfig": { "access": "public", "directory": "dist" }`
- **Suggested fix**: Publish the dist folder explicitly in all three packages: `"pub:release": "bun run build && bun run check:pack && npm publish ./dist --access public"` (npm publish accepts a folder arg and uses dist/package.json, which prepare-package already writes with directory removed). Apply the same to pub:beta/pub:next and to packages/next and packages/browser, and wire check:pack in before publishing.

### U-07 [HIGH] [footprint] zod v4 (with all locales) + @hono/zod-openapi bundled into widget.js and every React SDK consumer bundle
- **File**: packages/types/src/api/support.ts:1  |  **Dimension**: build-packaging
- **Description**: @cossistant/core's client imports runtime values (applySupportOnboardingUpdate, EMPTY_SUPPORT_ONBOARDING_STATE) from @cossistant/types/api/support, whose module top-level is `import { z } from "@hono/zod-openapi"`. Because core's tsdown external list uses the bare string "@cossistant/types" (packages/core/tsdown.config.ts line ~21), the subpath import doesn't match and the module is vendored into core's dist (packages/core/dist/client.js line 1: `import { applySupportOnboardingUpdate } from "./types/src/api/support.js";`), keeping @hono/zod-openapi + zod as runtime dependencies of the published @cossistant/core@0.2.0. Consequences: (a) the browser embed's widget.js bundles zod v4 core, its full i18n locale set (verified Dutch/Spanish/Polish/Japanese/Turkish/Danish/German error strings in the bundle) and @hono/zod-openapi — roughly a 210KB contiguous region of the 679KB file, a large share of the 191KB gzip; (b) every app bundling @cossistant/react (which externalizes @cossistant/core) pulls the same ~200KB of server-grade schema tooling into its client bundle just for two tiny helpers.
- **Evidence**: `import { z } from "@hono/zod-openapi";`
- **Suggested fix**: Split the plain runtime helpers (applySupportOnboardingUpdate, EMPTY_SUPPORT_ONBOARDING_STATE, related types) out of packages/types/src/api/support.ts into a zod-free module (e.g. types/src/api/support-runtime.ts) and import that from core's client/index/support-state-store. Also change core's external to a regex (/^@cossistant\/types(\/.*)?$/) so subpath imports stop being vendored, then drop zod and @hono/zod-openapi from @cossistant/core's dependencies.

### U-08 [HIGH] [docs] Browser README CDN snippet throws: async loader executes after the inline init call
- **File**: packages/browser/README.md:37  |  **Dimension**: docs-accuracy
- **Description**: The only documented CDN usage loads loader.js with `async` and then immediately calls `window.Cossistant.init()` in the next inline script. The command-queue stub is only installed when loader.js executes (packages/browser/src/embed/loader-runtime.ts `installCossistantBrowserLoader()` creates `globalWindow.Cossistant = stub`), and an async external script virtually always runs after the inline script that follows it. Copy-pasting the README snippet throws `TypeError: Cannot read properties of undefined (reading 'init')` and the widget never mounts. There is no pre-init stub snippet for users to install first.
- **Evidence**: `<script async src="https://cdn.cossistant.com/widget/latest/loader.js"></script>
<script>
  window.Cossistant.init({`
- **Suggested fix**: Either drop `async` from the documented script tag (loader.js is 646B gzip, sync cost is negligible), or document a guaranteed-safe snippet that pre-installs the queue stub inline before loading loader.js (e.g. `window.Cossistant = window.Cossistant || {__queue:q=[], init:(...a)=>q.push({method:'init',args:a}), ...}`) matching the `__queue`/`__assets` shape loader-runtime.ts already re-uses.

### U-09 [HIGH] [docs] Documented `new CossistantClient({ publicKey })` fails to compile and breaks at runtime (apiUrl/wsUrl required)
- **File**: packages/react/README.md:60  |  **Dimension**: docs-accuracy
- **Description**: The headless-primitives quickstart in the README, plus apps/web/content/docs/support-component/hooks.mdx:475 and apps/web/content/docs/user-feedback/index.mdx:218 and 285, all construct `new CossistantClient({ publicKey: "pk_..." })`. `CossistantClientConfiguration = CossistantConfig & {...}` and `CossistantConfig` (packages/types/src/index.ts:17) declares `apiUrl: string; wsUrl: string;` as required, so the snippet is a TypeScript error. Even in JS, CossistantRestClient builds URLs via `${this.config.apiUrl}${path}` (packages/core/src/rest-client.ts:429), producing requests to "undefined/...". The defaults exist only in support-controller.ts (DEFAULT_API_URL/DEFAULT_WS_URL), not in the client the docs promote for provider-free usage. support-state.mdx works around it by passing both URLs explicitly, proving the other snippets are stale.
- **Evidence**: `const client = new CossistantClient({ publicKey: "pk_live_..." });`
- **Suggested fix**: Make `apiUrl`/`wsUrl` optional on CossistantClientConfiguration and default them inside `CossistantClient`/`CossistantRestClient` to the existing DEFAULT_API_URL/DEFAULT_WS_URL constants (best DX fix, matches all docs), or update the four doc snippets to pass apiUrl/wsUrl explicitly as support-state.mdx does.

### U-10 [HIGH] [docs] React AI-prompt quickstart and onboarding code use COSSISTANT_API_KEY / process.env in Vite entry files
- **File**: apps/web/src/lib/support-integration-guide.ts:211  |  **Dimension**: docs-accuracy
- **Description**: The `<QuickstartAIPrompt framework="react" />` embedded in apps/web/content/docs/quickstart/react.mdx builds its prompt from this guide, which sets `envVarName: "COSSISTANT_API_KEY"` with envFileName `.env` for a React project whose provider file is `src/main.tsx` (a Vite entry). Vite only exposes `VITE_`-prefixed vars via `import.meta.env`, so `resolvePublicKey()` (packages/core/src/resolve-public-key.ts) can never find the key and the widget shows a configuration error. Worse, the providerCode/cssPlainCode samples (lines 223 and 309, rendered verbatim in the dashboard onboarding flow) interpolate `process.env.COSSISTANT_API_KEY` in client code, which throws `ReferenceError: process is not defined` in Vite. This contradicts the manual quickstart on the same page, which correctly uses VITE_COSSISTANT_API_KEY.
- **Evidence**: `envVarName: "COSSISTANT_API_KEY",
... <SupportProvider publicKey={process.env.COSSISTANT_API_KEY}>`
- **Suggested fix**: In the react guide entry, set envVarName to "VITE_COSSISTANT_API_KEY" and change providerCode/cssPlainCode to `<SupportProvider publicKey={import.meta.env.VITE_COSSISTANT_API_KEY}>` (or omit the prop and rely on auto-detection, which already supports Vite).

### U-11 [HIGH] [ssr] Persisted isOpen/navigation read from localStorage during render causes hydration mismatch for returning visitors
- **File**: packages/react/src/provider.tsx:204  |  **Dimension**: ssr-safety
- **Description**: SupportProvider creates the controller inside React.useMemo during render. createSupportController (core/src/support-controller.ts:331) calls createSupportStore with getBrowserStorage(), and core/src/store/support-store.ts getInitialState() synchronously reads the persisted state — whose PersistedConfig explicitly includes isOpen ('type PersistedConfig = Pick<SupportConfig, "size" | "isOpen">'). On the server storage is null so isOpen=false and only the trigger is rendered; on the client hydration render the store already holds isOpen=true (and a persisted navigation page) for any visitor who left the widget open, so useSupportConfig (src/support/store/support-store.ts:186 'config?.isOpen ?? false') renders the entire open panel. getServerSnapshot in useStoreSelector returns this client-side persisted value during hydration, so React sees completely different markup than the SSR HTML.
- **Evidence**: `const ownedController = React.useMemo(
() =>
createSupportController({`
- **Suggested fix**: In core createSupportStore, initialize with createDefaultState() only, and apply the persisted snapshot after mount (e.g., expose store.rehydrate() that the provider calls in a useEffect, or at minimum exclude isOpen/navigation from the synchronous initial state and merge them post-hydration).

### U-12 [HIGH] [bug] Conversation creation fails outright for visitors whose clock is >5 min fast
- **File**: packages/core/src/client.ts:555  |  **Dimension**: state-consistency
- **Description**: When the first message creates a conversation, the SDK sends client-clock timestamps to the server: buildTimelineItemPayload (react use-send-message.ts:88) and normalizeBootstrapTimelineItem/sendMessage's optimisticTimelineItem (core client.ts:517-521, 941-943) all set createdAt = new Date().toISOString(), and the pending path forwards them verbatim in createConversation.defaultTimelineItems. The API rejects timestamps more than 5 minutes in the future (apps/api/src/rest/client-timeline-item-created-at.ts:1, conversation router returns 400: "defaultTimelineItems createdAt more than 5 minutes in the future"). A visitor with a skewed system clock can therefore never start a conversation — every first message 400s (and combined with the draft-loss bug, their text is destroyed). Notably, the non-pending sendMessage path already strips createdAt (client.ts:612) precisely to let the server assign timestamps; the createConversation path does not. Client-clock createdAt also causes transient mis-ordering of the optimistic bubble when the clock is behind the server.
- **Evidence**: `defaultTimelineItems: [
	...pending.initialTimelineItems,
	optimisticTimelineItem,  // createdAt = client new Date().toISOString()
],`
- **Suggested fix**: In the pending branch of CossistantClient.sendMessage, strip createdAt from every item before calling restClient.createConversation (mirror the `const { createdAt: _createdAt, ...restItem } = rest.item` pattern used in the non-pending branch); keep the client timestamp only on the locally-ingested optimistic items. Server assigns timestamps when createdAt is omitted.

### U-13 [HIGH] [bug] Messages received while the WebSocket was down are never fetched after reconnect
- **File**: packages/react/src/hooks/use-conversation-timeline-items.ts:102  |  **Dimension**: state-consistency
- **Description**: Timeline data is only fetched on first mount when the store is empty; polling and focus refetch are disabled by default, and nothing in the react package or core subscribes to the realtime connection state to resync after a drop (grep for isConnected/onConnect consumers finds only the typing reporter; RealtimeClient has no missed-event replay). Scenario: widget open, laptop sleeps or network blips, agent replies during the gap, RealtimeClient auto-reconnects — the agent's messages never appear (and unread counts/sounds never fire) until a full page reload, because refetchOnMount is `selection.items.length === 0` and no reconnect-triggered refetch exists.
- **Evidence**: `refetchInterval: options.refetchInterval ?? false,
refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
refetchOnMount: selection.items.length === 0,`
- **Suggested fix**: Trigger a page-1 refetch on realtime reconnect: in useConversationPage (or a small hook shared by timeline consumers), watch websocket.isConnected and call timelineQuery.refetch() on a false→true transition (and refetch the conversations list similarly). Alternatively default refetchOnWindowFocus to true as a cheap safety net.

### U-14 [HIGH] [bug] Standalone RealtimeProvider is permanently dead under React StrictMode
- **File**: packages/react/src/realtime/provider.tsx:123  |  **Dimension**: state-consistency
- **Description**: The publicly exported RealtimeProvider (./realtime) destroys its RealtimeClient in the unmount cleanup and nulls the ref. Under StrictMode (Next.js dev default) effects run setup→cleanup→setup: the cleanup calls destroy() (which sets a permanent `destroyed` flag — core realtime-client.ts:466 `if (this.destroyed) { return; }` in connect()), then the connect effect re-runs with the same render-scoped `client` const pointing at the destroyed instance, so connect() no-ops and no re-render occurs to recreate the client. Realtime never connects in dev. The equivalent bug was fixed for SupportProvider in commit 41fd069d (deferred disposal) but not here. Additionally the onConnect/onDisconnect/onError props are captured once in the constructor and never updated (the effect at lines 106-109 is an admitted no-op), so consumers' updated callbacks are stale.
- **Evidence**: `() => () => {
	clientRef.current?.destroy();
	clientRef.current = null;
},`
- **Suggested fix**: Apply the same StrictMode-safe pattern as provider.tsx: defer destroy via setTimeout(0) and cancel it if the effect re-runs; or recreate the client inside the connect effect when clientRef.current is null/destroyed. Also route onConnect/onDisconnect/onError through refs so latest props are invoked.

### U-15 [MEDIUM] [bug] Widget can mount before <body> exists: resolveMountTarget returns null document.body without a guard
- **File**: packages/browser/src/mount-support-widget.ts:141  |  **Dimension**: browser-embed
- **Description**: The loader appends widget.js to document.head with async=true; if it executes while the parser is still in <head> (cached asset, fast CDN), the queued `init()` is replayed immediately and mountSupportWidget() defaults its container to `doc.body`, which is null at that point. createMountContext then calls `mountTarget.appendChild(hostElement)` (line 199) on null — TypeError, widget never mounts, and per the finding above the rest of the queue is dropped. Third-party embeds conventionally defer mounting until body is available; this one crashes intermittently depending on load timing.
- **Evidence**: `if (!container) {
		return doc.body;
	}`
- **Suggested fix**: In resolveMountTarget, fall back to `doc.body ?? doc.documentElement`, or have installCossistantBrowserRuntime defer queue replay/mounting behind `if (document.body) {...} else document.addEventListener('DOMContentLoaded', ...)`.

### U-16 [MEDIUM] [bug] Pre-init updateConfig({ open: true }) is silently dropped when the widget first mounts
- **File**: packages/browser/src/embed/widget-runtime.ts:107  |  **Dimension**: browser-embed
- **Description**: updateConfig() called before init() (a supported flow — it merges into pendingConfig, and the loader stub also queues this ordering) stores the `open` key. On init(), the merged options go through normalizeInitOptions, which only maps `defaultOpen` into provider options and has no handling for `open`. So `Cossistant.updateConfig({ open: true }); Cossistant.init({...})` mounts the widget closed with no error, while the same call after init works (normalizeUpdateOptions line 128-133 does map `open`). Asymmetric, silent config loss.
- **Evidence**: `provider: {
			apiUrl: options?.apiUrl,
			autoConnect: options?.autoConnect,
			defaultMessages: options?.defaultMessages,
			defaultOpen: options?.defaultOpen,`
- **Suggested fix**: In normalizeInitOptions, map both keys: `defaultOpen: options?.defaultOpen ?? (options as CossistantBrowserUpdateConfigOptions)?.open` (or normalize `open` -> `defaultOpen` when merging pendingConfig in init()).

### U-17 [MEDIUM] [build] Published tarball ships ~580KB of duplicated vendored d.ts (dist/packages) and public types reference the vendored copies instead of the real @cossistant/react dependency
- **File**: packages/browser/package.json:52  |  **Dimension**: browser-embed
- **Description**: Unlike @cossistant/react's build (`tsdown && bun run rewrite:types && rm -rf dist/node_modules dist/packages ...`), the browser build has no rewrite/cleanup step. dts.resolve emits cross-package declarations into dist/packages/{core,react,types}/src (~580KB with .d.ts.map files) and dist/mount-support-widget.d.ts imports `from "./packages/react/src/provider.js"` while the runtime JS imports `@cossistant/react/provider`. Since prepare-package deletes the `files` field and publishes from dist/, all of dist/packages lands in the npm tarball, and consumers get two distinct type identities for SupportProvider/SupportProps (vendored snapshot vs the actual @cossistant/react dependency), which breaks assignability as soon as versions drift.
- **Evidence**: `"build": "bun run build:lib && bun run build:embed && bun run prepare-package",`
- **Suggested fix**: Mirror the react package: add a rewrite-dist-types step that rewrites `./packages/<pkg>/src/...` imports back to `@cossistant/<pkg>/...` specifiers, then `rm -rf dist/node_modules dist/packages` before prepare-package.

### U-18 [MEDIUM] [footprint] ~24KB of base64 AAC audio is inlined into widget.js instead of shipped as CDN assets
- **File**: packages/react/src/sounds/sound-data.ts:4  |  **Dimension**: browser-embed
- **Description**: Two data:audio/mp4 base64 blobs (measured ~7.7KB and ~16.2KB in dist/embed/widget.js at offsets 529104/537236) are bundled into the embed's critical-path script. Base64 in JS compresses poorly (~18KB of the 191KB gzip, ~9%), is parsed on every page view, and is only needed when a sound actually plays. The embed build already publishes a versioned asset directory next to widget.js (loader derives baseUrl), so real .m4a files could live there.
- **Evidence**: `export const NEW_MESSAGE_SOUND_DATA_URL =
	"data:audio/mp4;base64,AAAAHGZ0e`
- **Suggested fix**: For the embed build, alias the sound-data module (tsdown.embed.config.ts alias block) to a tiny stub that lazily fetches `new URL('sounds/new-message.m4a', assets.baseUrl)`, and upload the .m4a files with the other embed assets in release.yml; alternatively make sound-data a dynamic import in use-sound-effect.

### U-19 [MEDIUM] [footprint] ulid is a dead dependency of @cossistant/react
- **File**: packages/react/package.json:94  |  **Dimension**: build-packaging
- **Description**: `ulid` appears in @cossistant/react's dependencies (and in tsdown.config.ts's external list, line 45), but zero files under packages/react/src import it — the only ID generator used is nanoid's customAlphabet (src/utils/id.ts). ulid is actually used by @cossistant/core (src/utils.ts), which already declares it itself. Every SDK consumer installs an extra package for nothing, and the dep list misleadingly suggests two ID generators are needed.
- **Evidence**: `"nanoid": "^5.1.5",
    "tailwind-merge": "^3.3.1",
    "ulid": "^3.0.1"`
- **Suggested fix**: Remove "ulid" from packages/react/package.json dependencies and from the external array in packages/react/tsdown.config.ts.

### U-20 [MEDIUM] [dx] Published dist is minified with no sourcemaps and stripped @__PURE__ annotations
- **File**: packages/react/tsdown.config.ts:24  |  **Dimension**: build-packaging
- **Description**: The react build sets minify: true and sourcemap: false, and the build script additionally runs `find dist -name '*.map' -delete` (package.json line 135). The published unbundled files are therefore unreadable single-line minified JS with no way to map stack traces back to source — poor DX for a headless SDK whose users are expected to read/debug primitives. Minification also strips /* @__PURE__ */ annotations (verified: 0 occurrences across dist/index.js, dist/provider.js, dist/support/components/button.js), weakening statement-level tree-shaking in consumers' bundlers for module-scope calls like cva()/createContext() in partially-used modules (module-level pruning still works via sideEffects). Since every consumer re-minifies in their own build, shipping minified library code saves nothing for bundler users while costing debuggability.
- **Evidence**: `minify: true,
	sourcemap: false,`
- **Suggested fix**: Set minify: false (or at minimum preserve legal/annotation comments) and sourcemap: true in packages/react/tsdown.config.ts, and drop the `find dist -name '*.map' -delete` step from the build script. Compare dist size before/after — unminified+gzip is typically close to minified+gzip for library code.

### U-21 [MEDIUM] [footprint] Headless primitives import styled-support internals, pulling tailwind-merge and the full 15KB icon registry
- **File**: packages/react/src/primitives/feedback-topic-select.tsx:2  |  **Dimension**: build-packaging
- **Description**: Several primitives (feedback-topic-select, feedback-rating-selector, feedback-comment-input, tool-activity-row, window) import from ../support/*: `cn` from support/utils brings in tailwind-merge (~20KB min) + clsx, and `Icon` from support/components/icons brings in a single-module iconRegistry containing all 17 icon path strings (dist/support/components/icons.js is 15KB, the second-largest file in dist, and is not tree-shakeable per-icon because all icons live in one Record). A user importing one "headless" primitive from @cossistant/react/primitives/feedback-topic-select therefore ships ~35KB of styled-layer baggage, undercutting the headless/tiny-footprint promise.
- **Evidence**: `import { Icon } from "../support/components/icons";
import { cn } from "../support/utils";`
- **Suggested fix**: For primitives, use a twMerge-free class joiner (clsx alone suffices where primitives don't emit conflicting Tailwind classes), and split iconRegistry into per-icon modules (or per-icon exports consumed via direct imports) so importing one icon doesn't retain all 17 path strings.

### U-22 [MEDIUM] [docs] Quickstart 'Other' tab tells CRA/Remix users to set COSSISTANT_API_KEY, which never reaches browser code
- **File**: apps/web/content/docs/quickstart/react.mdx:92  |  **Dimension**: docs-accuracy
- **Description**: The "Other" env tab says: "For other frameworks (CRA, Remix, etc.), either set the env variable: COSSISTANT_API_KEY=pk_test_xxxx". resolve-public-key.ts reads `process.env.COSSISTANT_API_KEY` at runtime, but CRA's DefinePlugin only embeds REACT_APP_*-prefixed vars (so the lookup yields undefined) and Remix does not expose process.env to client bundles at all. Users following this tab for exactly the frameworks it names get the widget configuration error with no build-time warning. The same claim is repeated in apps/web/content/docs/quickstart/api-keys.mdx:35 and its auto-detection alert.
- **Evidence**: `For other frameworks (CRA, Remix, etc.), either set the env variable:

```bash title=".env"
COSSISTANT_API_KEY=pk_test_xxxx`
- **Suggested fix**: For the "Other" tab, lead with the `publicKey` prop as the primary path and clarify that `COSSISTANT_API_KEY` only works when the bundler/server injects it into client code (e.g. custom DefinePlugin or SSR), explicitly noting CRA needs the key passed as a prop.

### U-23 [MEDIUM] [docs] Browser/CDN embed has no documentation page on the docs site
- **File**: apps/web/content/docs/quickstart/meta.json:2  |  **Dimension**: docs-accuracy
- **Description**: The docs navigation (quickstart pages: index, react, api-keys; root meta lists no browser section) contains zero coverage of the @cossistant/browser CDN embed: no mention of loader.js, the `window.Cossistant` global (init/show/hide/toggle/identify/updateConfig/on/off), shadow-DOM mounting, or --co-theme-* theming in the shadow tree. The only documentation is the npm README (whose sole snippet is itself broken, see separate finding). For a support widget product, script-tag installation is a first-class integration path for non-React sites and is currently undiscoverable from cossistant.com/docs.
- **Evidence**: `"pages": ["index", "react", "api-keys"],`
- **Suggested fix**: Add a `quickstart/browser.mdx` (or `others/browser-embed.mdx`) documenting the corrected script-tag snippet, the window.Cossistant API surface from packages/browser/src/embed/widget-runtime.ts (CossistantBrowserInitOptions: publicKey, defaultMessages, quickOptions, theme, container...), and shadow-DOM theming, then register it in the meta.json.

### U-24 [MEDIUM] [ssr] TimelineCommandBlock reads localStorage in useState lazy initializer, mismatching SSR markup
- **File**: packages/react/src/primitives/timeline-command-block.tsx:65  |  **Dimension**: ssr-safety
- **Description**: The initial state calls readStoredPackageManager(), which returns DEFAULT_PACKAGE_MANAGER on the server but the visitor's stored preference (e.g. "pnpm") during the client hydration render. The rendered activeCommand text and active tab therefore differ from the SSR HTML for any user who previously changed the preference, producing a React hydration error. The useEffect at line 73 already re-syncs from storage after mount, so the lazy read is redundant.
- **Evidence**: `const [packageManager, setPackageManager] =
	React.useState<CommandPackageManager>(() => readStoredPackageManager());`
- **Suggested fix**: Initialize with DEFAULT_PACKAGE_MANAGER unconditionally (React.useState<CommandPackageManager>(DEFAULT_PACKAGE_MANAGER)) and let the existing mount effect apply the stored preference.

### U-25 [MEDIUM] [ssr] Default messages get createdAt "" on the server, rendering "Invalid Date" in SSR HTML and mismatching on hydration
- **File**: packages/react/src/hooks/private/use-default-messages.ts:19  |  **Dimension**: ssr-safety
- **Description**: createDefaultMessageTimestamp() runs inside useMemo during render and returns "" on the server but a real ISO string on the client. When the widget is server-rendered open (defaultOpen, or persisted-open per the provider finding), timeline-message-item.tsx:270 renders timestamp.toLocaleTimeString(...) on new Date("") → the SSR HTML literally shows "Invalid Date", then hydration replaces it with the real time (text mismatch). The same useMemo also calls generateMessageId() (ulid — time+random) during render, so item ids/keys differ between server and client passes. use-conversation-page.ts:286 uses the identical createdAt pattern for the identification item.
- **Evidence**: `return typeof window !== "undefined" ? new Date().toISOString() : "";`
- **Suggested fix**: Never emit an empty createdAt: guard the timestamp rendering (skip TimelineItemTimestamp when Number.isNaN(timestamp.getTime())), and populate seed ids/timestamps in a post-mount effect (or keep them in the ref only after hydration) so server and client render identical markup.

### U-26 [MEDIUM] [ssr] Render-time date formatting uses server clock/timezone/locale, mismatching client hydration
- **File**: packages/react/src/primitives/day-separator.tsx:39  |  **Dimension**: ssr-safety
- **Description**: defaultFormatDate runs during render and (a) compares against new Date() (lines 8/18) — the server's clock and timezone decide "Today"/"Yesterday", which can disagree with the visitor's timezone — and (b) falls back to date.toLocaleDateString(undefined, …), which uses the Node process locale (often en-US/C) rather than the visitor's browser locale. The same implicit-locale pattern exists at render time in timeline-message-item.tsx:270 and timeline-item.tsx:557 (toLocaleTimeString([], …)), read-indicator.tsx:42 (toLocaleString(undefined, …)) and conversation-event.tsx:145/169. Any of these produce hydration text mismatches whenever the timeline is SSR'd open, even with valid dates.
- **Evidence**: `return date.toLocaleDateString(undefined, {
	year: "numeric",
	month: "long",
	day: "numeric",
});`
- **Suggested fix**: Pass the resolved widget locale (localeChain[0] from SupportTextProvider) explicitly to all toLocale* calls, and gate "Today"/"Yesterday" (and other now-relative labels) behind the existing isHydrated flag so the server renders the absolute date.

### U-27 [MEDIUM] [bug] Pagination cursor from fetchNextPage leaks into later refetches and across conversation switches
- **File**: packages/react/src/hooks/private/use-client-query.ts:141  |  **Dimension**: state-consistency
- **Description**: execute() persists whatever args were last passed (`argsRef.current = nextArgs`). After fetchNextPage passes an older-page cursor, that cursor becomes the sticky args for every subsequent automatic fetch: refetchInterval/refetchOnWindowFocus ticks re-fetch the old page instead of page 1 (new messages stop arriving via polling), and if the hook instance survives a conversationId change (deps effect calls `execute(argsRef.current)`), the NEW conversation is fetched with the OLD conversation's `timestamp_id` cursor, so its most recent messages are silently missing. Relatedly, the dedup queryKey in use-conversation-timeline-items.ts:82 is built from baseArgs.cursor, not the cursor actually being fetched, so a fetchNextPage issued while a same-key request is in flight returns the wrong page's promise from executeWithDeduplication.
- **Evidence**: `const nextArgs = args ?? argsRef.current;
argsRef.current = nextArgs;`
- **Suggested fix**: Reset argsRef.current to initialArgs whenever the dependencies/queryKey change (e.g. in the deps effect before fetching), and don't persist args passed to an explicit refetch(). Include the effective cursor/limit in the deduplication key instead of baseArgs' values.

### U-28 [MEDIUM] [dx] useConversationPage/useConversationLifecycle ignore conversationId prop changes
- **File**: packages/react/src/hooks/use-conversation-lifecycle.ts:97  |  **Dimension**: state-consistency
- **Description**: useConversationLifecycle seeds React state from initialConversationId and never resyncs when the prop changes. The docs tell consumers to pass "Initial conversation ID (from URL params, navigation state, etc.)", and the widget's own Router (primitives/router.tsx:43) renders `<Component params={params} />` without a key, so any navigation from CONVERSATION(A) to CONVERSATION(B) that doesn't unmount the page keeps rendering conversation A's timeline and sends new messages to A. Headless consumers using React Router param changes hit this immediately. Additionally, setConversationId invokes onConversationCreated inside the setState updater (lines 108-117), a side effect in an updater function that fires twice under StrictMode.
- **Evidence**: `const [conversationId, setConversationIdState] = useState(
	initialConversationId
);`
- **Suggested fix**: Sync state when the prop changes (store the previous initialConversationId in state and reset conversationId when it differs), and move the onConversationCreated callback out of the setState updater. Alternatively/additionally, key the routed page component by params.conversationId in the widget Router.

## LOW findings (unverified, polish tier)

### L-01 [LOW] [dx] peerDependency "@types/react": "" is an unconventional empty range; @cossistant/next has an orphaned peerDependenciesMeta entry
- **File**: packages/react/package.json:107  |  **Dimension**: api-dx
- **Description**: The empty-string range is treated as "*" by npm's semver, so installs work, but it is nonstandard, reads like a mistake, and places zero constraint relative to the `react: ">=18 <20"` peer — @types/react 17 would satisfy it while breaking typing. It also ships as-is in the published 0.2.0 manifest (verified against the registry). Additionally, packages/next/package.json declares `peerDependenciesMeta: { "@types/react": { "optional": true } }` (line 72) without any corresponding `@types/react` entry in its peerDependencies — a dangling meta entry.
- **Evidence**: `"@types/react": "",`
- **Suggested fix**: Use an explicit range matching the react peer: `"@types/react": "^18 || ^19"` (keep it optional in peerDependenciesMeta). In packages/next, either add the same @types/react peer or delete the orphaned peerDependenciesMeta block.

### L-02 [LOW] [dx] useTransitionSwap has public-grade JSDoc but is omitted from the hooks barrel
- **File**: packages/react/src/hooks/index.ts:30  |  **Dimension**: api-dx
- **Description**: src/hooks/use-transition-swap.ts carries full public-style documentation with @param/@returns/@example, and it sits in the public hooks/ directory (private helpers live in hooks/private/), yet it is the only hooks/*.ts file not re-exported from hooks/index.ts and has no subpath export — so it is unreachable from the published package. Either it is public and accidentally hidden, or it is private and misplaced; either way the convention (hooks/ = barrel-exported, hooks/private/ = internal) is broken.
- **Evidence**: `export * from "./use-typing-sound";
export * from "./use-visitor";`
- **Suggested fix**: If intended public, add `export * from "./use-transition-swap";` to src/hooks/index.ts; otherwise move the file to src/hooks/private/ to match the existing convention.

### L-03 [LOW] [bug] Loader hard-throws when document.currentScript is unavailable (module scripts, Cloudflare Rocket Loader, inlined copies) with no fallback
- **File**: packages/browser/src/embed/loader-runtime.ts:89  |  **Dimension**: browser-embed
- **Description**: resolveBrowserEmbedAssetUrlsFromDocument returns null when currentScript is missing or has no src — which happens when the tag is `type="module"`, when optimizers like Cloudflare Rocket Loader re-execute scripts (currentScript is null), or when the snippet is inlined. The loader then throws an uncaught Error and the embed is dead, with no way for the integrator to supply the asset origin (no data attribute, no default CDN base).
- **Evidence**: `throw new Error(
			"Unable to resolve browser embed assets because document.currentScript is unavailable"
		);`
- **Suggested fix**: Fall back to `document.querySelector('script[src*="/loader.js"]')?.src`, then to a hardcoded `https://cdn.cossistant.com/widget/latest/` default (and/or support a `data-cossistant-base` attribute), instead of throwing.

### L-04 [LOW] [dx] Stub on() returns undefined while runtime on() returns an unsubscribe function
- **File**: packages/browser/src/embed/loader-runtime.ts:69  |  **Dimension**: browser-embed
- **Description**: All stub methods queue and return void. The real runtime's on() returns an unsubscribe function, so `const off = window.Cossistant.on('open', h)` yields a working function after load but `undefined` before load — calling `off()` later throws TypeError depending purely on script timing. The API surface silently differs between the stub and runtime phases.
- **Evidence**: `stub[method] = (...args: unknown[]) => {
			queue.push({
				args,
				method,
			});
		};`
- **Suggested fix**: Make the stub's `on` return a stable unsubscribe closure that either removes the entry from __queue or queues a matching `off` call: `stub.on = (...args) => { queue.push({method:'on',args}); return () => queue.push({method:'off',args}); }`.

### L-05 [LOW] [security] Injected widget.js carries no SRI integrity and the docs give no CSP guidance
- **File**: packages/browser/src/embed/loader-runtime.ts:127  |  **Dimension**: browser-embed
- **Description**: The loader injects widget.js with crossOrigin=anonymous but no `integrity` attribute, even though the README states versioned assets are immutable (SRI is feasible for /widget/<version>/ URLs; only `latest/` cannot pin). There is also no README note that pages with a script-src CSP must allowlist cdn.cossistant.com (and that nonce-based CSPs without 'strict-dynamic' will block the dynamically injected widget.js). Positive note: the public key is passed via init() and asset URLs derive solely from the loader's own src, so there is no data-attribute script-injection surface.
- **Evidence**: `script.crossOrigin = "anonymous";
script.src = assets.widgetUrl;
document.head.appendChild(script);`
- **Suggested fix**: Emit widget.js SRI hashes at build time and bake the hash into each versioned loader.js so it can set `script.integrity` (skip for latest/); add a README section covering CSP requirements ('strict-dynamic' or allowlisting the CDN origin).

### L-06 [LOW] [footprint] 24KB of base64 audio ships in the JS bundle for all Support/widget users
- **File**: packages/react/src/sounds/sound-data.ts:4  |  **Dimension**: build-packaging
- **Description**: sound-data.ts inlines two AAC files as base64 data URLs (24KB, the single largest file in react dist at 24,035 bytes, and present in widget.js). It is properly isolated in its own side-effect-free module, so purely headless consumers who never call useSoundEffect/useNewMessageSound/useTypingSound tree-shake it away — but every <Support /> app and the CDN widget carries 24KB (base64 gzips poorly) of audio in the critical JS payload before any message ever plays.
- **Evidence**: `export const NEW_MESSAGE_SOUND_DATA_URL =
	"data:audio/mp4;base64,AAAAHGZ0eXBNNEEg...`
- **Suggested fix**: Load the sounds lazily: convert sound-data.ts to a dynamic `await import("./sound-data")` inside use-sound-effect on first play (keeps the data out of the initial chunk with zero API change), or fetch the audio from the CDN in the browser embed.

### L-07 [LOW] [docs] Next README quickstart link points to invalid domain 'https://cossistant/docs/quickstart'
- **File**: packages/next/README.md:5  |  **Dimension**: docs-accuracy
- **Description**: The only documentation link in the published @cossistant/next npm README is malformed (missing the .com TLD), so the one navigation aid in an otherwise content-free README (no usage snippet, no styles.css/support.css mention, no exports overview) is a dead link.
- **Evidence**: `Follow the [Quickstart guide](https://cossistant/docs/quickstart) in our official documentation.`
- **Suggested fix**: Change the URL to https://cossistant.com/docs/quickstart, and ideally add the minimal SupportProvider + Support + CSS-import snippet from apps/web/content/docs/quickstart/index.mdx so the npm page is self-sufficient.

### L-08 [LOW] [dx] <Feedback> silently drops children that aren't Trigger/Content
- **File**: packages/react/src/feedback/index.tsx:76  |  **Dimension**: feedback
- **Description**: parseChildren returns only the first matched trigger/content and discards everything in parseCompoundChildren's `other` bucket. Any other child — including a wrapper component that renders Feedback.Trigger internally (type/displayName won't match through the wrapper) — vanishes without warning, and the default trigger renders instead, which reads as the custom trigger 'not working'. Extra Trigger/Content instances beyond the first are also dropped silently.
- **Evidence**: `return {
	trigger: matched.trigger[0] ?? null,
	content: matched.content[0] ?? null,
};`
- **Suggested fix**: In dev (`process.env.NODE_ENV !== "production"`), console.warn when parseCompoundChildren's `other` array is non-empty or when a slot matched more than once, explaining that <Feedback> only accepts direct Feedback.Trigger/Feedback.Content children and suggesting Feedback.Root for full composition.

### L-09 [LOW] [build] Feedback tests import happy-dom by reaching into apps/web/node_modules
- **File**: packages/react/src/hooks/use-submit-feedback.test.tsx:4  |  **Dimension**: feedback
- **Description**: use-submit-feedback.test.tsx and use-feedback-form.test.tsx (plus 7 other test files in the package) import happy-dom via the relative path '../../../../apps/web/node_modules/happy-dom'. happy-dom is not declared in packages/react/package.json or the workspace root, so the react package's test suite breaks the moment apps/web drops or hoists that dependency, or when the SDK packages are checked out/filtered without the web app.
- **Evidence**: `import { Window } from "../../../../apps/web/node_modules/happy-dom";`
- **Suggested fix**: Add happy-dom as a devDependency of packages/react and change all nine test files to `import { Window } from "happy-dom";`.

### L-10 [LOW] [dx] useConversation.refetch accepts args that are silently ignored
- **File**: packages/react/src/hooks/use-conversation.ts:60  |  **Dimension**: hooks
- **Description**: The public API types `refetch` as `(args?: GetConversationRequest) => ...` and the wrapper forwards `{ conversationId, ...args }` to queryRefetch, but the queryFn signature is `(instance) => ...` — it ignores the args parameter entirely and always uses the closured `request` built from the hook's conversationId. Calling `refetch({ conversationId: otherId })` silently fetches the original conversation, which is misleading for SDK consumers.
- **Evidence**: `queryFn: (instance) => {
  if (!request) {
    throw new Error("Conversation ID is required");
  }
  return instance.getConversation(request);
},`
- **Suggested fix**: Either honor the args (`queryFn: (instance, args) => instance.getConversation(args ?? request)`) or narrow the public refetch signature to `() => Promise<...>` so callers can't pass parameters that have no effect.

### L-11 [LOW] [dx] Root barrel diverges from react: next exports ./utils from the package root, react does not
- **File**: packages/next/src/index.ts:11  |  **Dimension**: next-parity
- **Description**: packages/react/src/index.ts exports feedback, hooks, identify-visitor, Primitives, provider, realtime, support, and support-config — but not utils. packages/next/src/index.ts re-exports the same set plus `export * from "./utils"`, so names like mergeRefs, useRenderElement, PENDING_CONVERSATION_ID, and generateShortPrimaryId are importable from the @cossistant/next root but not from the @cossistant/react root. Code written against next's root API silently fails to port to react (and vice versa docs/examples can't be shared 1:1). Verified there are no star-export name collisions introduced, so the fix is a one-line change on either side.
- **Evidence**: `export * from "./utils";  // absent from packages/react/src/index.ts`
- **Suggested fix**: Pick one surface: either remove `export * from "./utils";` from packages/next/src/index.ts, or add the same line to packages/react/src/index.ts so both root barrels are identical.

### L-12 [LOW] [docs] README shipped to npm has a broken quickstart URL (https://cossistant/docs/quickstart) and no usage example
- **File**: packages/next/README.md:5  |  **Dimension**: next-parity
- **Description**: The only documentation link in the README that prepare-package.ts copies into the published dist is `https://cossistant/docs/quickstart` — 'cossistant' is not a valid hostname (missing .com), so the primary onboarding link on the npm package page 404s at the DNS level. react's README uses the correct `https://cossistant.com/docs/...` form. The next README is also 24 lines with zero code examples (react's is ~275 lines with full quickstart), so the broken link is the only pointer a new @cossistant/next user gets.
- **Evidence**: `Follow the [Quickstart guide](https://cossistant/docs/quickstart) in our official documentation.`
- **Suggested fix**: Change the URL to https://cossistant.com/docs/quickstart and add a minimal App Router quickstart snippet (SupportProvider in app/layout.tsx + `import "@cossistant/next/styles.css"`) mirroring apps/web/content/docs/quickstart/index.mdx.

### L-13 [LOW] [build] Build deletes .map files but leaves dangling //# sourceMappingURL comments in published JS and d.ts
- **File**: packages/next/package.json:89  |  **Dimension**: next-parity
- **Description**: The build script runs `find dist -name '*.map' -delete`, but the emitted files keep their trailing sourcemap pointers: dist/index.js and dist/primitives/index.js end with `//# sourceMappingURL=index.js.map`, and dist/index.d.ts / dist/primitives/index.d.ts end with `//# sourceMappingURL=index.d.ts.map` (verified in both the committed dist and a fresh tsdown build, which emits maps despite `sourcemap: false` in tsdown.config.ts). Published consumers get devtools 404 noise for the .js.map references and silently broken go-to-definition for the .d.ts.map references.
- **Evidence**: `"build": "tsdown && rm -rf dist/node_modules dist/packages && find dist -name '*.map' -delete && ..."  // dist/index.js ends with //# sourceMappingURL=index.js.map`
- **Suggested fix**: After deleting the maps, also strip the comments, e.g. append `&& find dist \( -name '*.js' -o -name '*.d.ts' \) -exec sed -i '' -e '/^\/\/# sourceMappingURL=/d' {} +` — or fix the root cause by ensuring tsdown emits no maps at all so both the delete and the comments disappear.

### L-14 [LOW] [dx] peerDependenciesMeta marks @types/react optional but @types/react is not declared as a peer dependency
- **File**: packages/next/package.json:72  |  **Dimension**: next-parity
- **Description**: packages/next/package.json has `"peerDependenciesMeta": { "@types/react": { "optional": true } }` while its peerDependencies block lists only react, react-dom, and next. The meta entry is dead configuration (npm/pnpm ignore meta for undeclared peers). packages/react/package.json declares `"@types/react": ""` in peerDependencies alongside the same meta entry, so the two packages are inconsistent and TypeScript users installing only @cossistant/next get no optional-peer signal that react users get. prepare-package.ts copies this shape verbatim into the published dist/package.json (verified).
- **Evidence**: `"peerDependenciesMeta": {
    "@types/react": {
      "optional": true
    }
  }  // peerDependencies has no @types/react entry`
- **Suggested fix**: Add `"@types/react": "*"` to peerDependencies in packages/next/package.json (matching react's optional-peer pattern), or delete the orphaned peerDependenciesMeta block.

### L-15 [LOW] [a11y] TimelineItem aria-label yields nonsense like 'Event from Event' and 'Tool call from Tool call'
- **File**: packages/react/src/primitives/timeline-item.tsx:101  |  **Dimension**: primitives-a11y
- **Description**: The label template combines the item type with itemTypeLabel, but itemTypeLabel returns the type name itself for non-message items: events announce 'Event from Event', tools 'Tool call from Tool call', identification items 'Event from Identification'. Only message items get a meaningful sender ('Message from visitor').
- **Evidence**: `"aria-label": `${item.type === "message" ? "Message" : item.type === "tool" ? "Tool call" : "Event"} from ${itemTypeLabel}`,`
- **Suggested fix**: Only append the sender for messages/tools using the resolved sender label (e.g. `Message from AI assistant`, `Tool call by AI assistant`, plain `Event` otherwise).

### L-16 [LOW] [bug] Slot re-creates the merged ref every render, causing child callback-ref churn
- **File**: packages/react/src/utils/use-render-element.tsx:72  |  **Dimension**: primitives-a11y
- **Description**: Slot calls mergeRefs() inline on each render, producing a new callback ref identity every time. React then detaches (calls with null) and re-attaches every ref — including the consumer's ref on the asChild child — on every parent re-render. For a timeline that re-renders on each incoming message/scroll state change, consumer callback refs fire null/node repeatedly, breaking refs that do setup/teardown work. The codebase already ships useMergeRefs (merge-refs.ts:61) but Slot doesn't use it.
- **Evidence**: `const mergedRef = mergeRefs([forwardedRef, childRef]);`
- **Suggested fix**: Use the existing memoized hook: `const mergedRef = useMergeRefs([forwardedRef, childRef]);` inside Slot.

### L-17 [LOW] [dx] WebSocketProvider silently ignores autoConnect/publicKey/wsUrl/callback props that provider.tsx carefully computes
- **File**: packages/react/src/support/context/websocket.tsx:60  |  **Dimension**: provider-lifecycle
- **Description**: WebSocketProviderProps declares `autoConnect`, `publicKey`, `wsUrl`, `onConnect`, `onDisconnect`, `onError`, but the component destructures the callbacks/wsUrl into unused `_`-prefixed bindings and never destructures `autoConnect`/`publicKey` at all — the connection is entirely managed by the controller's `syncRealtimeConnection`. Meanwhile provider.tsx:314-317 computes `autoConnect={autoConnect && !snapshot.isVisitorBlocked && !snapshot.configurationError}` and forwards all of these, which is dead code that misleads maintainers into thinking connection gating lives here.
- **Evidence**: `wsUrl: _wsUrl,
	onConnect: _onConnect,
	onDisconnect: _onDisconnect,
	onError: _onError,`
- **Suggested fix**: Trim WebSocketProviderProps to what is actually used (`children`, `websiteId`, `visitorId`), delete the dead prop forwarding in provider.tsx, and drop the unused `autoConnect` computation.

### L-18 [LOW] [bug] connect() with auth that normalizes to null leaves the client reporting 'connected' with no socket
- **File**: packages/core/src/realtime-client.ts:577  |  **Dimension**: realtime
- **Description**: If connect() is called while connected with auth whose credentials trim to empty (e.g. {kind:'visitor', visitorId: ''}), normalizeAuth returns null, authChanged is true, closeSocket() closes the socket without touching state, then openSocket() early-returns because buildSocketUrl(null) is null — never calling setState. The state stays {status:'connected', connectionId} forever, so isConnected in RealtimeProvider/useRealtime reports a live connection that does not exist.
- **Evidence**: `const url = buildSocketUrl(this.wsUrl, this.auth);
		if (!url) {
			return;
		}`
- **Suggested fix**: In openSocket(), when url is null set state to { status: "disconnected", error: null, connectionId: null } before returning (or have connect() call disconnect() when normalizeAuth returns null).

### L-19 [LOW] [bug] Realtime store hooks recreate the subscribe function every render, forcing useSyncExternalStore to resubscribe
- **File**: packages/react/src/realtime/seen-store.ts:27  |  **Dimension**: realtime
- **Description**: In seen-store.ts, typing-store.ts (line 28) and processing-store.ts (line 24), `subscribe` is an inline arrow created on every render. React re-subscribes to the store whenever the subscribe reference changes, so every re-render of every consumer unsubscribes and resubscribes to the singleton store. The codebase already has a correct implementation (src/hooks/private/store/use-store-selector.ts wraps subscribe in useCallback), so this is an avoidable inconsistency in the hot typing/seen paths.
- **Evidence**: `const subscribe = (onStoreChange: () => void) =>
		seenStoreSingleton.subscribe(() => {
			onStoreChange();
		});`
- **Suggested fix**: Hoist subscribe to module scope (the store is a module singleton): `const subscribe = (cb: () => void) => seenStoreSingleton.subscribe(cb);` in all three files, or reuse useStoreSelector.

### L-20 [LOW] [bug] disconnect() never stops the presence timer because closeSocket() nulls onclose before closing
- **File**: packages/core/src/realtime-client.ts:482  |  **Dimension**: realtime
- **Description**: stopPresenceTimer() is only called from destroy() and from the socket onclose handler, but closeSocket() detaches onclose before calling close(), so a plain disconnect() (auth removed, autoConnect off) leaves the presence setInterval firing indefinitely (the pings no-op since the socket is null, but the interval leaks until destroy()). Note also that enablePresence/pausePresence/resumePresence have no callers in any package — the whole presence API is dead weight in the shipped bundle.
- **Evidence**: `disconnect(): void {
		this.clearReconnectTimer();
		this.closeSocket();
		this.auth = null;`
- **Suggested fix**: Add this.stopPresenceTimer() to disconnect() (and consider deleting the unused presence API or wiring it to visibilitychange in the widget).

### L-21 [LOW] [bug] decodeMessageData decodes the entire underlying buffer for ArrayBufferView frames
- **File**: packages/core/src/realtime-client.ts:163  |  **Dimension**: realtime
- **Description**: For an ArrayBufferView, decode(data.buffer) ignores byteOffset/byteLength, so a view over a subrange (common when a runtime pools receive buffers) decodes surrounding garbage and the JSON parse fails, silently dropping the event. TextDecoder accepts views directly. Additionally, Blob frames (the browser default binaryType for binary messages) fall through to 'unsupported' and are dropped without a log.
- **Evidence**: `return { type: "raw-text", data: new TextDecoder().decode(data.buffer) };`
- **Suggested fix**: Use `new TextDecoder().decode(data)` for the ArrayBuffer.isView branch (TextDecoder handles views, respecting offset/length).

### L-22 [LOW] [dx] Realtime provider tests assert against copied helpers and source strings, leaving the actual provider untested
- **File**: packages/react/src/realtime/provider.test.ts:4  |  **Dimension**: realtime
- **Description**: provider.test.ts states its functions are 'copied here for unit testing purposes' — it tests local duplicates of decodeMessageData/parseJson/extractStringField that no longer even live in provider.tsx (they moved to core/realtime-client.ts), so they can never catch a regression. provider.remount-regression.test.ts likewise only greps the source file for strings ('not.toContain("const webSocketKey")'). Net effect: RealtimeProvider has zero behavioral coverage, which is exactly why the StrictMode destroy bug and the no-op callback effect ship green with 236 passing tests.
- **Evidence**: `* Helper functions extracted from provider.tsx for testing.
 * These are re-exported or copied here for unit testing purposes.`
- **Suggested fix**: Delete the copied-helper tests (core/realtime-client.test.ts already covers the real implementations) and replace the source-grep tests with a rendered test of RealtimeProvider using a mock WebSocket, including a StrictMode double-mount case.

### L-23 [LOW] [ssr] formatTimeAgo returns "" on server but a relative string during client hydration render
- **File**: packages/react/src/support/utils/time.ts:7  |  **Dimension**: ssr-safety
- **Description**: The typeof window guard prevents an SSR crash but creates a guaranteed text mismatch: useConversationPreview (src/hooks/use-conversation-preview.ts:200) calls formatTimeAgo inside useMemo during render, so SSR HTML contains "" while the hydration render produces "5m ago". Any SSR'd conversation list (widget open, or a consumer using the public useConversationPreview hook in their own SSR'd UI) logs a hydration error.
- **Evidence**: `if (typeof window === "undefined") {
	return "";
}`
- **Suggested fix**: Drive relative-time labels through the isHydrated pattern already used by SupportTextProvider: return "" (or the absolute date) until after mount on the client too, e.g. accept an isHydrated/now argument so the first client render matches the server.

### L-24 [LOW] [ssr] Raw useLayoutEffect in SSR-reachable primitives triggers React 18 server warning
- **File**: packages/react/src/primitives/multimodal-input.tsx:72  |  **Dimension**: ssr-safety
- **Description**: primitives/multimodal-input.tsx:72 and primitives/avatar/image.tsx:52 call React.useLayoutEffect directly. The package supports react >=18 <20; under React 18 renderToString/Next.js SSR, any server render of these components (widget SSR'd open via defaultOpen/persisted-open, or avatars in consumer-composed SSR UI) logs "useLayoutEffect does nothing on the server" for every instance, polluting consumers' server logs.
- **Evidence**: `React.useLayoutEffect(() => {
	const el = innerRef.current;`
- **Suggested fix**: Add a shared useIsomorphicLayoutEffect (typeof window === "undefined" ? useEffect : useLayoutEffect) in src/utils and use it in both files.

### L-25 [LOW] [footprint] Unused ulid dependency and dead nanoid-only helper shipped with @cossistant/react
- **File**: packages/react/package.json:94  |  **Dimension**: state-consistency
- **Description**: `ulid` is declared as a dependency of @cossistant/react but never imported anywhere in packages/react/src (ULIDs come from @cossistant/core, which declares its own). `nanoid` is imported solely by generateShortPrimaryId in src/utils/id.ts:13, which has zero internal callers (only PENDING_CONVERSATION_ID from that file is used) — and it recreates the customAlphabet generator on every call. Both inflate install size and the dependency surface of the SDK for nothing.
- **Evidence**: `"nanoid": "^5.1.5",
...
"ulid": "^3.0.1"`
- **Suggested fix**: Remove "ulid" from packages/react/package.json dependencies. Delete generateShortPrimaryId (or re-export core's generateMessageId if a public ID helper is desired) and drop the "nanoid" dependency; keep PENDING_CONVERSATION_ID in utils/id.ts.

### L-26 [LOW] [bug] computeMetadataHash FNV fallback can never match the server hash, causing redundant metadata writes
- **File**: packages/react/src/utils/metadata-hash.ts:41  |  **Dimension**: state-consistency
- **Description**: IdentifySupportVisitor compares the client-computed hash against contact.metadataHash, which the server computes with SHA-256 (apps/api/src/utils/metadata-hash.ts:29). When crypto.subtle is unavailable — any widget embedded on a non-HTTPS page, since subtle only exists in secure contexts — the client falls back to FNV-1a, whose output never equals the server's SHA-256 prefix. hashChanged is then always true, so setVisitorMetadata fires on every page load for every identified visitor with metadata (once per session via lastMetadataHash), producing a steady stream of no-op contact writes.
- **Evidence**: `// FNV-1a fallback for runtimes without Web Crypto.
let hash = 0x81_1c_9d_c5;`
- **Suggested fix**: When crypto.subtle is unavailable, skip hash-based change detection instead of producing an incompatible hash: return null from computeMetadataHash and have identify-visitor.tsx treat null as "unknown — only send once per session and cache the sent payload (e.g. JSON string in a ref/localStorage) for equality checks".

### L-27 [LOW] [dx] Window primitive advertises provider-free isOpen prop but throws without a SupportProvider
- **File**: packages/react/src/primitives/window.tsx:92  |  **Dimension**: support-ui
- **Description**: SupportWindow accepts `isOpen`/`onOpenChange` props (mirroring Trigger's documented "provider-free usage" pattern), but unconditionally calls the throwing useSupportConfig() — unlike Trigger, which uses useOptionalSupportConfig. Any headless consumer rendering <Window isOpen={...} onOpenChange={...}> outside SupportProvider crashes with "useSupportConfig must be used within a cossistant SupportProvider" even though all runtime state was supplied via props.
- **Evidence**: `const { isOpen, close } = useSupportConfig();
const containerRef = React.useRef<HTMLDivElement>(null);`
- **Suggested fix**: Use useOptionalSupportConfig() and fall back to the isOpenProp/onOpenChange props: `const config = useOptionalSupportConfig(); const open = isOpenProp ?? config?.isOpen ?? false;` with closeFn preferring onOpenChange, then config?.close.

### L-28 [LOW] [footprint] Built-in ARTICLES route ships hardcoded placeholder FAQ content
- **File**: packages/react/src/support/pages/articles.tsx:9  |  **Dimension**: support-ui
- **Description**: ArticlesPage is registered in the router's builtInPages (router.tsx:40) but its body is dummy English Q&A ("Our team typically responds within a few minutes during business hours") with no data source, no slot override (unlike every other page), and no i18n. It is reachable via the public SupportHandle.navigate({ page: "ARTICLES" }) and via NavigationTab, so integrators can accidentally expose fake support promises to customers, and the dead content ships in every bundle.
- **Evidence**: `<p className="text-co-primary/60 text-sm leading-relaxed">
	Our team typically responds within a few minutes during business
	hours.
</p>`
- **Suggested fix**: Either remove ARTICLES from builtInPages until the knowledge-base feature exists, or replace the placeholder body with a localized empty-state driven by real data and add an articlesPage slot override like the other pages.

### L-29 [LOW] [dx] <Support> silently discards unrecognized children, including Support.Header/Support.Footer
- **File**: packages/react/src/support/index.tsx:512  |  **Dimension**: support-ui
- **Description**: parseChildren buckets children into trigger/content/pages/other, but SupportComponentInner renders only triggerElement and contentElement — `parsed.other` is never rendered. Since Support.Header and Support.Footer are exported on the compound (Support.Header, Support.Footer), the natural composition `<Support><Support.Header>...</Support.Header></Support>` is silently a no-op (the slot registration components are classified as "other" and dropped; they only work when nested inside Support.Content). Any other custom child is also silently discarded with no warning, which is surprising for a headless library.
- **Evidence**: `const parsed = parseChildren(children);
...
<Root className={className}>
	{triggerElement}
	{contentElement}
</Root>`
- **Suggested fix**: Render parsed.other inside the default <Content> (or forward them into contentElement's children) so slot components and custom nodes work as direct children of <Support>; alternatively emit a dev-mode console.warn when children are dropped.
