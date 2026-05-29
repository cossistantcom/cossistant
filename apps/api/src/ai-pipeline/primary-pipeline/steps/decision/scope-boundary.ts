import type { RoleAwareMessage } from "../../contracts";

export type ScopeBoundaryDecision = {
	reason: string;
	ruleId: string;
};

function normalizeText(text: string): string {
	return text
		.normalize("NFKC")
		.replace(/[@#][\p{Letter}\p{Number}_-]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

const CREATIVE_ARTIFACT_PATTERN =
	/\b(poems?|poetry|haiku|sonnets?|stories|story|songs?|rap|lyrics?|jokes?|essays?|novels?|screenplays?|scripts?|limericks?|riddles?|fan ?fiction|po[eè]mes?|poemas?|historias?|cuentos?|chansons?|canci[oó]nes?|bromas?|blagues?)\b/iu;

const CREATIVE_GENERATION_PATTERN =
	/\b(write|compose|create|generate|make|draft|produce|tell|r[eé]dige|[eé]cris|[eé]crire|compose|cr[eé]e|g[eé]n[eè]re|escribe|crear|crea|genera|cu[eé]ntame|contar)\b[\s\S]{0,120}\b(poems?|poetry|haiku|sonnets?|stories|story|songs?|rap|lyrics?|jokes?|essays?|novels?|screenplays?|scripts?|limericks?|riddles?|fan ?fiction|po[eè]mes?|poemas?|historias?|cuentos?|chansons?|canci[oó]nes?|bromas?|blagues?)\b/iu;

const BULK_OUTPUT_PATTERN =
	/\b(write|compose|create|generate|make|draft|produce|tell|r[eé]dige|[eé]cris|[eé]crire|compose|cr[eé]e|g[eé]n[eè]re|escribe|crear|crea|genera|cu[eé]ntame|contar)\b[\s\S]{0,140}\b\d{2,}\s*(lines?|words?|paragraphs?|pages?|verses?|stanzas?|lignes?|mots?|paragraphes?|pages?|vers|estrofas?|l[ií]neas?|palabras?|p[aá]rrafos?|p[aá]ginas?)\b/iu;

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
	/\b(ignore|disregard|forget|override|bypass)\b[\s\S]{0,80}\b(previous|prior|above|system|developer|instructions?|rules?|guardrails?)\b/iu,
	/\b(reveal|show|print|repeat|dump|leak)\b[\s\S]{0,80}\b(system|developer|prompt|instructions?|rules?|hidden message|secret)\b/iu,
	/\b(system|developer)\s+(prompt|message|instructions?)\b/iu,
	/\bjailbreak\b/iu,
	/\bdeveloper\s+mode\b/iu,
	/\bact\s+as\b[\s\S]{0,60}\b(chatgpt|dan|poet|writer|roleplay|another assistant)\b/iu,
	/\bpretend\s+(to\s+be|you\s+are)\b[\s\S]{0,60}\b(chatgpt|dan|poet|writer|roleplay|another assistant)\b/iu,
];

function isPublicVisitorMessage(
	message: RoleAwareMessage | null
): message is RoleAwareMessage {
	return message?.senderType === "visitor" && message.visibility === "public";
}

export function detectScopeBoundaryRequest(
	message: RoleAwareMessage | null
): ScopeBoundaryDecision | null {
	if (!isPublicVisitorMessage(message)) {
		return null;
	}

	const normalizedText = normalizeText(message.content);
	if (!normalizedText) {
		return null;
	}

	for (const pattern of PROMPT_INJECTION_PATTERNS) {
		if (pattern.test(normalizedText)) {
			return {
				reason: "Visitor prompt-injection request is outside support scope",
				ruleId: "visitor_prompt_injection_scope_boundary",
			};
		}
	}

	if (BULK_OUTPUT_PATTERN.test(normalizedText)) {
		return {
			reason:
				"Visitor bulk content-generation request is outside support scope",
			ruleId: "visitor_bulk_generation_scope_boundary",
		};
	}

	if (
		CREATIVE_GENERATION_PATTERN.test(normalizedText) ||
		(/\b(tell me|write me|make me|give me)\b/iu.test(normalizedText) &&
			CREATIVE_ARTIFACT_PATTERN.test(normalizedText))
	) {
		return {
			reason: "Visitor creative side request is outside support scope",
			ruleId: "visitor_creative_request_scope_boundary",
		};
	}

	return null;
}
