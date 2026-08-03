import { describe, expect, it, mock } from "bun:test";
import type * as React from "react";
import {
	composeConversationTimelineScrollHandlers,
	isConversationTimelinePrepend,
	mergeConversationTimelineStyles,
} from "./conversation-timeline-internal";

describe("mergeConversationTimelineStyles", () => {
	it("retains consumer non-mask styles while adding mask styles", () => {
		const merged = mergeConversationTimelineStyles(
			{
				paddingBottom: "120px",
				scrollbarGutter: "stable",
			},
			{
				maskImage: "linear-gradient(black, transparent)",
				WebkitMaskImage: "linear-gradient(black, transparent)",
			}
		);

		expect(merged).toEqual({
			paddingBottom: "120px",
			scrollbarGutter: "stable",
			maskImage: "linear-gradient(black, transparent)",
			WebkitMaskImage: "linear-gradient(black, transparent)",
		});
	});

	it("lets mask style keys win over consumer mask keys", () => {
		const merged = mergeConversationTimelineStyles(
			{
				maskImage: "none",
				WebkitMaskImage: "none",
			},
			{
				maskImage: "linear-gradient(black, transparent)",
				WebkitMaskImage: "linear-gradient(black, transparent)",
			}
		);

		expect(merged).toEqual({
			maskImage: "linear-gradient(black, transparent)",
			WebkitMaskImage: "linear-gradient(black, transparent)",
		});
	});

	it("returns consumer style unchanged when mask style is empty", () => {
		const consumerStyle: React.CSSProperties = {
			paddingBottom: "80px",
		};

		const merged = mergeConversationTimelineStyles(consumerStyle, {});

		expect(merged).toBe(consumerStyle);
	});

	it("returns undefined when both styles are empty", () => {
		const merged = mergeConversationTimelineStyles(undefined, {});
		expect(merged).toBeUndefined();
	});
});

describe("composeConversationTimelineScrollHandlers", () => {
	it("calls internal and external handlers in order", () => {
		const callOrder: string[] = [];
		const internal = mock(() => {
			callOrder.push("internal");
		});
		const external = mock(() => {
			callOrder.push("external");
		});

		const handler = composeConversationTimelineScrollHandlers(
			internal as unknown as React.UIEventHandler<HTMLDivElement>,
			external as unknown as React.UIEventHandler<HTMLDivElement>
		);

		handler({} as React.UIEvent<HTMLDivElement>);

		expect(callOrder).toEqual(["internal", "external"]);
		expect(internal).toHaveBeenCalledTimes(1);
		expect(external).toHaveBeenCalledTimes(1);
	});

	it("returns internal handler when no external handler is provided", () => {
		const internal = mock(() => {});
		const handler = composeConversationTimelineScrollHandlers(
			internal as unknown as React.UIEventHandler<HTMLDivElement>
		);

		expect(handler).toBe(internal);
	});
});

describe("isConversationTimelinePrepend", () => {
	it("detects older items prepended during top pagination", () => {
		expect(
			isConversationTimelinePrepend({
				previousItemCount: 20,
				nextItemCount: 40,
				previousLastItemKey: "item-20",
				nextLastItemKey: "item-20",
			})
		).toBe(true);
	});

	it("ignores appended items (last item changed)", () => {
		expect(
			isConversationTimelinePrepend({
				previousItemCount: 20,
				nextItemCount: 21,
				previousLastItemKey: "item-20",
				nextLastItemKey: "item-21",
			})
		).toBe(false);
	});

	it("ignores the initial load and removals", () => {
		expect(
			isConversationTimelinePrepend({
				previousItemCount: 0,
				nextItemCount: 20,
				previousLastItemKey: null,
				nextLastItemKey: "item-20",
			})
		).toBe(false);

		expect(
			isConversationTimelinePrepend({
				previousItemCount: 20,
				nextItemCount: 19,
				previousLastItemKey: "item-20",
				nextLastItemKey: "item-20",
			})
		).toBe(false);
	});
});
