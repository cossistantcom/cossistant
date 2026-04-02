import { describe, expect, it } from "bun:test";
import type { Mention } from "@plasma/tiny-markdown";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useMentionSearch } from "./use-mention-search";

describe("useMentionSearch", () => {
	it("passes through AI agent image to mention avatar", () => {
		let search: (query: string) => Mention[] = () => [];

		function Harness() {
			search = useMentionSearch({
				aiAgent: {
					id: "ai-1",
					name: "Support AI",
					isActive: true,
					image: "https://example.com/agent.png",
				},
			}).search;

			return null;
		}

		renderToStaticMarkup(React.createElement(Harness));
		const results = search("support");

		expect(results).toHaveLength(1);
		expect(results[0]?.type).toBe("ai-agent");
		expect(results[0]?.avatar).toBe("https://example.com/agent.png");
	});

	it("includes tool entities and matches on description", () => {
		let search: (query: string) => Mention[] = () => [];

		function Harness() {
			search = useMentionSearch({
				tools: [
					{
						id: "searchKnowledgeBase",
						name: "Search Knowledge Base",
						description: "Looks up facts in the trained knowledge base.",
					},
				],
			}).search;

			return null;
		}

		renderToStaticMarkup(React.createElement(Harness));
		const results = search("trained knowledge");

		expect(results).toHaveLength(1);
		expect(results[0]?.id).toBe("searchKnowledgeBase");
		expect(results[0]?.type).toBe("tool");
	});

	it("keeps nameless team members searchable when given the Team member fallback", () => {
		let search: (query: string) => Mention[] = () => [];

		function Harness() {
			search = useMentionSearch({
				teamMembers: [
					{
						id: "user-1",
						name: "Team member",
						email: "nameless@example.com",
						image: null,
					},
				],
			}).search;

			return null;
		}

		renderToStaticMarkup(React.createElement(Harness));

		expect(search("team")).toEqual([
			{
				id: "user-1",
				name: "Team member",
				type: "human-agent",
				avatar: undefined,
			},
		]);
		expect(search("nameless@example.com")).toHaveLength(1);
	});
});
