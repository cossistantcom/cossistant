# `@plasma/memory`

Opinionated memory utility for Cossistant AI agents.

## Status

This package is now a working v1 core, not just a scaffold.

What ships today:

- `new Memory({ db, models?, now? })`
- `memory.remember(input)`
- `memory.context(input)`
- `memory.forget(input)`
- `createMemoryTool(options)` returning `{ remember, recallMemory }`
- typed validation errors
- metadata filter compilation
- priority + freshness ranking
- optional embedding-powered semantic boost
- stored summary lookup through `context({ includeSummary: true })`

What is intentionally deferred:

- `memory.summarize()` as a runtime method
- generated summaries on read
- a delete tool for agents
- package-owned migrations
- DB-backed integration tests in this first pass

## Quick Start

```ts
import { createMemoryTool, Memory } from "@plasma/memory";
import { db } from "@plasma/db";
import { openrouter } from "@openrouter/ai-sdk-provider";

const memory = new Memory({
	db,
	models: {
		embed: openrouter.textEmbeddingModel("openai/text-embedding-3-small"),
	},
	now: () => new Date(),
});

await memory.remember({
	content: "User already shared Stripe webhook logs",
	priority: 2,
	metadata: {
		appId: "app_123",
		userId: "user_789",
		conversationId: "conv_456",
		kind: "note",
		topic: "billing",
	},
});

const context = await memory.context({
	where: {
		and: [{ appId: "app_123" }, { userId: "user_789" }],
	},
	text: "User is asking again about webhook failures",
	limit: 6,
	includeSummary: true,
});

await memory.forget({
	where: {
		and: [{ userId: "user_789" }, { topic: "billing" }],
	},
});

const { remember, recallMemory } = createMemoryTool({
	memory,
	remember: {
		metadata: {
			appId: "app_123",
			userId: "user_789",
			conversationId: "conv_456",
		},
	},
	recall: {
		where: {
			and: [{ appId: "app_123" }, { userId: "user_789" }],
		},
		defaults: {
			limit: 6,
			includeSummary: true,
		},
	},
});
```

## AI SDK Tools

The package now exports two generic structured AI SDK tools:

```ts
const { remember, recallMemory } = createMemoryTool({
	memory,
	remember: {
		metadata: {
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgentId: "agent_1",
			visitorId: "visitor_1",
		},
	},
	recall: {
		where: {
			organizationId: "org_1",
			websiteId: "site_1",
			aiAgentId: "agent_1",
			visitorId: "visitor_1",
		},
		defaults: {
			limit: 6,
			includeSummary: true,
		},
	},
});
```

Guardrails:

- `remember` accepts only `content` and optional `priority`
- `recallMemory` accepts only `text`, `limit`, and `includeSummary`
- the model never controls raw `metadata` or raw `where`
- no delete tool is exposed yet

Cossistant-specific wrappers such as `rememberVisitor` and
`recallVisitorMemory` should live outside the package and preconfigure these
generic tools with product-safe scope.

## Runtime Contract

- PostgreSQL + pgvector + Drizzle only
- fixed external table contract: `memory_records`
- host app owns the schema and migrations
- package treats `id` as an opaque string
- Cossistant defaults to ULID-shaped ids, but UUID-backed tables are compatible
- agent-facing tool scope is prebound at tool creation time

Important:

`remember()` relies on a database-level default for `memory_records.id`.
Drizzle-only `$defaultFn()` helpers on the host schema are not enough by
themselves, because this package inserts through its own runtime table contract.

## Retrieval Model

`context()` always works in this order:

1. validate input
2. narrow candidates with metadata filters
3. optionally embed the input `text`
4. fetch structural candidates
5. optionally fetch semantic candidates
6. merge, score, dedupe, and sort
7. optionally surface an already-stored summary row

The current scoring behavior is deliberately simple and documented in
[docs/performance.md](./docs/performance.md) and
[docs/architecture.md](./docs/architecture.md).

## Docs

- [PLAN.md](./PLAN.md)
- [Schema Contract](./docs/schema-contract.md)
- [API Roadmap](./docs/api-roadmap.md)
- [Architecture](./docs/architecture.md)
- [Data Flow](./docs/data-flow.md)
- [Performance](./docs/performance.md)
- [Testing](./docs/testing.md)

## Current Constraints

- `priority` is currently treated as a positive integer.
- metadata must stay flat: `string | number | boolean | null`
- `includeSummary` only returns stored summary records; it does not generate new ones
- `models.summarize` is accepted for forward compatibility but is not used yet
- `createMemoryTool(...)` requires non-empty bound metadata and non-empty bound recall scope
