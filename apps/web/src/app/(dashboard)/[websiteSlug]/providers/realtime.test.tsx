import { beforeEach, describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const invalidateQueriesMock = mock((async (_args: unknown) => {}) as (
	args: unknown
) => Promise<void>);
const useRealtimeMock = mock((_options: unknown) => {});

mock.module("@plasma/next/realtime", () => ({
	useRealtime: useRealtimeMock,
}));

mock.module("@normy/react-query", () => ({
	useQueryNormalizer: () => ({}),
}));

mock.module("@tanstack/react-query", () => ({
	useQueryClient: () => ({
		invalidateQueries: invalidateQueriesMock,
	}),
	useQuery: () => ({
		data: null,
	}),
}));

mock.module("@/components/plan/upgrade-modal", () => ({
	UpgradeModal: () => null,
}));

mock.module("@/contexts/website", () => ({
	useWebsite: () => ({
		id: "site-1",
		slug: "acme",
	}),
	useUserSession: () => ({
		user: {
			id: "user-1",
		},
	}),
}));

mock.module("@/hooks/use-training-controls", () => ({
	useTrainingControls: () => ({
		canAutoStartTraining: false,
		canRequestTraining: false,
		isTrainingActive: false,
		requestTraining: async () => false,
		startTrainingIfAllowed: async () => false,
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		aiAgent: {
			get: {
				queryOptions: () => ({}),
			},
		},
		plan: {
			getPlanInfo: {
				queryOptions: () => ({}),
			},
		},
	}),
}));

mock.module("./events/handlers/conversation-created", () => ({
	handleConversationCreated: () => {},
}));
mock.module("./events/handlers/conversation-seen", () => ({
	handleConversationSeen: async () => {},
}));
mock.module("./events/handlers/conversation-typing", () => ({
	handleConversationTyping: () => {},
}));
mock.module("./events/handlers/conversation-updated", () => ({
	handleConversationUpdated: () => {},
}));
mock.module("./events/handlers/crawl-progress", () => ({
	handleCrawlCompleted: () => {},
	handleCrawlFailed: () => {},
	handleCrawlPageCompleted: () => {},
	handleCrawlPagesDiscovered: () => {},
	handleCrawlProgress: () => {},
	handleCrawlStarted: () => {},
	handleLinkSourceUpdated: () => {},
}));
mock.module("./events/handlers/timeline-item-created", () => ({
	handleMessageCreated: () => {},
}));
mock.module("./events/handlers/timeline-item-updated", () => ({
	handleTimelineItemUpdated: () => {},
}));
mock.module("./events/handlers/training-progress", () => ({
	handleTrainingCompleted: () => {},
	handleTrainingFailed: () => {},
	handleTrainingProgress: () => {},
	handleTrainingStarted: () => {},
}));
mock.module("./events/handlers/visitor-identified", () => ({
	handleVisitorIdentified: () => {},
}));

const realtimeModulePromise = import("./realtime");

describe("Realtime provider", () => {
	beforeEach(() => {
		invalidateQueriesMock.mockClear();
		useRealtimeMock.mockClear();
	});

	it("invalidates live visitor queries when visitorPresenceUpdate arrives", async () => {
		const { Realtime } = await realtimeModulePromise;

		renderToStaticMarkup(
			<Realtime>
				<div>child</div>
			</Realtime>
		);

		expect(useRealtimeMock).toHaveBeenCalledTimes(1);

		const options = useRealtimeMock.mock.calls[0]?.[0] as {
			events: Record<
				string,
				Array<
					(
						data: unknown,
						meta: { event: unknown; context: unknown }
					) => void | Promise<void>
				>
			>;
		};

		const handler = options.events.visitorPresenceUpdate?.[0];
		if (!handler) {
			throw new Error("visitorPresenceUpdate handler was not registered");
		}

		await handler(null, {
			event: {
				type: "visitorPresenceUpdate",
				payload: {
					websiteId: "site-1",
				},
			},
			context: {},
		});

		expect(invalidateQueriesMock).toHaveBeenCalledTimes(3);
		expect(invalidateQueriesMock.mock.calls[0]?.[0]).toEqual({
			queryKey: ["tinybird", "visitor-presence", "acme"],
		});
		expect(invalidateQueriesMock.mock.calls[1]?.[0]).toEqual({
			queryKey: ["tinybird", "online-now", "acme"],
		});
		expect(invalidateQueriesMock.mock.calls[2]?.[0]).toEqual({
			queryKey: ["tinybird", "presence-locations", "acme"],
		});
	});
});
