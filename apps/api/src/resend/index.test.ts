import { describe, expect, it } from "bun:test";
import { resendRouters } from "./index";

describe("resend routers", () => {
	it("exports the legacy resend router", () => {
		expect(resendRouters).toBeDefined();
	});
});
