import type { KnowledgeClarificationTurnSelect } from "@api/db/schema/knowledge-clarification";
import type {
	KnowledgeClarificationContextSnapshot,
	KnowledgeClarificationLinkedFaqSnapshot,
	KnowledgeClarificationSearchEvidence,
	KnowledgeClarificationTranscriptMessageSnapshot,
} from "@api/lib/knowledge-clarification-context";
import type {
	KnowledgeClarificationQuestionInputMode,
	KnowledgeClarificationQuestionScope,
} from "@plasma/types";

const MAX_GROUNDED_FACTS = 10;
const MAX_TRANSCRIPT_CLAIMS = 6;
const MAX_SEARCH_EVIDENCE_LINES = 4;
const MIN_GROUNDING_OVERLAP = 2;
const MEANINGFUL_TOKEN_MIN_LENGTH = 4;

const STOPWORDS = new Set([
	"about",
	"after",
	"again",
	"answer",
	"answers",
	"before",
	"clarification",
	"clarify",
	"current",
	"detail",
	"details",
	"draft",
	"exact",
	"faq",
	"facts",
	"have",
	"into",
	"just",
	"latest",
	"more",
	"need",
	"next",
	"only",
	"question",
	"questions",
	"should",
	"support",
	"team",
	"teammate",
	"that",
	"their",
	"there",
	"these",
	"this",
	"those",
	"through",
	"what",
	"when",
	"where",
	"whether",
	"which",
	"would",
	"happen",
	"happens",
	"apply",
	"applies",
	"rule",
]);

export const CLARIFICATION_QUESTION_GROUNDING_SOURCES = [
	"topic_anchor",
	"latest_human_answer",
	"latest_exchange",
	"transcript_claim",
	"search_evidence",
	"linked_faq",
] as const;

export type ClarificationQuestionGroundingSource =
	(typeof CLARIFICATION_QUESTION_GROUNDING_SOURCES)[number];

export type ClarificationAnsweredQuestion = {
	question: string;
	answer: string;
	answerType: "answered" | "skipped";
};

export type ClarificationRelevancePacket = {
	topicAnchor: string;
	openGap: string;
	groundedFacts: string[];
	transcriptClaims: string[];
	answeredQuestions: ClarificationAnsweredQuestion[];
	disallowedQuestions: string[];
	searchEvidence: string[];
	linkedFaqSummary: string | null;
	latestHumanAnswer: string | null;
	latestExchange: ClarificationAnsweredQuestion | null;
};

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, maxLength: number): string {
	const normalized = normalizeText(value);
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function uniqueTrimmed(values: Array<string | null | undefined>): string[] {
	return [
		...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)),
	];
}

function normalizeQuestionKey(value: string): string {
	return normalizeText(value)
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizeMeaningfulToken(token: string): string {
	if (token.endsWith("ies") && token.length > 4) {
		return `${token.slice(0, -3)}y`;
	}

	if (token.endsWith("es") && token.length > 4) {
		return token.slice(0, -2);
	}

	if (token.endsWith("s") && token.length > 4) {
		return token.slice(0, -1);
	}

	return token;
}

function tokenizeMeaningful(value: string): Set<string> {
	return new Set(
		normalizeQuestionKey(value)
			.split(" ")
			.map(normalizeMeaningfulToken)
			.filter(
				(token) =>
					token.length >= MEANINGFUL_TOKEN_MIN_LENGTH && !STOPWORDS.has(token)
			)
	);
}

function countTokenOverlap(left: string, right: string): number {
	const leftTokens = tokenizeMeaningful(left);
	const rightTokens = tokenizeMeaningful(right);
	let overlap = 0;

	for (const token of leftTokens) {
		if (rightTokens.has(token)) {
			overlap += 1;
		}
	}

	return overlap;
}

function calculateTokenSimilarity(left: string, right: string): number {
	const leftTokens = tokenizeMeaningful(left);
	const rightTokens = tokenizeMeaningful(right);
	if (leftTokens.size === 0 || rightTokens.size === 0) {
		return 0;
	}

	let overlap = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) {
			overlap += 1;
		}
	}

	const denominator = new Set([...leftTokens, ...rightTokens]).size;
	return denominator > 0 ? overlap / denominator : 0;
}

function getNovelTokens(candidate: string, ...baselines: string[]): string[] {
	const baselineTokens = new Set<string>();
	for (const baseline of baselines) {
		for (const token of tokenizeMeaningful(baseline)) {
			baselineTokens.add(token);
		}
	}

	return [...tokenizeMeaningful(candidate)].filter(
		(token) => !baselineTokens.has(token)
	);
}

function looksBroadOrExploratory(value: string): boolean {
	const normalized = normalizeQuestionKey(value);
	return [
		"anything else",
		"any other details",
		"can you clarify more",
		"could you clarify more",
		"tell me more",
		"what else should we know",
		"can you share more context",
		"provide more details",
	].some((pattern) => normalized.includes(pattern));
}

function staysAnchoredToTopic(params: {
	question: string;
	topicAnchor: string;
	groundingSnippet: string;
}): boolean {
	return (
		countTokenOverlap(params.question, params.topicAnchor) >= 1 ||
		countTokenOverlap(params.question, params.groundingSnippet) >= 1
	);
}

function looksGenericMissingFact(value: string): boolean {
	const normalized = normalizeQuestionKey(value);
	return [
		"more detail",
		"more context",
		"clarification",
		"additional info",
		"anything else",
	].some((pattern) => normalized === pattern || normalized.includes(pattern));
}

function looksUncertainOrPartialAnswer(value: string): boolean {
	const normalized = normalizeQuestionKey(value);
	return [
		"depends",
		"i think",
		"im not sure",
		"not sure",
		"unclear",
		"unknown",
		"varies",
		"case by case",
		"probably",
		"maybe",
		"sometimes",
		"usually",
		"generally",
		"likely",
	].some((pattern) => normalized.includes(pattern));
}

function pairAnsweredQuestions(
	turns: KnowledgeClarificationTurnSelect[]
): ClarificationAnsweredQuestion[] {
	const answered: ClarificationAnsweredQuestion[] = [];
	let pendingQuestion: string | null = null;

	for (const turn of turns) {
		if (turn.role === "ai_question") {
			pendingQuestion = turn.question ? normalizeText(turn.question) : null;
			continue;
		}

		if (!pendingQuestion) {
			continue;
		}

		if (turn.role === "human_skip") {
			answered.push({
				question: pendingQuestion,
				answer: "Skipped by teammate",
				answerType: "skipped",
			});
			pendingQuestion = null;
			continue;
		}

		if (turn.role === "human_answer") {
			const answer =
				turn.selectedAnswer?.trim() || turn.freeAnswer?.trim() || "No answer";
			answered.push({
				question: pendingQuestion,
				answer: normalizeText(answer),
				answerType: "answered",
			});
			pendingQuestion = null;
		}
	}

	return answered;
}

function formatLinkedFaqSummary(
	linkedFaq: KnowledgeClarificationLinkedFaqSnapshot | null
): string | null {
	if (!linkedFaq) {
		return null;
	}

	const fragments = uniqueTrimmed([
		linkedFaq.question ? `Current FAQ question: ${linkedFaq.question}` : null,
		linkedFaq.answer
			? `Current FAQ answer: ${clipText(linkedFaq.answer, 240)}`
			: null,
		linkedFaq.categories.length > 0
			? `Categories: ${linkedFaq.categories.join(", ")}`
			: null,
		linkedFaq.relatedQuestions.length > 0
			? `Related: ${linkedFaq.relatedQuestions.join(" | ")}`
			: null,
	]);

	return fragments.length > 0 ? fragments.join("\n") : null;
}

function formatTranscriptClaims(
	messages: KnowledgeClarificationTranscriptMessageSnapshot[]
): string[] {
	return messages
		.filter((message) => message.senderType !== "ai_agent")
		.slice(-MAX_TRANSCRIPT_CLAIMS)
		.map((message) => {
			const label =
				message.senderType === "visitor" ? "Visitor claim" : "Team claim";
			const visibility = message.visibility === "private" ? "[private] " : "";
			return `${visibility}${label}: ${clipText(message.content, 220)}`;
		});
}

function formatSearchEvidence(
	searchEvidence: KnowledgeClarificationSearchEvidence[]
): string[] {
	return searchEvidence.slice(-MAX_SEARCH_EVIDENCE_LINES).map((item) => {
		const articleSummary = item.articles[0]
			? [
					item.articles[0].title ? `top="${item.articles[0].title}"` : null,
					item.articles[0].similarity !== null
						? `similarity=${item.articles[0].similarity}`
						: null,
				]
					.filter(Boolean)
					.join(" | ")
			: null;

		return [
			item.questionContext
				? `context="${clipText(item.questionContext, 120)}"`
				: null,
			item.query ? `query="${clipText(item.query, 80)}"` : null,
			item.retrievalQuality ? `quality=${item.retrievalQuality}` : null,
			item.totalFound !== null ? `results=${item.totalFound}` : null,
			articleSummary,
		]
			.filter(Boolean)
			.join(" | ");
	});
}

function buildGroundedFacts(params: {
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	answeredQuestions: ClarificationAnsweredQuestion[];
}): string[] {
	const linkedFaq = params.contextSnapshot?.linkedFaq ?? null;
	const searchEvidence = params.contextSnapshot?.kbSearchEvidence ?? [];

	const facts = uniqueTrimmed([
		linkedFaq?.question ? `Known FAQ question: ${linkedFaq.question}` : null,
		linkedFaq?.answer
			? `Known FAQ answer: ${clipText(linkedFaq.answer, 260)}`
			: null,
		...(linkedFaq?.categories ?? []).map(
			(value) => `Known FAQ category: ${value}`
		),
		...searchEvidence.flatMap((item) =>
			item.retrievalQuality === "strong"
				? item.articles
						.slice(0, 2)
						.map((article) =>
							uniqueTrimmed([
								article.title ? `Strong KB article: ${article.title}` : null,
								article.snippet
									? `Strong KB snippet: ${article.snippet}`
									: null,
							]).join(" | ")
						)
				: []
		),
		...params.answeredQuestions
			.filter((entry) => entry.answerType === "answered")
			.map(
				(entry) =>
					`Clarified answer: ${clipText(
						`${entry.question} -> ${entry.answer}`,
						260
					)}`
			),
	]);

	return facts.slice(0, MAX_GROUNDED_FACTS);
}

function deriveOpenGap(params: {
	topicAnchor: string;
	latestExchange: ClarificationAnsweredQuestion | null;
}): string {
	if (!params.latestExchange) {
		return params.topicAnchor;
	}

	if (params.latestExchange.answerType === "skipped") {
		return clipText(
			`Unresolved detail from skipped question: ${params.latestExchange.question}`,
			220
		);
	}

	if (looksUncertainOrPartialAnswer(params.latestExchange.answer)) {
		return clipText(
			`Exact rule behind teammate answer: ${params.latestExchange.answer}`,
			220
		);
	}

	return clipText(
		`One remaining material condition beyond: ${params.latestExchange.answer}`,
		220
	);
}

function missingFactAlreadyGrounded(
	missingFact: string,
	groundedFacts: string[]
): boolean {
	const normalizedMissingFact = normalizeQuestionKey(missingFact);
	if (normalizedMissingFact.length < 12) {
		return false;
	}

	return groundedFacts.some((fact) =>
		normalizeQuestionKey(fact).includes(normalizedMissingFact)
	);
}

function matchesGroundingSnippet(params: {
	groundingSnippet: string;
	candidates: string[];
}): boolean {
	const normalizedSnippet = normalizeQuestionKey(params.groundingSnippet);
	if (normalizedSnippet.length < 8) {
		return false;
	}

	return params.candidates.some((candidate) => {
		const normalizedCandidate = normalizeQuestionKey(candidate);
		return (
			normalizedCandidate.includes(normalizedSnippet) ||
			countTokenOverlap(params.groundingSnippet, candidate) >=
				MIN_GROUNDING_OVERLAP
		);
	});
}

function reopensLatestQuestion(params: {
	question: string;
	latestQuestion: string;
}): boolean {
	const novelTokens = getNovelTokens(params.question, params.latestQuestion);
	return (
		calculateTokenSimilarity(params.question, params.latestQuestion) >= 0.65 &&
		novelTokens.length < 2
	);
}

function latestAnswerAlreadyResolvesMissingFact(params: {
	missingFact: string;
	topicAnchor: string;
	latestExchange: ClarificationAnsweredQuestion | null;
}): boolean {
	if (
		!(
			params.latestExchange &&
			params.latestExchange.answerType === "answered" &&
			!looksUncertainOrPartialAnswer(params.latestExchange.answer)
		)
	) {
		return false;
	}

	const overlapWithAnswer = countTokenOverlap(
		params.missingFact,
		params.latestExchange.answer
	);
	if (overlapWithAnswer === 0) {
		return false;
	}

	const combinedLatestExchange = `${params.latestExchange.question} ${params.latestExchange.answer}`;
	const novelTokens = getNovelTokens(
		params.missingFact,
		params.latestExchange.answer,
		params.latestExchange.question,
		params.topicAnchor
	);

	return (
		novelTokens.length < 2 &&
		calculateTokenSimilarity(params.missingFact, combinedLatestExchange) >= 0.35
	);
}

export function buildClarificationRelevancePacket(params: {
	topicSummary: string;
	contextSnapshot: KnowledgeClarificationContextSnapshot | null;
	turns: KnowledgeClarificationTurnSelect[];
}): ClarificationRelevancePacket {
	const topicAnchor = normalizeText(params.topicSummary);
	const answeredQuestions = pairAnsweredQuestions(params.turns);
	const latestExchange = answeredQuestions.at(-1) ?? null;
	const groundedFacts = buildGroundedFacts({
		contextSnapshot: params.contextSnapshot,
		answeredQuestions,
	});
	const askedQuestions = params.turns
		.filter((turn) => turn.role === "ai_question")
		.map((turn) => turn.question?.trim() ?? "")
		.filter(Boolean);

	return {
		topicAnchor,
		openGap: deriveOpenGap({
			topicAnchor,
			latestExchange,
		}),
		groundedFacts,
		transcriptClaims: formatTranscriptClaims(
			params.contextSnapshot?.relevantTranscript ?? []
		),
		answeredQuestions,
		disallowedQuestions: uniqueTrimmed([
			...askedQuestions,
			...answeredQuestions.map((entry) => entry.question),
			"Avoid broad catch-all questions such as 'anything else?'",
		]),
		searchEvidence: formatSearchEvidence(
			params.contextSnapshot?.kbSearchEvidence ?? []
		),
		linkedFaqSummary: formatLinkedFaqSummary(
			params.contextSnapshot?.linkedFaq ?? null
		),
		latestHumanAnswer:
			latestExchange?.answerType === "answered" ? latestExchange.answer : null,
		latestExchange,
	};
}

export function validateClarificationQuestionCandidate(params: {
	question: string;
	missingFact: string;
	whyItMatters: string;
	inputMode: KnowledgeClarificationQuestionInputMode;
	questionScope: KnowledgeClarificationQuestionScope;
	expectedInputMode: KnowledgeClarificationQuestionInputMode;
	expectedQuestionScope: KnowledgeClarificationQuestionScope;
	groundingSource: ClarificationQuestionGroundingSource;
	groundingSnippet: string;
	packet: ClarificationRelevancePacket;
}): { valid: true } | { valid: false; reason: string } {
	const normalizedQuestion = normalizeQuestionKey(params.question);
	if (!normalizedQuestion) {
		return {
			valid: false,
			reason: "Question is empty after normalization.",
		};
	}

	if (params.inputMode !== params.expectedInputMode) {
		return {
			valid: false,
			reason: "Question input mode does not match the expected strategy.",
		};
	}

	if (params.questionScope !== params.expectedQuestionScope) {
		return {
			valid: false,
			reason: "Question scope does not match the expected strategy.",
		};
	}

	if (looksBroadOrExploratory(params.question)) {
		return {
			valid: false,
			reason: "Question is too broad for a high-signal clarification step.",
		};
	}

	if (params.questionScope === "broad_discovery") {
		if (params.packet.latestExchange) {
			return {
				valid: false,
				reason:
					"Broad discovery is only allowed on the first clarification step.",
			};
		}

		if (
			params.groundingSource === "latest_human_answer" ||
			params.groundingSource === "latest_exchange"
		) {
			return {
				valid: false,
				reason:
					"Broad discovery questions must be anchored to the topic, not a follow-up exchange.",
			};
		}

		if (
			!staysAnchoredToTopic({
				question: params.question,
				topicAnchor: params.packet.topicAnchor,
				groundingSnippet: params.groundingSnippet,
			})
		) {
			return {
				valid: false,
				reason:
					"Broad discovery question is not anchored tightly enough to the topic.",
			};
		}
	}

	if (
		params.packet.disallowedQuestions.some(
			(value) => normalizeQuestionKey(value) === normalizedQuestion
		)
	) {
		return {
			valid: false,
			reason: "Question repeats or conflicts with an earlier clarification.",
		};
	}

	if (looksGenericMissingFact(params.missingFact)) {
		return {
			valid: false,
			reason: "Missing fact is too generic to justify another question.",
		};
	}

	if (
		missingFactAlreadyGrounded(params.missingFact, params.packet.groundedFacts)
	) {
		return {
			valid: false,
			reason: "Missing fact already appears in the grounded facts.",
		};
	}

	if (normalizeText(params.whyItMatters).length < 16) {
		return {
			valid: false,
			reason: "Why-it-matters justification is too weak.",
		};
	}

	if (params.packet.latestExchange) {
		if (
			params.groundingSource !== "latest_human_answer" &&
			params.groundingSource !== "latest_exchange"
		) {
			return {
				valid: false,
				reason:
					"Follow-up is not grounded in the latest clarification exchange.",
			};
		}

		if (
			!matchesGroundingSnippet({
				groundingSnippet: params.groundingSnippet,
				candidates: [
					params.packet.latestExchange.question,
					params.packet.latestExchange.answer,
				],
			})
		) {
			return {
				valid: false,
				reason:
					"Grounding snippet does not match the latest clarification exchange.",
			};
		}

		if (
			reopensLatestQuestion({
				question: params.question,
				latestQuestion: params.packet.latestExchange.question,
			})
		) {
			return {
				valid: false,
				reason:
					"Question reopens the latest resolved point instead of narrowing it.",
			};
		}

		if (
			latestAnswerAlreadyResolvesMissingFact({
				missingFact: params.missingFact,
				topicAnchor: params.packet.topicAnchor,
				latestExchange: params.packet.latestExchange,
			})
		) {
			return {
				valid: false,
				reason: "Latest teammate answer already resolves this missing fact.",
			};
		}
	}

	return { valid: true };
}
