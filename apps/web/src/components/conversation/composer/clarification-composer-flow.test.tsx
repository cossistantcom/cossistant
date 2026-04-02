import { describe, expect, it, mock } from "bun:test";
import type { ConversationClarificationProgress } from "@plasma/types";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const answerMutationOptionsMock = mock((options: unknown) => options);
const skipMutationOptionsMock = mock((options: unknown) => options);
const retryMutationOptionsMock = mock((options: unknown) => options);
const approveDraftMutationOptionsMock = mock((options: unknown) => options);

mock.module("next/navigation", () => ({
	useRouter: () => ({
		push: () => {},
	}),
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: () => ({
		isPending: false,
		mutate: () => null,
		mutateAsync: async () => null,
	}),
}));

mock.module(
	"@/components/knowledge-clarification/use-query-invalidation",
	() => ({
		useKnowledgeClarificationQueryInvalidation: () => async () => {},
	})
);

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		knowledgeClarification: {
			answer: {
				mutationOptions: answerMutationOptionsMock,
			},
			skip: {
				mutationOptions: skipMutationOptionsMock,
			},
			retry: {
				mutationOptions: retryMutationOptionsMock,
			},
			approveDraft: {
				mutationOptions: approveDraftMutationOptionsMock,
			},
		},
	}),
}));

const modulePromise = import("./clarification-composer-flow");

function createSummary(
	overrides: Partial<{
		requestId: string;
		status: "analyzing" | "awaiting_answer" | "retry_required" | "draft_ready";
		topicSummary: string;
		question: string | null;
		stepIndex: number;
		maxSteps: number;
		progress: ConversationClarificationProgress | null;
		updatedAt: string;
	}> = {}
) {
	return {
		requestId: "req_1",
		status: "awaiting_answer" as const,
		topicSummary: "Clarify billing timing",
		question: "Does the billing change immediately?",
		stepIndex: 2,
		maxSteps: 5,
		progress: null,
		updatedAt: "2026-03-14T10:00:00.000Z",
		...overrides,
	};
}

function createRequest(
	overrides: Partial<{
		id: string;
		organizationId: string;
		websiteId: string;
		aiAgentId: string;
		conversationId: string | null;
		source: "conversation" | "faq";
		status:
			| "analyzing"
			| "awaiting_answer"
			| "retry_required"
			| "draft_ready"
			| "deferred"
			| "applied"
			| "dismissed";
		topicSummary: string;
		stepIndex: number;
		maxSteps: number;
		targetKnowledgeId: string | null;
		currentQuestion: string | null;
		currentSuggestedAnswers: [string, string, string] | null;
		currentQuestionInputMode: "textarea_first" | "suggested_answers" | null;
		currentQuestionScope: "broad_discovery" | "narrow_detail" | null;
		draftFaqPayload: {
			title: string | null;
			question: string;
			answer: string;
			categories: string[];
			relatedQuestions: string[];
		} | null;
		lastError: string | null;
		createdAt: string;
		updatedAt: string;
	}> = {}
) {
	return {
		id: "req_1",
		organizationId: "org_1",
		websiteId: "site_1",
		aiAgentId: "agent_1",
		conversationId: "conv_1",
		source: "conversation" as const,
		status: "awaiting_answer" as const,
		topicSummary: "Clarify billing timing",
		stepIndex: 2,
		maxSteps: 5,
		targetKnowledgeId: null,
		currentQuestion: "Does the billing change immediately?",
		currentSuggestedAnswers: [
			"Immediately",
			"At the next billing cycle",
			"It depends on the plan",
		] as [string, string, string],
		currentQuestionInputMode: "suggested_answers" as const,
		currentQuestionScope: "narrow_detail" as const,
		draftFaqPayload: null,
		lastError: null,
		createdAt: "2026-03-14T09:00:00.000Z",
		updatedAt: "2026-03-14T10:00:00.000Z",
		...overrides,
	};
}

describe("useClarificationComposerFlow", () => {
	it("disables automatic retries for clarification mutations", async () => {
		answerMutationOptionsMock.mockClear();
		skipMutationOptionsMock.mockClear();
		retryMutationOptionsMock.mockClear();
		approveDraftMutationOptionsMock.mockClear();

		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest(),
				summary: createSummary(),
				websiteSlug: "acme",
			});

			return null;
		}

		renderToStaticMarkup(<FlowHarness />);

		expect(answerMutationOptionsMock.mock.calls[0]?.[0]).toMatchObject({
			retry: false,
		});
		expect(skipMutationOptionsMock.mock.calls[0]?.[0]).toMatchObject({
			retry: false,
		});
		expect(retryMutationOptionsMock.mock.calls[0]?.[0]).toMatchObject({
			retry: false,
		});
		expect(approveDraftMutationOptionsMock.mock.calls[0]?.[0]).toMatchObject({
			retry: false,
		});
	});

	it("renders topic, question flow, and bottom actions for an engaged clarification", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest(),
				summary: createSummary(),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain('data-clarification-slot="topic"');
		expect(html).toContain("Clarify billing timing");
		expect(html).toContain('data-clarification-slot="question-flow"');
		expect(html).toContain("Does the billing change immediately?");
		expect(html).toContain('data-clarification-slot="actions"');
		expect(html).toContain(">Skip<");
		expect(html).toContain(">Next<");
		expect(html).toContain(">Cancel<");
	});

	it("renders textarea-first discovery questions with starter chips", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest({
					currentQuestion: "How does billing-change handling work today?",
					currentQuestionInputMode: "textarea_first",
					currentQuestionScope: "broad_discovery",
				}),
				summary: createSummary({
					question: "How does billing-change handling work today?",
				}),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain(
			'placeholder="Describe how this workflow or rule works today..."'
		);
		expect(html).toContain("autofocus");
		expect(html).toContain("How does billing-change handling work today?");
	});

	it("renders a loading state while the engaged clarification request is still loading", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: null,
				summary: createSummary({ status: "analyzing", question: null }),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain("Clarify billing timing");
		expect(html).toContain('data-clarification-slot="loading"');
		expect(html).toContain("Reviewing your answer...");
		expect(html).not.toContain('data-clarification-slot="actions"');
	});

	it("renders only the minimal loading row while clarification progress is active", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest({
					status: "analyzing",
				}),
				summary: createSummary({
					status: "analyzing",
					question: null,
					progress: {
						phase: "reviewing_evidence",
						label: "Reviewing evidence...",
						detail: null,
						attempt: 1,
						toolName: "kb_search",
						startedAt: "2026-03-14T10:00:00.000Z",
					},
				}),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain("Reviewing evidence...");
		expect(html).not.toContain("Does the billing change immediately?");
		expect(html).not.toContain('data-clarification-slot="question-flow"');
		expect(html).not.toContain('data-clarification-slot="actions"');
		expect(html).not.toContain('data-clarification-progress-card="true"');
		expect(html).not.toContain("Running kb_search");
	});

	it("shows retrying generation as the active loading status when a fallback attempt starts", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest({
					status: "analyzing",
				}),
				summary: createSummary({
					status: "analyzing",
					question: null,
					progress: {
						phase: "retrying_generation",
						label: "Retrying generation...",
						detail: null,
						attempt: 2,
						toolName: null,
						startedAt: "2026-03-14T10:00:00.000Z",
					},
				}),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain("Retrying generation...");
		expect(html).not.toContain("This is taking longer than usual");
	});

	it("renders an inline retry state for retry-required clarification failures", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest({
					status: "retry_required",
					currentQuestion: null,
					currentSuggestedAnswers: null,
					currentQuestionInputMode: null,
					currentQuestionScope: null,
					lastError: "Provider returned error",
				}),
				summary: createSummary({
					status: "retry_required",
					question: null,
				}),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain('data-clarification-slot="retry"');
		expect(html).toContain("This clarification needs a retry");
		expect(html).toContain("Provider returned error");
		expect(html).toContain(">Retry AI<");
		expect(html).not.toContain('data-clarification-slot="actions"');
	});

	it("renders a draft-ready banner above the composer once the faq draft exists", async () => {
		const { useClarificationComposerFlow } = await modulePromise;

		function FlowHarness() {
			const blocks = useClarificationComposerFlow({
				onCancel: () => {},
				request: createRequest({
					status: "draft_ready",
					currentQuestion: null,
					currentSuggestedAnswers: null,
					currentQuestionInputMode: null,
					currentQuestionScope: null,
					draftFaqPayload: {
						title: "Billing timing",
						question: "When does billing change take effect?",
						answer: "It applies at the next billing cycle.",
						categories: ["Billing"],
						relatedQuestions: [],
					},
				}),
				summary: createSummary({
					status: "draft_ready",
					question: null,
				}),
				websiteSlug: "acme",
			});

			return (
				<>
					{blocks?.aboveBlock}
					{blocks?.centralBlock}
					{blocks?.bottomBlock}
				</>
			);
		}

		const html = renderToStaticMarkup(<FlowHarness />);

		expect(html).toContain('data-clarification-slot="draft-ready-banner"');
		expect(html).toContain("FAQ draft ready");
		expect(html).toContain(">View<");
		expect(html).toContain(">Approve<");
	});

	it("accepts an approve button ref on the shared draft-ready banner", async () => {
		const { ClarificationDraftReadyBanner } = await modulePromise;
		const approveButtonRef = React.createRef<HTMLButtonElement>();

		const html = renderToStaticMarkup(
			<ClarificationDraftReadyBanner
				approveButtonRef={approveButtonRef}
				canApprove={true}
				canView={true}
				isApproving={false}
				onApprove={() => {}}
				onClose={() => {}}
				onView={() => {}}
				request={null}
				topicSummary="Clarify billing timing"
			/>
		);

		expect(html).toContain('data-clarification-slot="draft-ready-banner"');
		expect(html).toContain(">Approve<");
	});

	it("marks the shared next button as a cursor target when a submit ref is provided", async () => {
		const { ClarificationActionsBlock } = await modulePromise;
		const submitButtonRef = React.createRef<HTMLButtonElement>();

		const html = renderToStaticMarkup(
			<ClarificationActionsBlock
				canSkip={true}
				canSubmit={true}
				isPending={false}
				isSkipping={false}
				isSubmitting={false}
				onCancel={() => {}}
				onSkip={() => {}}
				onSubmit={() => {}}
				submitButtonRef={submitButtonRef}
			/>
		);

		expect(html).toContain('data-clarification-submit-target="true"');
		expect(html).toContain(">Next<");
	});
});
