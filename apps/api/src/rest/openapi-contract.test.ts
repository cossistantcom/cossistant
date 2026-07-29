import { describe, expect, it, mock } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { identifyContactRequestSchema } from "@cossistant/types/api/contact";
import {
	createConversationRequestSchema,
	getConversationResponseSchema,
} from "@cossistant/types/api/conversation";
import { sendTimelineItemRequestSchema } from "@cossistant/types/api/timeline-item";
import { OpenAPIHono } from "@hono/zod-openapi";
import {
	actorUserIdHeader,
	openApiSecuritySchemes,
	PRIVATE_API_KEY_SECURITY_SCHEME,
	PUBLIC_API_KEY_SECURITY_SCHEME,
} from "./openapi";

mock.module("@api/realtime/emitter", () => ({
	realtime: {
		emit: mock(async () => {}),
	},
}));

// Mocked because importing the real module constructs an S3Client at load time.
// Every export must be listed: mock.module replaces the module wholesale, so an
// omitted symbol becomes "Export named 'x' not found" for any importer.
mock.module("@api/services/upload", () => ({
	s3Client: {},
	deleteConversationFiles: mock(async () => 0),
	deleteContactFiles: mock(async () => 0),
	deleteOrganizationFiles: mock(async () => 0),
	deleteVisitorFiles: mock(async () => 0),
	deleteWebsiteFiles: mock(async () => 0),
	getWebsiteUsageBytes: mock(async () => 0),
	generateUploadUrl: mock(async () => ({
		uploadUrl: "https://example.com/upload",
		key: "uploads/example.txt",
		bucket: "test-bucket",
		expiresAt: "2026-04-11T00:00:00.000Z",
		contentType: "text/plain",
		publicUrl: "https://cdn.example.com/uploads/example.txt",
	})),
}));

mock.module("./middleware", () => ({
	protectedPublicApiKeyMiddleware: [],
	protectedPrivateApiKeyMiddleware: [],
}));

const routersModulePromise = import("./routers");
const openApiDocumentModulePromise = import("./openapi-document");

const routersDir = path.resolve(import.meta.dir, "routers");

type OpenAPIMetadataValueType = {
	type?: string;
};

type OpenAPIMetadataSchema = {
	type?: string | string[];
	description?: string;
	example?: Record<string, string | number>;
	additionalProperties?: {
		anyOf?: OpenAPIMetadataValueType[];
	};
};

type OpenAPISchemaWithProperties = {
	type?: string | string[];
	description?: string;
	properties?: Record<
		string,
		OpenAPIMetadataSchema | OpenAPISchemaWithProperties
	>;
	items?: OpenAPISchemaWithProperties;
	required?: string[];
};

type OpenAPIJsonContent = {
	content?: {
		"application/json"?: {
			schema?: OpenAPISchemaWithProperties;
		};
	};
};

type OpenAPIPathRecord = Record<
	string,
	Record<string, Record<string, unknown>>
>;

const OPENAPI_HTTP_METHODS = new Set([
	"delete",
	"get",
	"head",
	"options",
	"patch",
	"post",
	"put",
	"trace",
]);

describe("REST OpenAPI contract guards", () => {
	it("defines the shared public and private security schemes", () => {
		expect(openApiSecuritySchemes).toHaveProperty(
			PRIVATE_API_KEY_SECURITY_SCHEME
		);
		expect(openApiSecuritySchemes).toHaveProperty(
			PUBLIC_API_KEY_SECURITY_SCHEME
		);
		expect(actorUserIdHeader.name).toBe("X-Actor-User-Id");
	});

	it("does not allow raw auth scheme names or duplicated auth header definitions in REST routers", () => {
		const routerFiles = readdirSync(routersDir)
			.filter((entry) => entry.endsWith(".ts"))
			.filter((entry) => !entry.endsWith(".test.ts"));

		for (const file of routerFiles) {
			const content = readFileSync(path.join(routersDir, file), "utf8");

			expect(content).not.toContain('"Public API Key"');
			expect(content).not.toContain('"Private API Key"');
			expect(content).not.toContain('name: "Authorization"');
			expect(content).not.toContain('name: "X-Public-Key"');
			expect(content).not.toContain('name: "Origin"');
			expect(content).not.toContain('name: "X-Visitor-Id"');
			expect(content).not.toContain('name: "X-Actor-User-Id"');
		}
	});

	it("builds a canonical served OpenAPI document", async () => {
		const { buildOpenApiDocument } = await openApiDocumentModulePromise;
		const doc = buildOpenApiDocument();
		const paths = doc.paths as unknown as OpenAPIPathRecord;
		const pathKeys = Object.keys(paths);

		expect(doc.servers).toEqual([
			{
				url: "https://api.cossistant.com/v1",
			},
		]);
		expect(doc.components?.securitySchemes).toEqual(openApiSecuritySchemes);
		expect(pathKeys.every((apiPath) => !apiPath.includes(":"))).toBe(true);
		expect(pathKeys.every((apiPath) => !apiPath.startsWith("/v1"))).toBe(true);
		expect(pathKeys).toContain("/ws");
		expect(paths["/feedback/summary"]?.get).toBeDefined();
		expect(paths["/conversations/{conversationId}/context"]?.get).toBeDefined();
		expect(paths["/knowledge/search"]?.get).toBeDefined();
		expect(paths["/messages"]?.post).toBeDefined();
		expect(paths["/visitors/{id}/block"]?.post).toBeDefined();
		expect(paths["/visitors/{id}/unblock"]?.post).toBeDefined();
	});

	it("serves the canonical OpenAPI document at /openapi", async () => {
		const { app } = await import("../index");
		const response = await app.request("/openapi");
		const doc = (await response.json()) as {
			paths?: Record<string, unknown>;
			servers?: Array<{ url: string }>;
		};

		expect(response.status).toBe(200);
		expect(doc.servers?.[0]?.url).toBe("https://api.cossistant.com/v1");
		expect(doc.paths).toHaveProperty("/ws");
		expect(doc.paths).toHaveProperty("/feedback/summary");
		expect(doc.paths).toHaveProperty("/conversations/{conversationId}/context");
	});

	it("has complete and unique operation IDs in the served OpenAPI document", async () => {
		const { buildOpenApiDocument } = await openApiDocumentModulePromise;
		const doc = buildOpenApiDocument();
		const operationIds: string[] = [];

		for (const pathItem of Object.values(
			doc.paths as unknown as OpenAPIPathRecord
		)) {
			if (!pathItem || typeof pathItem !== "object") {
				continue;
			}

			for (const [method, operation] of Object.entries(pathItem)) {
				if (
					!(OPENAPI_HTTP_METHODS.has(method) && operation) ||
					typeof operation !== "object"
				) {
					continue;
				}

				const operationId = (operation as { operationId?: unknown })
					.operationId;
				expect(typeof operationId).toBe("string");
				expect(operationId).not.toBe("");
				operationIds.push(operationId as string);
			}
		}

		expect(operationIds.length).toBeGreaterThan(0);
		expect(new Set(operationIds).size).toBe(operationIds.length);
	});

	it("defines every referenced security scheme in the served OpenAPI document", async () => {
		const { buildOpenApiDocument } = await openApiDocumentModulePromise;
		const doc = buildOpenApiDocument();
		const definedSchemes = new Set(
			Object.keys(doc.components?.securitySchemes ?? {})
		);

		for (const pathItem of Object.values(
			doc.paths as unknown as OpenAPIPathRecord
		)) {
			if (!pathItem || typeof pathItem !== "object") {
				continue;
			}

			for (const [method, operation] of Object.entries(pathItem)) {
				if (
					!(OPENAPI_HTTP_METHODS.has(method) && operation) ||
					typeof operation !== "object" ||
					!("security" in operation)
				) {
					continue;
				}

				const security = operation.security as unknown as Record<
					string,
					string[] | undefined
				>[];
				for (const requirement of security ?? []) {
					for (const schemeName of Object.keys(requirement)) {
						expect(definedSchemes.has(schemeName)).toBe(true);
					}
				}
			}
		}
	});

	it("documents the websocket handshake in the served OpenAPI document", async () => {
		const { buildOpenApiDocument } = await openApiDocumentModulePromise;
		const doc = buildOpenApiDocument();
		const paths = doc.paths as unknown as OpenAPIPathRecord;
		const websocketOperation = paths["/ws"]?.get as
			| {
					operationId?: unknown;
					parameters?: Array<{ name?: string }>;
					security?: unknown;
					servers?: unknown;
			  }
			| undefined;
		const parameterNames =
			websocketOperation?.parameters?.map((parameter) =>
				"name" in parameter ? parameter.name : null
			) ?? [];

		expect(websocketOperation).toBeDefined();
		expect(websocketOperation?.operationId).toBe("connectRealtime");
		expect(websocketOperation?.servers).toEqual([
			{
				url: "wss://api.cossistant.com",
			},
		]);
		expect(websocketOperation?.security).toEqual([
			{ [PUBLIC_API_KEY_SECURITY_SCHEME]: [] },
			{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] },
		]);
		expect(parameterNames).toContain("token");
		expect(parameterNames).toContain("X-Actor-User-Id");
	});

	it("documents private AI agent routes with shared security and stable response shapes", async () => {
		const { routers } = await routersModulePromise;
		const doc = routers.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "REST router contract test",
				version: "1.0.0",
			},
		});

		const getAgentPath = doc.paths?.["/ai-agents/{id}"]?.get;
		const getTrainingPath = doc.paths?.["/ai-agents/{id}/training"]?.get;
		const startTrainingPath = doc.paths?.["/ai-agents/{id}/training"]?.post;
		const getTrainingResponse = getTrainingPath?.responses?.["200"] as
			| OpenAPIJsonContent
			| undefined;
		const startTrainingResponse = startTrainingPath?.responses?.["202"] as
			| OpenAPIJsonContent
			| undefined;
		const getTrainingSchema = getTrainingResponse?.content?.["application/json"]
			?.schema as OpenAPISchemaWithProperties | undefined;
		const startTrainingSchema = startTrainingResponse?.content?.[
			"application/json"
		]?.schema as OpenAPISchemaWithProperties | undefined;
		const startTrainingParameterNames =
			startTrainingPath?.parameters?.map((parameter) =>
				"name" in parameter ? parameter.name : null
			) ?? [];

		expect(getAgentPath).toBeDefined();
		expect(getTrainingPath).toBeDefined();
		expect(startTrainingPath).toBeDefined();
		expect(getAgentPath?.security).toEqual([
			{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] },
		]);
		expect(getTrainingPath?.security).toEqual([
			{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] },
		]);
		expect(startTrainingPath?.security).toEqual([
			{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] },
		]);
		expect(startTrainingParameterNames).toContain("Authorization");
		expect(startTrainingParameterNames).toContain("X-Actor-User-Id");
		expect(getTrainingSchema?.properties).toHaveProperty("status");
		expect(getTrainingSchema?.properties).toHaveProperty("internalStatus");
		expect(getTrainingSchema?.properties).toHaveProperty("updatedSourcesCount");
		expect(startTrainingSchema?.properties).toHaveProperty("jobId");
		expect(startTrainingSchema?.properties).toHaveProperty("status");
		expect(startTrainingPath?.responses).toHaveProperty("400");
		expect(startTrainingPath?.responses).toHaveProperty("409");
		expect(startTrainingPath?.responses).toHaveProperty("429");
	});

	it("documents the private inbox route as actor-aware", async () => {
		const { routers } = await routersModulePromise;
		const doc = routers.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "REST router contract test",
				version: "1.0.0",
			},
		});

		const inboxPath = doc.paths?.["/conversations/inbox"]?.get;
		const inboxParameterNames =
			inboxPath?.parameters?.map((parameter) =>
				"name" in parameter ? parameter.name : null
			) ?? [];

		expect(inboxPath).toBeDefined();
		expect(inboxPath?.security).toEqual([
			{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] },
		]);
		expect(inboxParameterNames).toContain("Authorization");
		expect(inboxParameterNames).toContain("X-Actor-User-Id");
		expect(inboxPath?.responses).toHaveProperty("200");
		expect(inboxPath?.responses).toHaveProperty("401");
		expect(inboxPath?.responses).toHaveProperty("403");
	});

	it("documents private priority and sentiment mutation routes as actor-aware", async () => {
		const { routers } = await routersModulePromise;
		const doc = routers.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "REST router contract test",
				version: "1.0.0",
			},
		});

		const priorityPath =
			doc.paths?.["/conversations/{conversationId}/priority"]?.patch;
		const sentimentPath =
			doc.paths?.["/conversations/{conversationId}/sentiment"]?.patch;
		const priorityParameterNames =
			priorityPath?.parameters?.map((parameter) =>
				"name" in parameter ? parameter.name : null
			) ?? [];
		const sentimentParameterNames =
			sentimentPath?.parameters?.map((parameter) =>
				"name" in parameter ? parameter.name : null
			) ?? [];
		const priorityRequest = priorityPath?.requestBody as
			| OpenAPIJsonContent
			| undefined;
		const sentimentRequest = sentimentPath?.requestBody as
			| OpenAPIJsonContent
			| undefined;

		expect(priorityPath).toBeDefined();
		expect(sentimentPath).toBeDefined();
		expect(priorityPath?.security).toEqual([
			{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] },
		]);
		expect(sentimentPath?.security).toEqual([
			{ [PRIVATE_API_KEY_SECURITY_SCHEME]: [] },
		]);
		expect(priorityParameterNames).toContain("Authorization");
		expect(priorityParameterNames).toContain("X-Actor-User-Id");
		expect(sentimentParameterNames).toContain("Authorization");
		expect(sentimentParameterNames).toContain("X-Actor-User-Id");
		expect(
			priorityRequest?.content?.["application/json"]?.schema?.properties
		).toHaveProperty("priority");
		expect(
			sentimentRequest?.content?.["application/json"]?.schema?.properties
		).toHaveProperty("sentiment");
		expect(priorityPath?.responses).toHaveProperty("200");
		expect(sentimentPath?.responses).toHaveProperty("200");
	});

	it("documents public conversation metadata on create requests and conversation reads", () => {
		const app = new OpenAPIHono();

		app.openapi(
			{
				method: "post",
				path: "/conversations",
				request: {
					body: {
						required: true,
						content: {
							"application/json": {
								schema: createConversationRequestSchema,
							},
						},
					},
				},
				responses: {
					200: {
						description: "Conversation created",
						content: {
							"application/json": {
								schema: getConversationResponseSchema,
							},
						},
					},
				},
			},
			(() => new Response(null)) as never
		);

		const doc = app.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "OpenAPI metadata contract test",
				version: "1.0.0",
			},
		});

		const postPath = doc.paths?.["/conversations"]?.post;
		const requestBody = postPath?.requestBody as OpenAPIJsonContent | undefined;
		const successResponse = postPath?.responses?.["200"] as
			| OpenAPIJsonContent
			| undefined;
		const requestMetadata = requestBody?.content?.["application/json"]?.schema
			?.properties?.metadata as OpenAPIMetadataSchema | undefined;
		const responseConversation = successResponse?.content?.["application/json"]
			?.schema?.properties?.conversation as
			| OpenAPISchemaWithProperties
			| undefined;
		const responseMetadata = responseConversation?.properties?.metadata as
			| OpenAPIMetadataSchema
			| undefined;

		expect(requestMetadata).toMatchObject({
			type: "object",
			description:
				"Public conversation metadata stored as flat key-value pairs.",
			example: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});
		expect(responseMetadata).toMatchObject({
			type: ["object", "null"],
			description:
				"Public conversation metadata stored as flat key-value pairs.",
			example: {
				orderId: "ord_123",
				priority: "vip",
				mrr: 299,
			},
		});

		const requestValueTypes = [
			...new Set(
				(
					requestMetadata?.additionalProperties as
						| { anyOf?: Array<{ type?: string }> }
						| undefined
				)?.anyOf?.map((entry) => entry.type)
			),
		].sort();
		const responseValueTypes = [
			...new Set(
				(
					responseMetadata?.additionalProperties as
						| { anyOf?: Array<{ type?: string }> }
						| undefined
				)?.anyOf?.map((entry) => entry.type)
			),
		].sort();

		expect(requestValueTypes).toEqual(["boolean", "null", "number", "string"]);
		expect(responseValueTypes).toEqual(["boolean", "null", "number", "string"]);
	});

	it("documents client timeline item inputs and createdAt rules for conversation bootstrap and message sends", () => {
		const app = new OpenAPIHono();

		app.openapi(
			{
				method: "post",
				path: "/conversations",
				request: {
					body: {
						required: true,
						content: {
							"application/json": {
								schema: createConversationRequestSchema,
							},
						},
					},
				},
				responses: {
					200: {
						description: "Conversation created",
					},
				},
			},
			(() => new Response(null)) as never
		);

		app.openapi(
			{
				method: "post",
				path: "/messages",
				request: {
					body: {
						required: true,
						content: {
							"application/json": {
								schema: sendTimelineItemRequestSchema,
							},
						},
					},
				},
				responses: {
					200: {
						description: "Timeline item created",
					},
				},
			},
			(() => new Response(null)) as never
		);

		const doc = app.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "OpenAPI timeline input contract test",
				version: "1.0.0",
			},
		});

		const createPath = doc.paths?.["/conversations"]?.post;
		const createRequestBody = createPath?.requestBody as
			| OpenAPIJsonContent
			| undefined;
		const createRequestSchema = createRequestBody?.content?.["application/json"]
			?.schema as OpenAPISchemaWithProperties | undefined;
		const defaultTimelineItemsSchema = createRequestSchema?.properties
			?.defaultTimelineItems as OpenAPISchemaWithProperties | undefined;
		const defaultTimelineItemInput = defaultTimelineItemsSchema?.items;
		const createCreatedAtSchema = defaultTimelineItemInput?.properties
			?.createdAt as OpenAPIMetadataSchema | undefined;

		const messagesPath = doc.paths?.["/messages"]?.post;
		const messagesRequestBody = messagesPath?.requestBody as
			| OpenAPIJsonContent
			| undefined;
		const messagesRequestSchema = messagesRequestBody?.content?.[
			"application/json"
		]?.schema as OpenAPISchemaWithProperties | undefined;
		const messageItemInput = messagesRequestSchema?.properties?.item as
			| OpenAPISchemaWithProperties
			| undefined;
		const messageCreatedAtSchema = messageItemInput?.properties?.createdAt as
			| OpenAPIMetadataSchema
			| undefined;

		expect(defaultTimelineItemInput?.properties).not.toHaveProperty(
			"conversationId"
		);
		expect(defaultTimelineItemInput?.properties).not.toHaveProperty(
			"organizationId"
		);
		expect(defaultTimelineItemInput?.properties).not.toHaveProperty(
			"deletedAt"
		);
		expect(defaultTimelineItemInput?.required ?? []).not.toContain(
			"conversationId"
		);
		expect(defaultTimelineItemInput?.required ?? []).not.toContain(
			"organizationId"
		);
		expect(defaultTimelineItemInput?.required ?? []).not.toContain("deletedAt");
		expect(createCreatedAtSchema?.description).toContain(
			"server assigns the timestamp"
		);
		expect(createCreatedAtSchema?.description).toContain(
			"Historical timestamps are allowed"
		);
		expect(createCreatedAtSchema?.description).toContain(
			"more than 5 minutes in the future are rejected"
		);

		expect(messageItemInput?.properties).not.toHaveProperty("conversationId");
		expect(messageItemInput?.properties).not.toHaveProperty("organizationId");
		expect(messageItemInput?.properties).not.toHaveProperty("deletedAt");
		expect(messageCreatedAtSchema?.description).toContain(
			"server assigns the timestamp"
		);
		expect(messageCreatedAtSchema?.description).toContain(
			"Historical timestamps are allowed"
		);
		expect(messageCreatedAtSchema?.description).toContain(
			"more than 5 minutes in the future are rejected"
		);
	});

	it("documents contact identify visitorId precedence between body and X-Visitor-Id", () => {
		const app = new OpenAPIHono();

		app.openapi(
			{
				method: "post",
				path: "/contacts/identify",
				request: {
					body: {
						required: true,
						content: {
							"application/json": {
								schema: identifyContactRequestSchema,
							},
						},
					},
				},
				responses: {
					200: {
						description: "Contact identified",
					},
				},
			},
			(() => new Response(null)) as never
		);

		const doc = app.getOpenAPI31Document({
			openapi: "3.1.0",
			info: {
				title: "OpenAPI metadata contract test",
				version: "1.0.0",
			},
		});

		const postPath = doc.paths?.["/contacts/identify"]?.post;
		const requestBody = postPath?.requestBody as OpenAPIJsonContent | undefined;
		const requestSchema = requestBody?.content?.["application/json"]?.schema as
			| OpenAPISchemaWithProperties
			| undefined;
		const visitorIdSchema = requestSchema?.properties?.visitorId as
			| OpenAPIMetadataSchema
			| undefined;

		expect(requestSchema?.required ?? []).not.toContain("visitorId");
		expect(visitorIdSchema?.description).toContain("X-Visitor-Id");
		expect(visitorIdSchema?.description).toContain("body value wins");
	});
});
