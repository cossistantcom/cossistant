import { describe, expect, it } from "bun:test";
import { openApiSecuritySchemes } from "./auth";
import {
	buildCossistantOpenApiDocument,
	getCossistantRouteDefinitions,
} from "./openapi";
import { REST_MOUNT_TABLE } from "./routes";
import {
	assertCossistantProtocolCompatibility,
	checkCossistantProtocolCompatibility,
} from "./testkit";

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

const EXPECTED_OPERATION_COUNT = 65;
const EXPECTED_REST_ROUTE_COUNT = 64;

type Doc = ReturnType<typeof buildCossistantOpenApiDocument>;

/**
 * Clone the document with one path omitted. Not `delete` (banned by lint), and
 * deliberately not `paths[key] = undefined` — that leaves an enumerable
 * undefined entry the checker would then try to read.
 */
function withoutPath(path: string) {
	const clone = JSON.parse(
		JSON.stringify(buildCossistantOpenApiDocument())
	) as { paths: Record<string, Record<string, unknown>> };
	const { [path]: _removed, ...rest } = clone.paths;
	clone.paths = rest;
	return clone;
}

function listOperations(doc: Doc) {
	const out: Array<{ key: string; operation: Record<string, unknown> }> = [];
	for (const [path, item] of Object.entries(doc.paths ?? {})) {
		for (const [method, operation] of Object.entries(
			item as Record<string, unknown>
		)) {
			if (HTTP_METHODS.has(method)) {
				out.push({
					key: `${method.toUpperCase()} ${path}`,
					operation: operation as Record<string, unknown>,
				});
			}
		}
	}
	return out;
}

describe("Cossistant protocol document", () => {
	it("emits exactly the expected number of operations", () => {
		expect(listOperations(buildCossistantOpenApiDocument())).toHaveLength(
			EXPECTED_OPERATION_COUNT
		);
	});

	it("owns every REST descriptor in the mount table", () => {
		expect(getCossistantRouteDefinitions()).toHaveLength(
			EXPECTED_REST_ROUTE_COUNT
		);
	});

	it("has unique, non-empty operation IDs", () => {
		const ids = listOperations(buildCossistantOpenApiDocument()).map(
			({ operation }) => operation.operationId as string | undefined
		);

		for (const id of ids) {
			expect(id).toBeTruthy();
		}
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("is deterministic across repeated builds", () => {
		expect(JSON.stringify(buildCossistantOpenApiDocument())).toBe(
			JSON.stringify(buildCossistantOpenApiDocument())
		);
	});

	it("takes server URLs as arguments rather than reading the environment", () => {
		const doc = buildCossistantOpenApiDocument({
			restServerUrl: "https://example.test/v9",
			websocketServerUrl: "wss://example.test",
		});

		expect(doc.servers?.[0]?.url).toBe("https://example.test/v9");
		const ws = doc.paths["/ws"] as { get: { servers: Array<{ url: string }> } };
		expect(ws.get.servers[0]?.url).toBe("wss://example.test");
	});

	it("documents the WebSocket handshake with dual security", () => {
		const ws = buildCossistantOpenApiDocument().paths["/ws"] as {
			get: { operationId: string; security: Record<string, unknown>[] };
		};

		expect(ws.get.operationId).toBe("connectRealtime");
		expect(ws.get.security.flatMap((s) => Object.keys(s)).sort()).toEqual([
			"PrivateApiKey",
			"PublicApiKey",
		]);
	});

	it("only references declared security schemes", () => {
		const declared = new Set(Object.keys(openApiSecuritySchemes));

		for (const { operation } of listOperations(
			buildCossistantOpenApiDocument()
		)) {
			const security = (operation.security ?? []) as Record<string, unknown>[];
			for (const entry of security) {
				for (const scheme of Object.keys(entry)) {
					expect(declared).toContain(scheme);
				}
			}
		}
	});

	it("strips auth headers that the security schemes already describe", () => {
		for (const { operation } of listOperations(
			buildCossistantOpenApiDocument()
		)) {
			const names = (
				(operation.parameters ?? []) as Array<{ name?: string }>
			).map((p) => p.name);
			expect(names).not.toContain("Authorization");
			expect(names).not.toContain("X-Public-Key");
		}
	});

	/**
	 * These three routes declare `conversationId` twice: once through the auth
	 * spread's explicit path parameter, and once derived from
	 * `request.params: getConversationRequestSchema`. OpenAPI forbids duplicate
	 * name+in pairs, so this is a defect — but it predates this package and is
	 * part of the currently published contract, so it is pinned rather than
	 * fixed. Removing a duplicate is a contract change and needs its own review.
	 */
	const KNOWN_DUPLICATE_PARAMETERS = new Set([
		"GET /conversations/{conversationId}",
		"GET /conversations/{conversationId}/context",
		"GET /conversations/{conversationId}/export",
	]);

	it("declares at most one parameter per name, outside the known exceptions", () => {
		const offenders: string[] = [];

		for (const { key, operation } of listOperations(
			buildCossistantOpenApiDocument()
		)) {
			const names = (
				(operation.parameters ?? []) as Array<{ name?: string }>
			).map((p) => p.name);
			if (names.length !== new Set(names).size) {
				offenders.push(key);
			}
		}

		expect(offenders.sort()).toEqual([...KNOWN_DUPLICATE_PARAMETERS].sort());
	});

	it("declares a path parameter for every templated path segment", () => {
		for (const { key, operation } of listOperations(
			buildCossistantOpenApiDocument()
		)) {
			const path = key.slice(key.indexOf(" ") + 1);
			const declared = new Set(
				((operation.parameters ?? []) as Array<{ name?: string; in?: string }>)
					.filter((p) => p.in === "path")
					.map((p) => p.name)
			);

			for (const match of path.matchAll(/\{([^}]+)\}/g)) {
				expect(`${key}:${match[1]}`).toBe(
					`${key}:${declared.has(match[1]) ? match[1] : "MISSING"}`
				);
			}
		}
	});

	it("guards against the mount table silently emptying", () => {
		expect(REST_MOUNT_TABLE.length).toBeGreaterThan(8);
	});
});

describe("compatibility testkit", () => {
	it("accepts the canonical document", () => {
		expect(() =>
			assertCossistantProtocolCompatibility(buildCossistantOpenApiDocument())
		).not.toThrow();
	});

	it("rejects a removed route", () => {
		const broken = withoutPath("/conversations/{conversationId}/resolve");

		const violations = checkCossistantProtocolCompatibility(broken);
		expect(violations).toContainEqual({
			operation: "POST /conversations/{conversationId}/resolve",
			field: "*",
			detail: "operation is missing",
		});
	});

	it("rejects a flipped required flag on a parameter", () => {
		const broken = JSON.parse(JSON.stringify(buildCossistantOpenApiDocument()));
		broken.paths["/organizations/{id}"].get.parameters[0].required = false;

		const violations = checkCossistantProtocolCompatibility(broken);
		expect(
			violations.some(
				(v) =>
					v.operation === "GET /organizations/{id}" && v.field === "parameters"
			)
		).toBe(true);
	});

	it("rejects a changed success schema", () => {
		const broken = JSON.parse(JSON.stringify(buildCossistantOpenApiDocument()));
		broken.paths["/organizations/{id}"].get.responses["200"].content[
			"application/json"
		].schema = { type: "string" };

		const violations = checkCossistantProtocolCompatibility(broken);
		expect(
			violations.some(
				(v) =>
					v.operation === "GET /organizations/{id}" &&
					v.field === "responses.200.schema"
			)
		).toBe(true);
	});

	it("rejects a missing WebSocket handshake", () => {
		const broken = withoutPath("/ws");

		const violations = checkCossistantProtocolCompatibility(broken);
		expect(violations.some((v) => v.operation === "GET /ws")).toBe(true);
	});

	it("honours an explicit allowlist entry", () => {
		const broken = withoutPath("/conversations/{conversationId}/resolve");

		const violations = checkCossistantProtocolCompatibility(broken, {
			allow: [
				{
					operation: "POST /conversations/{conversationId}/resolve",
					field: "*",
					reason: "Not implemented by this service yet.",
				},
			],
		});

		expect(violations).toHaveLength(0);
	});

	it("produces a readable error listing each violation", () => {
		const broken = withoutPath("/ws");

		expect(() => assertCossistantProtocolCompatibility(broken)).toThrow(
			/WebSocket handshake is not documented/
		);
	});
});
