import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	openApiSecuritySchemes,
	PRIVATE_API_KEY_SECURITY_SCHEME,
	PUBLIC_API_KEY_SECURITY_SCHEME,
} from "./openapi";

const routersDir = path.resolve(import.meta.dir, "routers");
const apiIndexPath = path.resolve(import.meta.dir, "../index.ts");

describe("REST OpenAPI contract guards", () => {
	it("defines the shared public and private security schemes", () => {
		expect(openApiSecuritySchemes).toHaveProperty(
			PRIVATE_API_KEY_SECURITY_SCHEME
		);
		expect(openApiSecuritySchemes).toHaveProperty(
			PUBLIC_API_KEY_SECURITY_SCHEME
		);
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
		}
	});

	it("uses shared security schemes in the OpenAPI root document and no global bearerAuth", () => {
		const content = readFileSync(apiIndexPath, "utf8");

		expect(content).toContain("securitySchemes: openApiSecuritySchemes");
		expect(content).not.toContain("bearerAuth");
	});
});
