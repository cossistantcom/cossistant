import type * as React from "react";

export function mergeConversationTimelineStyles(
	styleProp: React.CSSProperties | undefined,
	scrollMaskStyle: React.CSSProperties
): React.CSSProperties | undefined {
	if (!(styleProp || Object.keys(scrollMaskStyle).length > 0)) {
		return;
	}

	if (!styleProp) {
		return scrollMaskStyle;
	}

	if (Object.keys(scrollMaskStyle).length === 0) {
		return styleProp;
	}

	return {
		...styleProp,
		...scrollMaskStyle,
	};
}

/**
 * Detects a top-of-list prepend (older items loaded via pagination): the list
 * grew while the last item stayed the same.
 */
export function isConversationTimelinePrepend(params: {
	previousItemCount: number;
	nextItemCount: number;
	previousLastItemKey: string | number | null;
	nextLastItemKey: string | number | null;
}): boolean {
	const {
		previousItemCount,
		nextItemCount,
		previousLastItemKey,
		nextLastItemKey,
	} = params;

	return (
		previousItemCount > 0 &&
		nextItemCount > previousItemCount &&
		nextLastItemKey !== null &&
		nextLastItemKey === previousLastItemKey
	);
}

export function composeConversationTimelineScrollHandlers(
	internalOnScroll: React.UIEventHandler<HTMLDivElement>,
	externalOnScroll?: React.UIEventHandler<HTMLDivElement>
): React.UIEventHandler<HTMLDivElement> {
	if (!externalOnScroll) {
		return internalOnScroll;
	}

	return (event) => {
		internalOnScroll(event);
		externalOnScroll(event);
	};
}
