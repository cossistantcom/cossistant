import { describe, expect, it } from "bun:test";
import { cleanReplyText, htmlToText } from "./clean-reply";

describe("cleanReplyText", () => {
	it("removes quoted reply chains", () => {
		expect(
			cleanReplyText("Hello team\n\nOn Tue, somebody wrote:\n> quoted")
		).toBe("Hello team");
	});

	it("removes signatures", () => {
		expect(cleanReplyText("Hello\n\n-- \nAnthony")).toBe("Hello");
	});
});

describe("htmlToText", () => {
	it("converts html to readable text", () => {
		expect(htmlToText("<p>Hello</p><p>World</p>")).toBe("Hello\n\nWorld");
	});
});
