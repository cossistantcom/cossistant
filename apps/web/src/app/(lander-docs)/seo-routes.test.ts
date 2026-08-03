import { describe, expect, it, mock } from "bun:test";

// getSiteUrl() only falls back to localhost when NODE_ENV is "development",
// which bun test does not set. Pin the origin so these assertions do not depend
// on the ambient environment.
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

mock.module("server-only", () => ({}));

const seoRoutesModulePromise = Promise.all([
	import("./blog/[slug]/page"),
	import("./blog/page"),
	import("./blog/tag/[tag]/page"),
	import("./changelog/page"),
	import("./docs/[[...slug]]/page"),
	import("./docs/openapi/[[...slug]]/route"),
	import("./llms.txt/route"),
	import("./llms-full.txt/route"),
	import("./login/page"),
	import("./open-source-program/apply/page"),
	import("./open-source-program/page"),
	import("./page"),
	import("./pricing/page"),
]);

describe("lander-docs seo routes", () => {
	it("sets dedicated homepage metadata", async () => {
		const [, , , , , , , , , , , homePageModule] = await seoRoutesModulePromise;
		const { metadata: homeMetadata } = homePageModule;

		expect(homeMetadata.alternates?.canonical).toBe("http://localhost:3000/");
		expect(homeMetadata.title).toBe(
			"AI agent customer support for your SaaS in under 10 lines of code"
		);
	});

	it("sets canonical pricing metadata", async () => {
		const [, , , , , , , , , , , , pricingPageModule] =
			await seoRoutesModulePromise;
		const { metadata: pricingMetadata } = pricingPageModule;

		expect(pricingMetadata.alternates?.canonical).toBe(
			"http://localhost:3000/pricing"
		);
	});

	it("sets canonical open source program metadata", async () => {
		const [, , , , , , , , , , openSourceProgramPageModule] =
			await seoRoutesModulePromise;
		const { metadata: openSourceProgramMetadata } = openSourceProgramPageModule;

		expect(openSourceProgramMetadata.alternates?.canonical).toBe(
			"http://localhost:3000/open-source-program"
		);
	});

	it("keeps the open source program apply page out of the index", async () => {
		const [, , , , , , , , , openSourceProgramApplyPageModule] =
			await seoRoutesModulePromise;
		const { metadata: openSourceProgramApplyMetadata } =
			openSourceProgramApplyPageModule;

		expect(openSourceProgramApplyMetadata.alternates?.canonical).toBe(
			"http://localhost:3000/open-source-program/apply"
		);
		expect(openSourceProgramApplyMetadata.robots).toMatchObject({
			index: false,
			follow: false,
		});
	});

	it("uses shared metadata for the blog index", async () => {
		const [, blogPageModule] = await seoRoutesModulePromise;
		const metadata = blogPageModule.generateMetadata();

		expect(metadata.alternates?.canonical).toBe("http://localhost:3000/blog");
		expect(metadata.openGraph && "type" in metadata.openGraph).toBe(true);
	});

	it("builds article metadata for blog posts", async () => {
		const [blogArticlePageModule] = await seoRoutesModulePromise;
		const metadata = await blogArticlePageModule.generateMetadata({
			params: Promise.resolve({ slug: "introducing-cossistant" }),
		});

		expect(metadata.alternates?.canonical).toBe(
			"http://localhost:3000/blog/introducing-cossistant"
		);
		expect(metadata.openGraph && "type" in metadata.openGraph).toBe(true);
	});

	it("keeps non-indexable tag pages out of the index", async () => {
		const [, , blogTagPageModule] = await seoRoutesModulePromise;
		const metadata = await blogTagPageModule.generateMetadata({
			params: Promise.resolve({ tag: "announcement" }),
		});

		expect(metadata.robots).toMatchObject({
			index: false,
			follow: true,
		});
	});

	it("builds docs page metadata with canonical and article og type", async () => {
		const [, , , , docsPageModule] = await seoRoutesModulePromise;
		const metadata = await docsPageModule.generateMetadata({
			params: Promise.resolve({ slug: ["quickstart"] }),
		});

		expect(metadata.alternates?.canonical).toBe(
			"http://localhost:3000/docs/quickstart"
		);
		expect(metadata.openGraph && "type" in metadata.openGraph).toBe(true);
	});

	it("builds changelog collection metadata", async () => {
		const [, , , changelogPageModule] = await seoRoutesModulePromise;
		const metadata = changelogPageModule.generateMetadata();

		expect(metadata.alternates?.canonical).toBe(
			"http://localhost:3000/changelog"
		);
	});

	it("marks auth routes as noindex", async () => {
		const [, , , , , , , , loginPageModule] = await seoRoutesModulePromise;
		const { metadata: loginMetadata } = loginPageModule;

		expect(loginMetadata.robots).toMatchObject({
			index: false,
			follow: false,
		});
	});

	it("redirects legacy openapi docs requests to the API docs", async () => {
		const [, , , , , legacyOpenApiRouteModule] = await seoRoutesModulePromise;
		const response = await legacyOpenApiRouteModule.GET();

		expect(response.status).toBe(308);
		expect(response.headers.get("location")).toBe(
			"https://api.cossistant.com/docs"
		);
		expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
	});

	it("marks machine-readable llms routes as noindex", async () => {
		const [, , , , , , llmsRouteModule, llmsFullRouteModule] =
			await seoRoutesModulePromise;
		const [llmsIndexResponse, llmsFullResponse] = await Promise.all([
			llmsRouteModule.GET(),
			llmsFullRouteModule.GET(),
		]);

		expect(llmsIndexResponse.headers.get("x-robots-tag")).toBe(
			"noindex, nofollow"
		);
		expect(llmsFullResponse.headers.get("x-robots-tag")).toBe(
			"noindex, nofollow"
		);
		expect(llmsIndexResponse.headers.get("content-type")).toContain(
			"text/plain"
		);
		expect(llmsFullResponse.headers.get("content-type")).toContain(
			"text/plain"
		);
	});
});
