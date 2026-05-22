import { beforeEach, describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToReadableStream } from "react-dom/server";

const getTweetMock = mock(async (_id: string) => tweetResponse);

mock.module("react-tweet/api", () => ({
	getTweet: getTweetMock,
}));

const modulePromise = import("./x-embed");

let tweetResponse: unknown;

async function renderWithSuspense(element: React.ReactNode) {
	const stream = await renderToReadableStream(
		<React.Suspense fallback={<div>Loading...</div>}>{element}</React.Suspense>
	);
	await stream.allReady;
	return await new Response(stream).text();
}

function createTweet() {
	return {
		id_str: "2011721894333202601",
		text: "Code is not the value. Service is.",
		display_text_range: [0, 34],
		entities: {
			hashtags: [],
			urls: [],
			user_mentions: [],
		},
		user: {
			name: "Anthony Riera",
			screen_name: "_anthonyriera",
			profile_image_url_https: "https://pbs.twimg.com/profile_images/test.jpg",
		},
	};
}

describe("XEmbed", () => {
	beforeEach(() => {
		getTweetMock.mockClear();
		tweetResponse = createTweet();
	});

	it("renders tweet text when optional entity arrays are absent", async () => {
		const { XEmbed } = await modulePromise;

		const html = await renderWithSuspense(<XEmbed id="2011721894333202601" />);

		expect(html).toContain("Code is not the value. Service is.");
		expect(html).toContain(
			"https://x.com/_anthonyriera/status/2011721894333202601"
		);
	});

	it("falls back to a direct X link when the tweet cannot be fetched", async () => {
		const { XEmbed } = await modulePromise;
		getTweetMock.mockImplementationOnce(async () => {
			throw new Error("syndication unavailable");
		});

		const html = await renderWithSuspense(<XEmbed id="tweet-1" />);

		expect(html).toContain("View this post on X");
		expect(html).toContain("https://x.com/i/status/tweet-1");
	});
});
