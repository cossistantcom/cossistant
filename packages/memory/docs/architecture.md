# Architecture

## Purpose

`@plasma/memory` gives agents durable memory without becoming a framework.

The package is intentionally narrow:

- write durable notes with metadata and priority
- retrieve the most relevant memory for the current situation
- delete bad or stale memory
- expose prebound AI SDK tools for remembering and recalling
- stay generic by pushing product concepts into metadata

## Opinionated Stack

- PostgreSQL
- pgvector
- Drizzle
- fixed external table: `memory_records`

This package is not trying to be database-agnostic. The simplicity is part of
the product.

## Layering

The runtime is split into a few small layers:

- `src/memory.ts`
  Public class entrypoint. Stores validated dependencies and delegates.
- `src/validation.ts`
  Normalizes and rejects malformed public inputs.
- `src/filters.ts`
  Compiles `MemoryWhere` into deterministic JSONB SQL conditions.
- `src/repositories/memory-repository.ts`
  Executes the narrow set of storage operations the package needs.
- `src/scoring.ts`
  Scores, merges, and deduplicates candidates.
- `src/services/*`
  Implements `remember`, `context`, and `forget` in terms of the repository.
- `src/memory-tool.ts`
  Exposes two structured AI SDK tools with fixed write and recall guardrails.

## Why The Package Uses Its Own Runtime Table Definition

The host app owns the actual Drizzle schema and SQL migration.

The package still needs a matching runtime table definition so it can issue
typed queries against the fixed `memory_records` contract.

One important consequence:

- the package does not use the host's Drizzle table object directly
- `remember()` therefore relies on a database-level default for `id`
- app-only `$defaultFn()` helpers are not enough on their own

That tradeoff keeps the package reusable inside the monorepo while still
letting the app own migrations.

## Data Model

Each memory row stores:

- `id`
- `content`
- `metadata`
- `priority`
- `embedding`
- `source`
- `createdAt`
- `updatedAt`

Metadata is intentionally flat. The package should not know about visitors,
tickets, repos, or conversations as hardcoded concepts.

## Tool Layer

The package-level agent interface is intentionally smaller than the class API.

Current tool surface:

- `remember`
- `recallMemory`

Current non-tool surface:

- `forget()` still exists on the class API
- no delete tool is exposed to the model

The package tool layer is generic. Product-specific scoping such as visitor,
conversation, or website memory belongs in app-side wrapper helpers, not in the
package itself.

## Retrieval Model

`context()` follows this retrieval model:

1. validate the public input
2. compile the metadata filter
3. optionally embed the query text
4. fetch structural candidates with metadata narrowing first
5. optionally fetch semantic candidates with pgvector similarity
6. merge candidates by id
7. score the merged set
8. dedupe near-identical rows conservatively
9. sort and apply the final limit
10. optionally fetch one stored summary row from the same scope

This makes metadata the main narrowing mechanism and semantic similarity an
optional ranking boost.

For the AI SDK tools, the model never controls raw metadata filters directly.
Instead, `createMemoryTool(...)` binds:

- one fixed metadata object for writes
- one fixed where scope for reads

## Current Scoring

Current behavior is intentionally easy to reason about.

With semantic similarity:

```txt
finalScore =
  semanticScore * 0.45 +
  priorityScore * 0.30 +
  freshnessScore * 0.25
```

Without semantic similarity:

```txt
finalScore =
  priorityScore * 0.55 +
  freshnessScore * 0.45
```

Supporting details:

- priority normalization: `1 - 1 / (1 + priority)`
- freshness normalization: `1 / (1 + ageHours / 720)`
- freshness half-life style window: 30 days

The goal is simple behavior:

- higher priority can beat newer low-priority notes
- freshness still lifts recent notes
- semantic similarity boosts ranking when available

## Summaries

Generated summaries are intentionally deferred.

Current behavior:

- summary rows can already live in `memory_records`
- `context({ includeSummary: true })` can surface a stored summary row
- the package does not generate or refresh summaries during reads

That keeps the read path cheap and predictable.

## Flexible Ids

The package treats ids as opaque strings everywhere.

- ULID is the Cossistant default
- UUID-backed tables are also supported
- code must never assume UUID-specific SQL helpers or UUID-only formats

The only contract is that the `id` round-trips to TypeScript as `string`.
