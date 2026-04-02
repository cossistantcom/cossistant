import type {
	DrizzlePostgresDatabase,
	MemoryEmbeddingModel,
	MemorySummarizeModel,
} from "@plasma/memory";
import { createMemoryTool, Memory } from "@plasma/memory";
import type { LanguageModel } from "ai";
import { ToolLoopAgent } from "ai";
import { sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	varchar,
	vector,
} from "drizzle-orm/pg-core";

export type ExampleMemoryMetadata = Record<
	string,
	string | number | boolean | null
>;

/**
 * External table contract used by `@plasma/memory`.
 *
 * Important:
 * - the package does not own this table or its migration
 * - the database itself must provide the id default
 * - a Drizzle-only `$defaultFn()` is not enough for `remember()`
 *
 * This example uses ULID as the default Cossistant shape.
 * If you prefer UUID, keep the same column names and use a DB-level UUID
 * default instead.
 */
export const memoryRecords = pgTable(
	"memory_records",
	{
		id: varchar("id", { length: 26 })
			.primaryKey()
			.notNull()
			.default(sql`generate_ulid()`),
		content: text("content").notNull(),
		metadata: jsonb("metadata")
			.$type<ExampleMemoryMetadata>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		priority: integer("priority").notNull().default(1),
		embedding: vector("embedding", { dimensions: 1536 }),
		source: varchar("source", { length: 32 }),
		createdAt: timestamp("created_at", {
			withTimezone: true,
			mode: "date",
		})
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", {
			withTimezone: true,
			mode: "date",
		})
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("memory_records_created_at_idx").on(table.createdAt),
		index("memory_records_priority_idx").on(table.priority),
		index("memory_records_metadata_idx").using(
			"gin",
			table.metadata.op("jsonb_ops")
		),
		index("memory_records_embedding_idx").using(
			"hnsw",
			table.embedding.op("vector_cosine_ops")
		),
	]
);

declare const db: DrizzlePostgresDatabase;
declare const embedModel: MemoryEmbeddingModel;
declare const summarizeModel: MemorySummarizeModel;

export const memory = new Memory({
	db,
	models: {
		embed: embedModel,
		summarize: summarizeModel,
	},
});

export const memoryTools = createMemoryTool({
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

declare const agentModel: LanguageModel;

export const agent = new ToolLoopAgent({
	model: agentModel,
	tools: {
		remember: memoryTools.remember,
		recallMemory: memoryTools.recallMemory,
	},
});
