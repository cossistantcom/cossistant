# Memory Package Plan

## Phase 0: Scaffold And Contract

- [x] Create `packages/memory` as a new internal workspace package.
- [x] Export a class-only runtime API through `new Memory({ ... })`.
- [x] Add future-facing input, output, and filter types in `src/types.ts`.
- [x] Accept the host app's existing Drizzle PostgreSQL database instance directly.
- [x] Accept optional AI SDK model instances through `models.embed` and `models.summarize`.
- [x] Add constructor coverage for supported and unsupported configuration.

## Phase 1: External Schema Contract

- [x] Define the fixed `memory_records` table contract in `examples/drizzle-example.ts`.
- [x] Keep schema ownership and migrations outside the package.
- [x] Document the required columns, indexes, and DB-level id default expectation.
- [x] Treat ids as opaque strings and document ULID default plus UUID compatibility.

## Phase 2: Runtime Core

- [x] Implement `remember()` with validation, defaults, timestamps, and optional embedding generation.
- [x] Implement `context()` with metadata filtering, ranking, and prompt-ready output.
- [x] Implement `forget()` for delete-by-id and delete-by-filter.
- [x] Add deterministic validation and typed error classes.
- [x] Wire embedding generation through AI SDK model instances passed to the constructor.
- [x] Export `createMemoryTool(...)` with two prebound AI SDK tools: `remember` and `recallMemory`.

## Phase 3: Retrieval Quality

- [x] Add metadata filter compilation for `and` / `or` / equality.
- [x] Add explainable freshness and priority scoring.
- [x] Add semantic retrieval with pgvector cosine similarity when embeddings are available.
- [x] Add conservative dedupe and candidate merging.
- [x] Apply limit after ranking, not before scoring.

## Phase 4: Summaries And Long-Thread Support

- [x] Support stored summary rows alongside raw notes through `context({ includeSummary: true })`.
- [ ] Implement `summarize()` as a runtime helper for conversation compression.
- [ ] Generate and store summaries with the configured summarize model.
- [ ] Add summary lifecycle rules for long-running threads.

## Phase 5: Hardening

- [x] Add unit coverage for public API methods, validation, filter compilation, and ranking behavior.
- [x] Add unit coverage for the generic AI SDK tool factory and the Cossistant scope wrappers.
- [ ] Add a DB-backed integration suite.
- [ ] When the DB-backed suite is added, give it a dedicated Docker Compose setup for the memory package instead of coupling it to the repo-wide dev stack.
- [ ] Revisit dedupe, retention, and summary behavior after using the package in production flows.

## Phase 6: Scoped App Wrappers

- [x] Add Cossistant-side wrapper helpers for visitor, conversation, and website memory scope.
- [x] Keep those wrappers outside the package so `@plasma/memory` stays product-agnostic.
- [x] Keep wrappers out of the current tool catalog and capability UI for now.
