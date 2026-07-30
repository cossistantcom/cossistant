import { describe, expect, it } from "bun:test";

// getSiteUrl() only falls back to localhost when NODE_ENV is "development",
// which bun test does not set. Pin the origin so these assertions do not depend
// on the ambient environment.
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

import { getAllBlogTags, getIndexableBlogTags } from "@/lib/seo-content";
import sitemap from "./sitemap";

describe("lander-docs sitemap", () => {
	it("includes current indexable tag pages and excludes non-indexable plus utility pages", async () => {
		const entries = await sitemap();
		const urls = entries.map((entry) => entry.url);
		const indexableTags = getIndexableBlogTags();
		const nonIndexableTags = getAllBlogTags().filter(
			(tag) => !indexableTags.includes(tag)
		);

		expect(urls).toContain("http://localhost:3000/");
		expect(urls).toContain("http://localhost:3000/blog");
		expect(urls).toContain("http://localhost:3000/docs");
		expect(urls).toContain("http://localhost:3000/open-source-program");
		expect(urls).toContain("http://localhost:3000/docs/others/contributors");
		expect(urls).toContain("http://localhost:3000/blog/introducing-cossistant");
		expect(urls).not.toContain(
			"http://localhost:3000/open-source-program/apply"
		);
		for (const tag of indexableTags) {
			expect(urls).toContain(
				`http://localhost:3000/blog/tag/${encodeURIComponent(tag)}`
			);
		}
		for (const tag of nonIndexableTags) {
			expect(urls).not.toContain(
				`http://localhost:3000/blog/tag/${encodeURIComponent(tag)}`
			);
		}
		expect(urls).not.toContain("http://localhost:3000/login");
		expect(urls).not.toContain("http://localhost:3000/sign-up");
		expect(urls).not.toContain("http://localhost:3000/changelog/page/2");
		expect(urls).not.toContain(
			"http://localhost:3000/docs/openapi/v1/conversations/conversationid/get"
		);
	});
});
