import { describe, expect, it } from "bun:test";
import { LazySupport, loadSupport, preloadSupport } from "./lazy-support";

describe("lazy Support entry", () => {
	it("shares one module request between loading and preloading", async () => {
		const loadPromise = loadSupport();

		expect(preloadSupport()).toBe(loadPromise);
		expect(LazySupport).toBeDefined();

		const supportModule = await loadPromise;
		expect(supportModule.Support).toBeDefined();
	});
});
