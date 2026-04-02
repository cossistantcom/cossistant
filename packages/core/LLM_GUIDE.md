# @plasma/core Contribution Playbook (for LLM agents)

This guide codifies the structure and rules you **must** follow when extending `@plasma/core`. Deviations require a human to sign off. Read everything before touching code.

## Directory Map & Responsibilities

```
packages/core/
├── package.json          # workspace metadata
└── src/
    ├── client.ts         # `createClient`, action plumbing, transport wiring
    ├── index.ts          # surface area exported to consumers
    ├── rest-client.ts    # HTTP fetch helpers that hydrate stores
    ├── store/
    │   ├── create-store.ts            # framework-agnostic store primitive
    │   ├── conversations-store.ts     # visitor conversation snapshots + pagination
    │   ├── conversations-store.test.ts  # reducer + selector coverage
    │   ├── messages-store.ts          # message reducer + ingestion helpers
    │   ├── messages-store.test.ts     # tests covering reducer + realtime ingestion
    │   ├── seen-store.ts              # conversation "seen" presence tracking
    │   ├── seen-store.test.ts         # seen reducer + realtime guards
    │   ├── typing-store.ts            # realtime typing indicators + TTL timers
    │   ├── typing-store.test.ts       # typing reducer, TTL + ignore filters
    │   ├── support-store.ts           # support widget navigation + persisted config
    │   └── support-store.test.ts      # persistence + navigation stack coverage
    │   ├── website-store.ts           # website bootstrap status + caching
    │   └── website-store.test.ts      # website reducer + client integration tests
    ├── types.ts          # internal types shared inside core only
    ├── utils.ts          # side-effect free helpers (sorting, parsing, etc.)
    ├── visitor-data.ts   # REST hydration helpers for visitor bootstrap
    └── visitor-tracker.ts# transport wiring for visitor state
```

**Rule:** keep new state logic under `src/store/` in its own file pair (`<domain>-store.ts` + `<domain>-store.test.ts`). Shared helpers belong in `utils.ts` only if they are used by multiple domains; otherwise keep them local to the store module.

## Store Design Requirements

- Every store exports `create<Domain>Store(initialState?)` returning the shared `Store<T>` from `create-store.ts` plus domain-specific mutators.
- Mutators must be **pure reducers**: they accept the current immutable snapshot and return the next snapshot. Never mutate `state` in-place.
- Batch multiple synchronous writes using `store.batch(() => { ... })` so React listeners receive a single notification per logical event burst.
- Guard against unnecessary renders by short-circuiting when reducers return the same references (`if (existing && existing.messages === merged) return state;`).
- Normalize all inbound timestamps to `Date` instances inside the store boundary. External callers never deal with raw strings.
- Presence stores (`seen-store`, `typing-store`) must expose helper functions (`applyConversationSeenEvent`, `applyConversationTypingEvent`, etc.) that accept a store instance. React bindings create a singleton store per widget and call these helpers so the logic stays framework-agnostic.
- Persistence-aware stores (e.g. `support-store`) must accept a `storage` adapter so tests can provide an in-memory shim while production passes `window.localStorage`.

## Naming & File Conventions

- File names: `kebab-case` (e.g., `conversations-store.ts`).
- Exposed types use `PascalCase` (`ConversationStoreState`). Internal helpers stay `camelCase`.
- Action creators exported from the store use imperative verbs (`ingestPage`, `applyRealtimePresence`).
- Unit tests mirror the file name and import from the same folder.

## Testing Obligations

For every new store or reducer path:

1. Add a `.test.ts` alongside the store verifying:
   - pagination/page merges do not duplicate entities,
   - realtime events update the correct slice,
   - unchanged inputs preserve reference equality.
2. Mock data **must** conform to types from `@plasma/types` and mimic API shape (see `messages-store.test.ts` for patterns).
3. Include edge cases: empty payloads, out-of-order events, finalization updates.
4. Run `bun test packages/core/src/store/<domain>-store.test.ts` locally and document it in your final summary.

## Adding a New Store – Checklist

1. Create `src/store/<domain>-store.ts` exporting `create<Domain>Store`, domain types, and getters. Mirror existing patterns from `conversations-store.ts`, `messages-store.ts`, or `website-store.ts` depending on the domain shape (collection vs singleton).
2. Write `src/store/<domain>-store.test.ts` covering happy path + edge cases (see Testing Obligations).
3. Extend `src/client.ts`:
   - add the store to the client state container,
   - wire REST hydration by calling the new store’s mutators when REST responses arrive,
   - connect realtime transports to call the same mutators.
4. Update `src/index.ts` to export the factory/types if the public surface needs them.
5. Document any required wiring in `LLM_GUIDE.md` so future agents know about the new domain.

## Good Practices to Keep Stores Healthy

- **Immutable snapshots:** always clone arrays/maps before mutation. Prefer helper functions that return new arrays (e.g., `mergeMessages`).
- **Reference stability:** after merging, reuse previous references when nothing changed to avoid extra renders downstream.
- **Windowing:** if a store can grow without bound, enforce max length inside the reducer (trim arrays, release cursors) before committing state.
- **Normalization:** convert inbound payloads into canonical internal shapes at the edge (inside the store) so the rest of core operates on trusted data.
- **Error handling:** stores should not throw. Validate inputs before calling mutators; return the previous state on unrecognized events.

## When Updating Tests or Tooling

- Prefer helper builders (e.g., `createMessage`) inside tests to keep fixtures readable.
- Keep assertions strict; verify both deep equality and referential stability (`expect(next).toBe(prev)` when appropriate).
- Use `vi.useFakeTimers()` or deterministic dates when reducers rely on timestamps.

## Extending Client Actions or Transports

When a new feature requires actions:

- Define the action in `client.actions` so UI bindings can call it directly.
- The action should call the REST transport, then immediately hydrate the store with the authoritative response.
- For optimistic flows, write to the store first, keep a rollback snapshot, and reconcile once the server responds.

### Conversation bootstrap + initial message workflow

- Use `CossistantClient.initiateConversation` to create a **local-only** conversation snapshot. It:
  - Generates a conversation ID (or accepts one),
  - Inserts optional default messages into `messagesStore`,
  - Records the pending conversation so `sendMessage` knows to call `createConversation` later.
- `sendMessage` checks the pending registry. If the target conversation is pending (and `createIfPending` isn’t forced off), it will:
  - Optimistically append the outgoing message,
  - Call `restClient.createConversation` with the default + user messages,
  - Replace the local snapshot with the server payload on success, or remove only the optimistic message on failure.
- Existing conversations still use the REST `sendMessage` endpoint and the optimistic finalize path covered by `messagesStore.finalizeMessage`.
- Never mutate server-backed conversations after `dehydrate()` on the server. Pending entries must be resolved on the client by calling `sendMessage` or `destroy()`.

Realtime transports must emit domain events that map 1:1 to store mutators. Keep translation logic in the transport layer; stores should never parse raw socket frames.

### Website bootstrap + caching workflow

- `CossistantClient.fetchWebsite` is the single entry point for fetching public website metadata. It:
  - Moves the `websiteStore` into the `"loading"` state exactly once per request,
  - Calls `restClient.getWebsite`,
  - Commits the returned payload into `websiteStore` on success and caches the promise to dedupe concurrent reads,
  - Captures failures as `{ message }` snapshots in `websiteStore` so React hooks can surface an `Error` instance.
- `CossistantClient.getWebsite` simply forces a refetch by delegating to `fetchWebsite({ force: true })`.
- React bindings must subscribe through `client.websiteStore` and call `fetchWebsite()` when the status is `"idle"`; see `use-website-store.ts` for the canonical pattern.

## Final Notes

- Do not create module-level singletons. Every widget instantiates its own client and stores via `createClient`.
- Keep the public API small; only export factories, types, and selectors that the React bindings require.
- Update this guide whenever you introduce a new pattern so subsequent agents inherit the correct rules.
