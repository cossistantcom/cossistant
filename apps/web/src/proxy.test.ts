import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { NextFetchEvent } from "next/server";
import { NextRequest } from "next/server";
import { DATAFAST_DOMAIN, DATAFAST_WEBSITE_ID } from "@/lib/datafast";

const trackAICrawlerRequest = mock(() => ({ tracked: false }));

mock.module("@datafast/ai-crawl", () => ({
	trackAICrawlerRequest,
}));

const originalDatafastEnabled = process.env.NEXT_PUBLIC_DATAFAST_ENABLED;

function createRequest(pathname: string, headers?: HeadersInit) {
	return new NextRequest(new URL(pathname, "https://cossistant.com"), {
		headers,
	});
}

function createEvent(): NextFetchEvent {
	return {
		waitUntil: mock(() => {}),
	} as unknown as NextFetchEvent;
}

describe("proxy", () => {
	beforeEach(() => {
		process.env.NEXT_PUBLIC_DATAFAST_ENABLED = undefined;
		trackAICrawlerRequest.mockClear();
	});

	afterEach(() => {
		if (originalDatafastEnabled === undefined) {
			process.env.NEXT_PUBLIC_DATAFAST_ENABLED = undefined;
			return;
		}

		process.env.NEXT_PUBLIC_DATAFAST_ENABLED = originalDatafastEnabled;
	});

	it("tracks DataFast bot traffic when enabled", async () => {
		process.env.NEXT_PUBLIC_DATAFAST_ENABLED = "true";
		const { default: proxy } = await import(`./proxy?${Math.random()}`);
		const request = createRequest("/docs");
		const event = createEvent();

		proxy(request, event);

		expect(trackAICrawlerRequest).toHaveBeenCalledTimes(1);
		expect(trackAICrawlerRequest).toHaveBeenCalledWith(request, event, {
			domain: DATAFAST_DOMAIN,
			websiteId: DATAFAST_WEBSITE_ID,
		});
	});

	it("does not track DataFast bot traffic when disabled", async () => {
		process.env.NEXT_PUBLIC_DATAFAST_ENABLED = "false";
		const { default: proxy } = await import(`./proxy?${Math.random()}`);

		proxy(createRequest("/docs"), createEvent());

		expect(trackAICrawlerRequest).not.toHaveBeenCalled();
	});

	it.each([
		["/docs/get-started", "/llms.mdx/docs/get-started"],
		["/blog/product-update", "/llms.mdx/blog/product-update"],
		["/changelog/v1", "/llms.mdx/changelog/v1"],
	])("rewrites markdown-preferred %s requests", async (pathname, target) => {
		const { default: proxy } = await import(`./proxy?${Math.random()}`);

		const response = proxy(
			createRequest(pathname, { accept: "text/markdown" }),
			createEvent()
		);

		expect(response.headers.get("x-middleware-rewrite")).toBe(
			`https://cossistant.com${target}`
		);
	});

	it("continues normal requests", async () => {
		const { default: proxy } = await import(`./proxy?${Math.random()}`);

		const response = proxy(createRequest("/pricing"), createEvent());

		expect(response.headers.get("x-middleware-next")).toBe("1");
	});
});
