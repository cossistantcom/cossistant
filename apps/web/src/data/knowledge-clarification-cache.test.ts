import { beforeEach, describe, expect, it } from "bun:test";
import type { RouterOutputs } from "@api/trpc/types";
import { QueryClient } from "@tanstack/react-query";
import {
	removeProposalRequestFromCache,
	setProposalResponseInCache,
	syncProposalRequestInCache,
} from "./knowledge-clarification-cache";

type ProposalsResponse =
	RouterOutputs["knowledgeClarification"]["listProposals"];
type ProposalResponse = RouterOutputs["knowledgeClarification"]["getProposal"];
type ProposalRequest = ProposalsResponse["items"][number];

const proposalsQueryKey = [
	["knowledgeClarification", "listProposals"],
	{ input: { websiteSlug: "acme" } },
] as const;

const proposalQueryKey = [
	["knowledgeClarification", "getProposal"],
	{ input: { websiteSlug: "acme", requestId: "req_1" } },
] as const;

function createRequest(
	overrides: Partial<ProposalRequest> = {}
): ProposalRequest {
	return {
		id: "req_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		conversationId: null,
		source: "faq",
		status: "deferred",
		topicSummary: "Clarify refund timing",
		engagementMode: "owner",
		linkedConversationCount: 1,
		stepIndex: 1,
		maxSteps: 3,
		targetKnowledgeId: null,
		targetKnowledgeSummary: null,
		currentQuestion: "When can refunds be requested?",
		currentSuggestedAnswers: ["Immediately", "Within 30 days", "Never"],
		currentQuestionInputMode: "suggested_answers",
		currentQuestionScope: "narrow_detail",
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-17T10:00:00.000Z",
		updatedAt: "2026-03-17T10:00:00.000Z",
		...overrides,
	};
}

describe("knowledge clarification cache helpers", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		queryClient = new QueryClient();
	});

	it("syncs active proposal requests into the proposal list cache", () => {
		queryClient.setQueryData<ProposalsResponse>(proposalsQueryKey, {
			items: [
				createRequest({
					id: "req_2",
					topicSummary: "Clarify upgrade policy",
				}),
			],
		});

		const request = createRequest({
			id: "req_1",
			status: "retry_required",
			currentQuestion: null,
			currentSuggestedAnswers: null,
			currentQuestionInputMode: null,
			currentQuestionScope: null,
			lastError: "No output generated.",
			updatedAt: "2026-03-17T11:00:00.000Z",
		});

		syncProposalRequestInCache(queryClient, proposalsQueryKey, request);

		expect(
			queryClient.getQueryData<ProposalsResponse>(proposalsQueryKey)
		).toEqual({
			items: [
				request,
				createRequest({
					id: "req_2",
					topicSummary: "Clarify upgrade policy",
				}),
			],
		});
	});

	it("removes terminal proposal requests from the list cache", () => {
		queryClient.setQueryData<ProposalsResponse>(proposalsQueryKey, {
			items: [
				createRequest({
					id: "req_1",
				}),
				createRequest({
					id: "req_2",
					topicSummary: "Clarify upgrade policy",
				}),
			],
		});

		syncProposalRequestInCache(
			queryClient,
			proposalsQueryKey,
			createRequest({
				id: "req_1",
				status: "applied",
				currentQuestion: null,
				currentSuggestedAnswers: null,
				currentQuestionInputMode: null,
				currentQuestionScope: null,
			})
		);

		expect(
			queryClient.getQueryData<ProposalsResponse>(proposalsQueryKey)
		).toEqual({
			items: [
				createRequest({
					id: "req_2",
					topicSummary: "Clarify upgrade policy",
				}),
			],
		});
	});

	it("removes stale requests from the proposal list and stores null proposal responses", () => {
		queryClient.setQueryData<ProposalsResponse>(proposalsQueryKey, {
			items: [
				createRequest({
					id: "req_1",
				}),
				createRequest({
					id: "req_2",
					topicSummary: "Clarify upgrade policy",
				}),
			],
		});

		removeProposalRequestFromCache(queryClient, proposalsQueryKey, "req_1");
		setProposalResponseInCache(queryClient, proposalQueryKey, null);

		expect(
			queryClient.getQueryData<ProposalsResponse>(proposalsQueryKey)
		).toEqual({
			items: [
				createRequest({
					id: "req_2",
					topicSummary: "Clarify upgrade policy",
				}),
			],
		});
		expect(
			queryClient.getQueryData<ProposalResponse>(proposalQueryKey)
		).toEqual({
			request: null,
		});
	});
});
