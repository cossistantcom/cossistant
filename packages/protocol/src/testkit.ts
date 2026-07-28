/**
 * Compatibility testkit.
 *
 * Lets a second implementation prove its served document still matches the
 * canonical Cossistant contract. Deliberately a focused structural comparison,
 * not a general-purpose API testing framework.
 */
import { buildCossistantOpenApiDocument } from "./openapi";

const HTTP_METHODS = new Set([
	"delete",
	"get",
	"head",
	"options",
	"patch",
	"post",
	"put",
	"trace",
]);

type AnyDocument = {
	paths?: Record<string, Record<string, unknown>>;
	components?: { securitySchemes?: Record<string, unknown> };
};

type Operation = {
	operationId?: string;
	security?: Record<string, unknown>[];
	parameters?: { name?: string; in?: string; required?: boolean }[];
	requestBody?: { content?: Record<string, unknown> };
	responses?: Record<string, { content?: Record<string, unknown> }>;
};

/**
 * An intentional, reviewed difference. Each entry must name the exact operation
 * and field being relaxed, and say why.
 */
export type CompatibilityAllowance = {
	/** e.g. `GET /conversations/{conversationId}` */
	operation: string;
	/** e.g. `responses.200.schema`, `parameters`, or `*` for the whole operation */
	field: string;
	reason: string;
};

export type CompatibilityOptions = {
	/** Compare against this document instead of the canonical one. */
	expected?: AnyDocument;
	allow?: CompatibilityAllowance[];
};

export type CompatibilityViolation = {
	operation: string;
	field: string;
	detail: string;
};

function operations(doc: AnyDocument) {
	const out = new Map<string, Operation>();
	for (const [path, item] of Object.entries(doc.paths ?? {})) {
		for (const [method, operation] of Object.entries(item)) {
			if (
				HTTP_METHODS.has(method) &&
				operation &&
				typeof operation === "object"
			) {
				out.set(`${method.toUpperCase()} ${path}`, operation as Operation);
			}
		}
	}
	return out;
}

function parameterKeys(operation: Operation) {
	return (operation.parameters ?? [])
		.map((p) => `${p.in}:${p.name}:${p.required ? "required" : "optional"}`)
		.sort();
}

function securityKeys(operation: Operation) {
	return (operation.security ?? [])
		.flatMap((entry) => Object.keys(entry))
		.sort();
}

function isAllowed(
	allow: CompatibilityAllowance[],
	operation: string,
	field: string
) {
	return allow.some(
		(a) => a.operation === operation && (a.field === field || a.field === "*")
	);
}

/**
 * Compare an implementation's OpenAPI document against the canonical protocol.
 * Returns every violation; an empty array means the implementation conforms.
 */
export function checkCossistantProtocolCompatibility(
	actual: AnyDocument,
	options: CompatibilityOptions = {}
): CompatibilityViolation[] {
	const expected = options.expected ?? buildCossistantOpenApiDocument();
	const allow = options.allow ?? [];
	const violations: CompatibilityViolation[] = [];

	const expectedOps = operations(expected as AnyDocument);
	const actualOps = operations(actual);

	const add = (operation: string, field: string, detail: string) => {
		if (!isAllowed(allow, operation, field)) {
			violations.push({ operation, field, detail });
		}
	};

	for (const [key, expectedOp] of expectedOps) {
		const actualOp = actualOps.get(key);
		if (!actualOp) {
			add(key, "*", "operation is missing");
			continue;
		}

		if (expectedOp.operationId !== actualOp.operationId) {
			add(
				key,
				"operationId",
				`expected "${expectedOp.operationId}", got "${actualOp.operationId}"`
			);
		}

		const expectedParams = parameterKeys(expectedOp).join(", ");
		const actualParams = parameterKeys(actualOp).join(", ");
		if (expectedParams !== actualParams) {
			add(
				key,
				"parameters",
				`expected [${expectedParams}], got [${actualParams}]`
			);
		}

		const expectedSecurity = securityKeys(expectedOp).join(", ");
		const actualSecurity = securityKeys(actualOp).join(", ");
		if (expectedSecurity !== actualSecurity) {
			add(
				key,
				"security",
				`expected [${expectedSecurity}], got [${actualSecurity}]`
			);
		}

		const expectedBody = Object.keys(
			expectedOp.requestBody?.content ?? {}
		).sort();
		const actualBody = Object.keys(actualOp.requestBody?.content ?? {}).sort();
		if (expectedBody.join(",") !== actualBody.join(",")) {
			add(
				key,
				"requestBody",
				`expected media types [${expectedBody}], got [${actualBody}]`
			);
		}

		for (const [status, expectedResponse] of Object.entries(
			expectedOp.responses ?? {}
		)) {
			const actualResponse = actualOp.responses?.[status];
			if (!actualResponse) {
				add(key, `responses.${status}`, "status code is missing");
				continue;
			}
			const expectedMedia = Object.keys(expectedResponse.content ?? {}).sort();
			const actualMedia = Object.keys(actualResponse.content ?? {}).sort();
			if (expectedMedia.join(",") !== actualMedia.join(",")) {
				add(
					key,
					`responses.${status}`,
					`expected media types [${expectedMedia}], got [${actualMedia}]`
				);
			}
			if (
				JSON.stringify(expectedResponse.content) !==
				JSON.stringify(actualResponse.content)
			) {
				add(key, `responses.${status}.schema`, "response schema differs");
			}
		}
	}

	// The /ws handshake and security schemes are protocol-level guarantees.
	if (!actualOps.has("GET /ws")) {
		add("GET /ws", "*", "WebSocket handshake is not documented");
	}

	const expectedSchemes = Object.keys(
		(expected as AnyDocument).components?.securitySchemes ?? {}
	).sort();
	const actualSchemes = Object.keys(
		actual.components?.securitySchemes ?? {}
	).sort();
	if (expectedSchemes.join(",") !== actualSchemes.join(",")) {
		add(
			"components",
			"securitySchemes",
			`expected [${expectedSchemes}], got [${actualSchemes}]`
		);
	}

	return violations;
}

/**
 * Throwing variant for use directly in a test.
 */
export function assertCossistantProtocolCompatibility(
	actual: AnyDocument,
	options: CompatibilityOptions = {}
): void {
	const violations = checkCossistantProtocolCompatibility(actual, options);
	if (violations.length === 0) {
		return;
	}

	const detail = violations
		.map((v) => `  - ${v.operation} [${v.field}]: ${v.detail}`)
		.join("\n");

	throw new Error(
		`Document is not compatible with the Cossistant protocol (${violations.length} violation${
			violations.length === 1 ? "" : "s"
		}):\n${detail}`
	);
}
