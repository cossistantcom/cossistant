import type { MarkdownToken } from "@plasma/tiny-markdown";
import {
	hasMarkdownFormatting,
	parseMarkdown,
} from "@plasma/tiny-markdown/utils";
import type { TimelineItem as TimelineItemType } from "@plasma/types/api/timeline-item";
import * as React from "react";
import { useRenderElement } from "../utils/use-render-element";
import {
	type CommandVariants,
	mapCommandVariants,
	mapInlineCommandFromParagraphChildren,
} from "./command-block-utils";
import { TimelineCodeBlock } from "./timeline-code-block";
import { TimelineCommandBlock } from "./timeline-command-block";

/**
 * Metadata describing the origin of a timeline item and pre-parsed content that can
 * be consumed by render-prop children.
 */
export type TimelineItemRenderProps = {
	isVisitor: boolean;
	isAI: boolean;
	isHuman: boolean;
	timestamp: Date;
	text: string | null;
	senderType: "visitor" | "ai" | "human";
	itemType: "message" | "event" | "identification" | "tool";
};

export type TimelineItemProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: TimelineItemRenderProps) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	item: TimelineItemType;
};

/**
 * Generic timeline item wrapper that adds accessibility attributes and resolves the
 * sender type into convenient render props for custom layouts. Works with
 * message, event, identification, and tool timeline item types.
 */
export const TimelineItem = (() => {
	const Component = React.forwardRef<HTMLDivElement, TimelineItemProps>(
		({ children, className, asChild = false, item, ...props }, ref) => {
			// Determine sender type from timeline item properties
			const isVisitor = item.visitorId !== null;
			const isAI = item.aiAgentId !== null;
			const isHuman = item.userId !== null && !isVisitor;

			const senderType = isVisitor ? "visitor" : isAI ? "ai" : "human";

			const renderProps: TimelineItemRenderProps = {
				isVisitor,
				isAI,
				isHuman,
				timestamp: new Date(item.createdAt),
				text: item.text,
				senderType,
				itemType: item.type,
			};

			const content =
				typeof children === "function" ? children(renderProps) : children;

			const itemTypeLabel = (() => {
				if (item.type === "event") {
					return "Event";
				}
				if (item.type === "identification") {
					return "Identification";
				}
				if (item.type === "tool") {
					return "Tool call";
				}
				if (isVisitor) {
					return "visitor";
				}
				if (isAI) {
					return "AI assistant";
				}
				return "human agent";
			})();

			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					state: renderProps,
					props: {
						role: "article",
						"aria-label": `${item.type === "message" ? "Message" : item.type === "tool" ? "Tool call" : "Event"} from ${itemTypeLabel}`,
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItem";
	return Component;
})();

function parseMentionHref(
	href: string
): { mentionType: string; mentionId: string } | null {
	if (!href.startsWith("mention:")) {
		return null;
	}

	const parts = href.split(":");
	const mentionType = parts[1];
	const mentionId = parts.slice(2).join(":");

	if (!(mentionType && mentionId)) {
		return null;
	}

	return { mentionType, mentionId };
}

export type TimelineInlineCodeRendererProps = {
	code: string;
};

export type TimelineCodeBlockRendererProps = {
	code: string;
	language?: string;
	fileName?: string;
};

export type TimelineCommandBlockRendererProps = {
	command: string;
	commands: CommandVariants;
};

export type TimelineItemContentMarkdownRenderers = {
	inlineCode?: (props: TimelineInlineCodeRendererProps) => React.ReactNode;
	codeBlock?: (props: TimelineCodeBlockRendererProps) => React.ReactNode;
	commandBlock?: (props: TimelineCommandBlockRendererProps) => React.ReactNode;
};

function renderInlineCode(
	code: string,
	key: string,
	renderers?: TimelineItemContentMarkdownRenderers
): React.ReactNode {
	if (renderers?.inlineCode) {
		return (
			<React.Fragment key={key}>
				{renderers.inlineCode({ code })}
			</React.Fragment>
		);
	}

	return <code key={key}>{code}</code>;
}

function renderCodeBlock(
	props: TimelineCodeBlockRendererProps,
	key: string,
	renderers?: TimelineItemContentMarkdownRenderers
): React.ReactNode {
	if (renderers?.codeBlock) {
		return (
			<React.Fragment key={key}>{renderers.codeBlock(props)}</React.Fragment>
		);
	}

	return (
		<TimelineCodeBlock
			code={props.code}
			fileName={props.fileName}
			key={key}
			language={props.language}
		/>
	);
}

function renderCommandBlock(
	props: TimelineCommandBlockRendererProps,
	key: string,
	renderers?: TimelineItemContentMarkdownRenderers
): React.ReactNode {
	if (renderers?.commandBlock) {
		return (
			<React.Fragment key={key}>{renderers.commandBlock(props)}</React.Fragment>
		);
	}

	return <TimelineCommandBlock commands={props.commands} key={key} />;
}

function hasNonWhitespaceParagraphContent(children: MarkdownToken[]): boolean {
	return children.some(
		(child) => child.type !== "text" || child.content.trim().length > 0
	);
}

function renderMarkdownToken(
	token: MarkdownToken,
	key: string,
	renderers?: TimelineItemContentMarkdownRenderers
): React.ReactNode {
	switch (token.type) {
		case "text":
			return token.content;
		case "strong":
			return (
				<strong className="font-semibold" key={key}>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</strong>
			);
		case "em":
			return (
				<em className="italic" key={key}>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</em>
			);
		case "code": {
			if (token.inline) {
				return renderInlineCode(token.content, key, renderers);
			}

			const commandVariants = mapCommandVariants(token.content);
			if (commandVariants) {
				return renderCommandBlock(
					{
						command: token.content,
						commands: commandVariants,
					},
					key,
					renderers
				);
			}

			return renderCodeBlock(
				{
					code: token.content,
					fileName: token.fileName,
					language: token.language,
				},
				key,
				renderers
			);
		}
		case "p": {
			const inlineCommand = mapInlineCommandFromParagraphChildren(
				token.children
			);
			if (inlineCommand) {
				const beforeChildren = token.children.slice(0, inlineCommand.index);
				const afterChildren = token.children.slice(inlineCommand.index + 1);
				const hasBefore = hasNonWhitespaceParagraphContent(beforeChildren);
				const hasAfter = hasNonWhitespaceParagraphContent(afterChildren);

				if (!(hasBefore || hasAfter)) {
					return renderCommandBlock(
						{
							command: inlineCommand.command,
							commands: inlineCommand.variants,
						},
						key,
						renderers
					);
				}

				return (
					<div className="mt-1 block first:mt-0" key={key}>
						{hasBefore ? (
							<span className="block">
								{beforeChildren.map((child, index) =>
									renderMarkdownToken(
										child,
										`${key}-before-${index}`,
										renderers
									)
								)}
							</span>
						) : null}

						{renderCommandBlock(
							{
								command: inlineCommand.command,
								commands: inlineCommand.variants,
							},
							`${key}-command`,
							renderers
						)}

						{hasAfter ? (
							<span className="mt-1 block">
								{afterChildren.map((child, index) =>
									renderMarkdownToken(child, `${key}-after-${index}`, renderers)
								)}
							</span>
						) : null}
					</div>
				);
			}

			return (
				<span className="mt-1 block first:mt-0" key={key}>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</span>
			);
		}
		case "blockquote":
			return (
				<blockquote
					className="my-1 border-co-border border-l-2 pl-3 italic opacity-80"
					key={key}
				>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</blockquote>
			);
		case "ul":
			return (
				<ul className="my-0 list-disc pl-6" key={key}>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</ul>
			);
		case "ol":
			return (
				<ol className="my-0 list-decimal pl-6" key={key}>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</ol>
			);
		case "li":
			return (
				<li className="[&>span.block]:mt-0 [&>span.block]:inline" key={key}>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</li>
			);
		case "a": {
			const mention = parseMentionHref(token.href);

			if (mention) {
				return (
					<span
						className="rounded bg-co-orange/15 font-medium text-co-orange"
						data-mention-id={mention.mentionId}
						data-mention-type={mention.mentionType}
						key={key}
					>
						{token.children.map((child, index) =>
							renderMarkdownToken(child, `${key}-${index}`, renderers)
						)}
					</span>
				);
			}

			return (
				<a
					className="underline hover:opacity-80"
					href={token.href}
					key={key}
					rel="noopener noreferrer"
					target="_blank"
				>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</a>
			);
		}
		case "mention":
			return (
				<span
					className="rounded bg-co-orange/15 font-medium text-co-orange"
					data-mention-id={token.mention.id}
					data-mention-type={token.mention.type}
					key={key}
				>
					@{token.mention.name}
				</span>
			);
		case "header": {
			const headerClass =
				token.level === 1
					? "mt-1 block text-base font-semibold first:mt-0"
					: token.level === 2
						? "mt-1 block text-sm font-semibold first:mt-0"
						: "mt-1 block text-sm font-medium first:mt-0";

			return (
				<span className={headerClass} key={key}>
					{token.children.map((child, index) =>
						renderMarkdownToken(child, `${key}-${index}`, renderers)
					)}
				</span>
			);
		}
		case "br":
			return <br key={key} />;
		default:
			return null;
	}
}

const MemoizedMarkdownBlock = React.memo(
	({
		content,
		markdownRenderers,
	}: {
		content: string;
		markdownRenderers?: TimelineItemContentMarkdownRenderers;
	}) => {
		const shouldRenderMarkdown = hasMarkdownFormatting(content);

		if (!shouldRenderMarkdown) {
			return <span className="whitespace-pre-wrap break-words">{content}</span>;
		}

		const tokens = parseMarkdown(content);

		return (
			<>
				{tokens.map((token, index) =>
					renderMarkdownToken(token, `markdown-${index}`, markdownRenderers)
				)}
			</>
		);
	},
	(prevProps, nextProps) =>
		prevProps.content === nextProps.content &&
		prevProps.markdownRenderers === nextProps.markdownRenderers
);

MemoizedMarkdownBlock.displayName = "MemoizedMarkdownBlock";

export type TimelineItemContentProps = Omit<
	React.HTMLAttributes<HTMLDivElement>,
	"children"
> & {
	children?: React.ReactNode | ((content: string) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	text?: string | null;
	renderMarkdown?: boolean;
	markdownRenderers?: TimelineItemContentMarkdownRenderers;
};

/**
 * Renders the content of a timeline item, optionally piping Markdown content through a
 * memoised renderer or handing the raw text to a render prop for custom
 * formatting.
 */
export const TimelineItemContent = (() => {
	const Component = React.forwardRef<HTMLDivElement, TimelineItemContentProps>(
		(
			{
				children,
				className,
				asChild = false,
				text = "",
				renderMarkdown = true,
				markdownRenderers,
				...props
			},
			ref
		) => {
			const content = React.useMemo(() => {
				const textContent = text ?? "";
				if (typeof children === "function") {
					return children(textContent);
				}
				if (children) {
					return children;
				}
				if (renderMarkdown && textContent) {
					return (
						<MemoizedMarkdownBlock
							content={textContent}
							markdownRenderers={markdownRenderers}
						/>
					);
				}
				return textContent;
			}, [children, markdownRenderers, text, renderMarkdown]);

			return useRenderElement(
				"div",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
						style: {
							...props.style,
						},
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemContent";
	return Component;
})();

export type TimelineItemTimestampProps = Omit<
	React.HTMLAttributes<HTMLSpanElement>,
	"children"
> & {
	children?: React.ReactNode | ((timestamp: Date) => React.ReactNode);
	asChild?: boolean;
	className?: string;
	timestamp: Date;
	format?: (date: Date) => string;
};

/**
 * Timestamp helper that renders a formatted date or allows callers to supply a
 * render prop for custom time displays while preserving semantic markup.
 */
export const TimelineItemTimestamp = (() => {
	const Component = React.forwardRef<
		HTMLSpanElement,
		TimelineItemTimestampProps
	>(
		(
			{
				children,
				className,
				asChild = false,
				timestamp,
				format = (date) =>
					date.toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
					}),
				...props
			},
			ref
		) => {
			const content =
				typeof children === "function"
					? children(timestamp)
					: children || format(timestamp);

			return useRenderElement(
				"span",
				{
					className,
					asChild,
				},
				{
					ref,
					props: {
						...props,
						children: content,
					},
				}
			);
		}
	);

	Component.displayName = "TimelineItemTimestamp";
	return Component;
})();
