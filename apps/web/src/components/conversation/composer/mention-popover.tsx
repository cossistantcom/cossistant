"use client";

import type { CaretCoordinates, Mention } from "@plasma/tiny-markdown";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import Icon from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import {
	calculateMentionPopoverPosition,
	calculateMentionPopoverViewportPosition,
} from "./mention-popover-position";

export type MentionPopoverProps = {
	isActive: boolean;
	results: Mention[];
	highlightedIndex: number;
	isLoading: boolean;
	caretPosition: CaretCoordinates | null;
	onSelect: (mention: Mention) => void;
	anchorRef: React.RefObject<HTMLDivElement | null>;
};

const DEFAULT_POPOVER_WIDTH = 260;
const DEFAULT_POPOVER_HEIGHT = 220;
const DEFAULT_POSITION_PADDING = 8;

function getEntityIcon(type: string) {
	switch (type) {
		case "ai-agent":
			return <Icon className="size-3" name="agent" />;
		case "tool":
			return <Icon className="size-3" name="cli" />;
		case "visitor":
			return <Icon className="size-3" name="contacts" />;
		default:
			return null;
	}
}

function getEntityLabel(type: string) {
	switch (type) {
		case "ai-agent":
			return "AI Agent";
		case "tool":
			return "Tool";
		case "human-agent":
			return "Team";
		case "visitor":
			return "Visitor";
		default:
			return "";
	}
}

function MentionLeadingVisual({ mention }: { mention: Mention }) {
	if (mention.type === "tool") {
		return (
			<div
				className="flex size-6 items-center justify-center rounded bg-primary/10 text-primary"
				data-mention-leading="tool-icon"
			>
				<Icon className="size-3.5" name="cli" />
			</div>
		);
	}

	if (mention.type === "ai-agent" && !mention.avatar) {
		return (
			<div
				className="flex size-6 items-center justify-center rounded border border-border/60 bg-muted/40"
				data-mention-leading="ai-logo"
			>
				<Logo className="size-3.5 text-primary/90" />
			</div>
		);
	}

	return (
		<div data-mention-leading="avatar">
			<Avatar
				className="size-6"
				fallbackName={mention.name}
				url={mention.avatar}
			/>
		</div>
	);
}

export function MentionPopover({
	isActive,
	results,
	highlightedIndex,
	isLoading,
	caretPosition,
	onSelect,
	anchorRef,
}: MentionPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const reflowFrameRef = useRef<number | null>(null);
	const [popoverSize, setPopoverSize] = useState({
		width: DEFAULT_POPOVER_WIDTH,
		height: DEFAULT_POPOVER_HEIGHT,
	});
	const [, setReflowTick] = useState(0);

	const queueReflow = useCallback(() => {
		if (typeof window === "undefined") {
			return;
		}
		if (reflowFrameRef.current !== null) {
			return;
		}

		reflowFrameRef.current = window.requestAnimationFrame(() => {
			reflowFrameRef.current = null;
			setReflowTick((tick) => tick + 1);
		});
	}, []);

	useLayoutEffect(() => {
		if (!isActive) {
			return;
		}

		const popover = popoverRef.current;
		if (!popover) {
			return;
		}

		const measuredWidth = popover.offsetWidth;
		const measuredHeight = popover.offsetHeight;
		if (!(measuredWidth && measuredHeight)) {
			return;
		}

		setPopoverSize((current) => {
			if (
				current.width === measuredWidth &&
				current.height === measuredHeight
			) {
				return current;
			}

			return {
				width: measuredWidth,
				height: measuredHeight,
			};
		});
	}, [highlightedIndex, isActive, isLoading, results.length]);

	useEffect(
		() => () => {
			if (typeof window !== "undefined" && reflowFrameRef.current !== null) {
				window.cancelAnimationFrame(reflowFrameRef.current);
				reflowFrameRef.current = null;
			}
		},
		[]
	);

	useEffect(() => {
		if (!isActive || typeof window === "undefined") {
			return;
		}

		const handleViewportChange = () => {
			queueReflow();
		};

		window.addEventListener("scroll", handleViewportChange, true);
		window.addEventListener("resize", handleViewportChange);

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(() => {
				queueReflow();
			});

			const anchor = anchorRef.current;
			const popover = popoverRef.current;

			if (anchor) {
				resizeObserver.observe(anchor);
			}

			if (popover) {
				resizeObserver.observe(popover);
			}
		}

		queueReflow();

		return () => {
			window.removeEventListener("scroll", handleViewportChange, true);
			window.removeEventListener("resize", handleViewportChange);
			resizeObserver?.disconnect();
		};
	}, [anchorRef, isActive, queueReflow]);

	const anchorWidth = anchorRef.current?.clientWidth ?? popoverSize.width + 16;
	const anchorHeight =
		anchorRef.current?.clientHeight ?? popoverSize.height + 16;
	const safeCaretPosition = caretPosition ?? { top: 0, left: 0, height: 0 };
	const localPosition = calculateMentionPopoverPosition({
		caretPosition: safeCaretPosition,
		anchorWidth,
		anchorHeight,
		popoverWidth: popoverSize.width,
		popoverHeight: popoverSize.height,
		offset: 16,
	});

	const anchorRect = anchorRef.current?.getBoundingClientRect() ?? {
		left: 0,
		top: 0,
	};
	const viewportWidth =
		typeof window === "undefined"
			? anchorWidth + DEFAULT_POSITION_PADDING * 2
			: window.innerWidth;
	const viewportHeight =
		typeof window === "undefined"
			? anchorHeight + DEFAULT_POSITION_PADDING * 2
			: window.innerHeight;
	const viewportPosition = calculateMentionPopoverViewportPosition({
		localPosition,
		anchorRect,
		popoverWidth: popoverSize.width,
		popoverHeight: popoverSize.height,
		viewportWidth,
		viewportHeight,
		padding: DEFAULT_POSITION_PADDING,
	});

	if (!(isActive && caretPosition)) {
		return null;
	}

	const shouldEmphasizeHints = results.length <= 1 && !isLoading;

	const style: React.CSSProperties = {
		position: "fixed",
		top: viewportPosition.top,
		left: viewportPosition.left,
		zIndex: 60,
	};

	const popoverContent = (
		<div
			className="min-w-[200px] max-w-[300px] overflow-hidden rounded-[2px] border border-border/70 bg-background-200 shadow-sm"
			data-placement={localPosition.placement}
			ref={popoverRef}
			style={style}
		>
			{isLoading ? (
				<div className="flex items-center justify-center px-3 py-2.5 text-muted-foreground/80 text-xs">
					<div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					Searching...
				</div>
			) : results.length === 0 ? (
				<div className="px-3 py-2.5 text-center text-muted-foreground/80 text-xs">
					No results found
				</div>
			) : (
				<div className="max-h-[200px] overflow-y-auto">
					{results.map((mention, index) => (
						<button
							className={cn(
								"flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
								index === highlightedIndex
									? "bg-accent/80 text-accent-foreground"
									: "hover:bg-muted/60"
							)}
							key={mention.id}
							onClick={() => onSelect(mention)}
							type="button"
						>
							<MentionLeadingVisual mention={mention} />
							<div className="min-w-0 flex-1">
								<span className="block truncate font-medium">
									{mention.name}
								</span>
							</div>
							<span className="ml-2 inline-flex min-w-[72px] items-center justify-end gap-1 text-muted-foreground/70 text-xs">
								{getEntityIcon(mention.type)}
								{getEntityLabel(mention.type)}
							</span>
						</button>
					))}
				</div>
			)}
			<div
				className={cn(
					"border-t px-3 py-1.5 text-xs",
					shouldEmphasizeHints
						? "border-border/70 bg-muted/40 text-muted-foreground"
						: "border-border/60 bg-transparent text-muted-foreground/80"
				)}
			>
				<span className="font-mono text-[10px]">↑↓</span> to navigate,{" "}
				<span className="font-mono text-[10px]">↵</span> to select,{" "}
				<span className="font-mono text-[10px]">esc</span> to dismiss
			</div>
		</div>
	);

	if (typeof document === "undefined" || !document.body) {
		return popoverContent;
	}

	return createPortal(popoverContent, document.body);
}
