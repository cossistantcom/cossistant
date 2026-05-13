import { describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const queryValues = new Map<string, string | null>();
const setterCalls: Array<{ key: string; value: string | null }> = [];

mock.module("nuqs", () => ({
	parseAsString: {},
	useQueryState: (key: string) => [
		queryValues.get(key) ?? null,
		(value: string | null) => {
			setterCalls.push({ key, value });
			queryValues.set(key, value);
			return Promise.resolve(new URLSearchParams());
		},
	],
}));

function resetQueryState() {
	queryValues.clear();
	setterCalls.length = 0;
}

async function renderHook(): Promise<{
	isOpen: boolean;
	openSupportOverlay: () => Promise<unknown>;
	closeSupportOverlay: () => Promise<unknown>;
}> {
	const { useSupportOverlayState } = await import(
		`./use-support-overlay-state?${Math.random()}`
	);
	let hookValue: {
		isOpen: boolean;
		openSupportOverlay: () => Promise<unknown>;
		closeSupportOverlay: () => Promise<unknown>;
	} | null = null;

	function Harness() {
		hookValue = useSupportOverlayState();
		return null;
	}

	renderToStaticMarkup(React.createElement(Harness));

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return hookValue;
}

describe("useSupportOverlayState", () => {
	it("reports closed when the support overlay query value is absent", async () => {
		resetQueryState();

		const hookValue = await renderHook();

		expect(hookValue.isOpen).toBe(false);
	});

	it("reports open when the support overlay query value is present", async () => {
		resetQueryState();
		queryValues.set("support", "open");

		const hookValue = await renderHook();

		expect(hookValue.isOpen).toBe(true);
	});

	it("opens the support overlay with the expected query value", async () => {
		resetQueryState();

		const hookValue = await renderHook();
		await hookValue.openSupportOverlay();

		expect(setterCalls).toEqual([{ key: "support", value: "open" }]);
	});

	it("closes the support overlay by clearing the query value", async () => {
		resetQueryState();
		queryValues.set("support", "open");

		const hookValue = await renderHook();
		await hookValue.closeSupportOverlay();

		expect(setterCalls).toEqual([{ key: "support", value: null }]);
	});
});
