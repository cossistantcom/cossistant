import {
	type CreateMemoryToolOptions,
	createMemoryTool,
	type Memory,
	type MemoryMetadata,
} from "@plasma/memory";

type RecallDefaults = NonNullable<
	CreateMemoryToolOptions["recall"]["defaults"]
>;

type BaseScopedMemoryToolOptions = {
	memory: Memory;
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
	recallDefaults?: RecallDefaults;
};

type VisitorScopedMemoryToolOptions = BaseScopedMemoryToolOptions & {
	visitorId: string;
};

type ConversationScopedMemoryToolOptions = VisitorScopedMemoryToolOptions & {
	conversationId: string;
};

function buildWebsiteScopeMetadata(params: {
	organizationId: string;
	websiteId: string;
	aiAgentId: string;
}): MemoryMetadata {
	return {
		organizationId: params.organizationId,
		websiteId: params.websiteId,
		aiAgentId: params.aiAgentId,
	};
}

function createScopedMemoryDescriptions(scopeLabel: string): {
	remember: string;
	recall: string;
} {
	return {
		remember: `Store a durable memory scoped to this ${scopeLabel} only.
Use this for stable facts, preferences, constraints, or decisions that should matter later.
Do not store raw transcript copies or ephemeral one-turn noise.
Keep memory operations invisible in user-facing replies.`,
		recall: `Recall durable memory already stored for this ${scopeLabel} when prior context may matter.
Use a short natural-language query, not a full prompt dump.
Keep memory operations invisible in user-facing replies.`,
	};
}

export function createVisitorMemoryTools(
	params: VisitorScopedMemoryToolOptions
): {
	rememberVisitor: ReturnType<typeof createMemoryTool>["remember"];
	recallVisitorMemory: ReturnType<typeof createMemoryTool>["recallMemory"];
} {
	const scope = {
		...buildWebsiteScopeMetadata(params),
		visitorId: params.visitorId,
	};
	const descriptions = createScopedMemoryDescriptions("visitor");
	const { remember, recallMemory } = createMemoryTool({
		memory: params.memory,
		remember: {
			metadata: scope,
			description: descriptions.remember,
		},
		recall: {
			where: scope,
			defaults: params.recallDefaults,
			description: descriptions.recall,
		},
	});

	return {
		rememberVisitor: remember,
		recallVisitorMemory: recallMemory,
	};
}

export function createConversationMemoryTools(
	params: ConversationScopedMemoryToolOptions
): {
	rememberConversation: ReturnType<typeof createMemoryTool>["remember"];
	recallConversationMemory: ReturnType<typeof createMemoryTool>["recallMemory"];
} {
	const visitorScope = {
		...buildWebsiteScopeMetadata(params),
		visitorId: params.visitorId,
	};
	const conversationScope = {
		...visitorScope,
		conversationId: params.conversationId,
	};
	const descriptions = createScopedMemoryDescriptions("conversation");
	const { remember, recallMemory } = createMemoryTool({
		memory: params.memory,
		remember: {
			metadata: conversationScope,
			description: descriptions.remember,
		},
		recall: {
			where: conversationScope,
			defaults: params.recallDefaults,
			description: descriptions.recall,
		},
	});

	return {
		rememberConversation: remember,
		recallConversationMemory: recallMemory,
	};
}

export function createWebsiteMemoryTools(params: BaseScopedMemoryToolOptions): {
	rememberWebsite: ReturnType<typeof createMemoryTool>["remember"];
	recallWebsiteMemory: ReturnType<typeof createMemoryTool>["recallMemory"];
} {
	const scope = buildWebsiteScopeMetadata(params);
	const descriptions = createScopedMemoryDescriptions("website");
	const { remember, recallMemory } = createMemoryTool({
		memory: params.memory,
		remember: {
			metadata: scope,
			description: descriptions.remember,
		},
		recall: {
			where: scope,
			defaults: params.recallDefaults,
			description: descriptions.recall,
		},
	});

	return {
		rememberWebsite: remember,
		recallWebsiteMemory: recallMemory,
	};
}
