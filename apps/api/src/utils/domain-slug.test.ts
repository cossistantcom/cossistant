import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Database } from "@api/db";
import { domainToSlug, generateUniqueWebsiteSlug } from "./domain-slug";

const findFirstMock = mock(
	(async () => null) as (...args: unknown[]) => Promise<unknown>
);

function createDb() {
	return {
		query: {
			website: {
				findFirst: findFirstMock,
			},
		},
	} as unknown as Database;
}

describe("domainToSlug", () => {
	it("drops .com for simple domains", () => {
		expect(domainToSlug("better-i18n.com")).toBe("better-i18n");
	});

	it("replaces the dot for other single-level TLDs", () => {
		expect(domainToSlug("docs.io")).toBe("docsdotio");
	});

	it("adds a random suffix for multi-dot domains", () => {
		const slug = domainToSlug("app.better-i18n.com");

		expect(slug).toStartWith("better-i18n-");
		expect(slug).toHaveLength("better-i18n-".length + 6);
	});
});

describe("generateUniqueWebsiteSlug", () => {
	beforeEach(() => {
		findFirstMock.mockReset();
	});

	it("returns the base slug when it is available", async () => {
		findFirstMock.mockResolvedValueOnce(null);

		const slug = await generateUniqueWebsiteSlug(createDb(), "better-i18n.com");

		expect(slug).toBe("better-i18n");
		expect(findFirstMock).toHaveBeenCalledTimes(1);
	});

	it("appends a suffix when the base slug is already taken", async () => {
		findFirstMock.mockResolvedValueOnce({ id: "01JG000000000000000000010" });
		findFirstMock.mockResolvedValueOnce(null);

		const slug = await generateUniqueWebsiteSlug(createDb(), "better-i18n.com");

		expect(slug).toStartWith("better-i18n-");
		expect(slug).not.toBe("better-i18n");
		expect(findFirstMock).toHaveBeenCalledTimes(2);
	});
});
