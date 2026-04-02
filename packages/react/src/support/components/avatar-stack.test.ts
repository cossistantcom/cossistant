import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { AvailableAIAgent, AvailableHumanAgent } from "@plasma/types";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupportTextResolvedFormatter } from "../text/locales/keys";

function createTextFormatter(): SupportTextResolvedFormatter {
	return ((key: string) => {
		switch (key) {
			case "common.fallbacks.supportTeam":
				return "Support team";
			default:
				throw new Error(`Unexpected text key: ${key}`);
		}
	}) as SupportTextResolvedFormatter;
}

const useSupportTextMock = mock(() => createTextFormatter());

mock.module("../text", () => ({
	useSupportText: useSupportTextMock,
}));

mock.module("./avatar", () => ({
	Avatar: ({ name, facehashSeed }: { name: string; facehashSeed?: string }) =>
		React.createElement("div", {
			"data-avatar-name": name,
			"data-facehash-seed": facehashSeed ?? "",
		}),
}));

const avatarStackModulePromise = import("./avatar-stack");

describe("AvatarStack", () => {
	beforeEach(() => {
		useSupportTextMock.mockClear();
	});

	it("uses Support team and a stable facehash seed for nameless human agents", async () => {
		const { AvatarStack } = await avatarStackModulePromise;
		const humanAgents = [
			{
				id: "human-1",
				name: "   ",
				image: null,
				lastSeenAt: null,
			},
		] as AvailableHumanAgent[];

		const html = renderToStaticMarkup(
			React.createElement(AvatarStack, {
				humanAgents,
				aiAgents: [] as AvailableAIAgent[],
			})
		);

		expect(html).toContain('data-avatar-name="Support team"');
		expect(html).toContain('data-facehash-seed="public:human-1"');
	});
});
