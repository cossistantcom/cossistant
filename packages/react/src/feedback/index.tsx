import * as React from "react";
import { useSupport } from "../provider";
import { ConfigurationErrorDisplay } from "../support/components/configuration-error";
import { ThemeWrapper } from "../support/components/theme-wrapper";
import type { Align, CollisionPadding, Side } from "../support/types";
import { Content } from "./components/content";
import { FeedbackPanel } from "./components/panel";
import { Root } from "./components/root";
import { DefaultTrigger } from "./components/trigger";
import { ControlledStateProvider } from "./context/controlled-state";
import { type FeedbackHandle, FeedbackHandleProvider } from "./context/handle";
import { FeedbackWidgetProvider } from "./context/widget";
import {
	FeedbackTriggerPrimitive,
	type FeedbackTriggerRenderProps,
} from "./internal/trigger";

export type FeedbackProps = {
	className?: string;
	side?: Side;
	align?: Align;
	sideOffset?: number;
	avoidCollisions?: boolean;
	collisionPadding?: CollisionPadding;
	classNames?: {
		trigger?: string;
		content?: string;
	};
	theme?: "light" | "dark";
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultOpen?: boolean;
	conversationId?: string;
	trigger?: string;
	topics?: string[];
	defaultTopic?: string;
	topicPlaceholder?: string;
	commentPlaceholder?: string;
	commentRequired?: boolean;
	children?: React.ReactNode;
};

type ParsedChildren = {
	trigger: React.ReactNode | null;
	content: React.ReactNode | null;
};

function parseChildren(children: React.ReactNode): ParsedChildren {
	const result: ParsedChildren = {
		trigger: null,
		content: null,
	};

	React.Children.forEach(children, (child) => {
		if (!React.isValidElement(child)) {
			return;
		}

		const displayName = (child.type as React.ComponentType)?.displayName ?? "";

		if (displayName === "Feedback.Trigger" || child.type === FeedbackTrigger) {
			result.trigger = child;
			return;
		}

		if (displayName === "Feedback.Content" || child.type === FeedbackContent) {
			result.content = child;
		}
	});

	return result;
}

type FeedbackBoundaryProps = {
	className?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultOpen?: boolean;
	theme?: "light" | "dark";
	forwardedRef?: React.Ref<FeedbackHandle>;
	children: React.ReactNode;
};

function FeedbackBoundary({
	className,
	open,
	onOpenChange,
	defaultOpen,
	theme,
	forwardedRef,
	children,
}: FeedbackBoundaryProps) {
	return (
		<ControlledStateProvider onOpenChange={onOpenChange} open={open}>
			<FeedbackWidgetProvider defaultOpen={defaultOpen}>
				<FeedbackHandleProvider forwardedRef={forwardedRef}>
					<ThemeWrapper theme={theme}>
						<Root className={className}>{children}</Root>
					</ThemeWrapper>
				</FeedbackHandleProvider>
			</FeedbackWidgetProvider>
		</ControlledStateProvider>
	);
}

function FeedbackComponentInner(
	{
		className,
		side = "top",
		align = "end",
		sideOffset = 16,
		avoidCollisions = true,
		collisionPadding = 8,
		classNames = {},
		theme,
		open,
		onOpenChange,
		defaultOpen,
		conversationId,
		trigger,
		topics,
		defaultTopic,
		topicPlaceholder,
		commentPlaceholder,
		commentRequired = false,
		children,
	}: FeedbackProps,
	ref: React.Ref<FeedbackHandle>
): React.ReactElement | null {
	const { website, configurationError } = useSupport();
	const isVisitorBlocked = website?.visitor?.isBlocked ?? false;

	if (website && isVisitorBlocked) {
		return null;
	}

	if (!(website || configurationError)) {
		return null;
	}

	const parsedChildren = parseChildren(children);

	const triggerElement = parsedChildren.trigger ?? (
		<DefaultTrigger className={classNames.trigger} />
	);

	const contentElement = parsedChildren.content ?? (
		<Content
			align={align}
			avoidCollisions={avoidCollisions}
			className={classNames.content}
			collisionPadding={collisionPadding}
			side={side}
			sideOffset={sideOffset}
		>
			{configurationError ? (
				<ConfigurationErrorDisplay error={configurationError} />
			) : (
				<FeedbackPanel
					commentPlaceholder={commentPlaceholder}
					commentRequired={commentRequired}
					conversationId={conversationId}
					defaultTopic={defaultTopic}
					topicPlaceholder={topicPlaceholder}
					topics={topics}
					trigger={trigger}
				/>
			)}
		</Content>
	);

	return (
		<FeedbackBoundary
			className={className}
			defaultOpen={defaultOpen}
			forwardedRef={ref}
			onOpenChange={onOpenChange}
			open={open}
			theme={theme}
		>
			{triggerElement}
			{contentElement}
		</FeedbackBoundary>
	);
}

const FeedbackComponent = React.forwardRef(FeedbackComponentInner) as (
	props: FeedbackProps & { ref?: React.Ref<FeedbackHandle> }
) => React.ReactElement | null;

export type FeedbackTriggerProps = Omit<
	React.ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	children?:
		| React.ReactNode
		| ((props: FeedbackTriggerRenderProps) => React.ReactNode);
	asChild?: boolean;
	className?: string;
};

const FeedbackTrigger = React.forwardRef<
	HTMLButtonElement,
	FeedbackTriggerProps
>(({ children, className, asChild = false, ...props }, ref) => (
	<FeedbackTriggerPrimitive
		asChild={asChild}
		className={className}
		ref={ref}
		{...props}
	>
		{children}
	</FeedbackTriggerPrimitive>
));

FeedbackTrigger.displayName = "Feedback.Trigger";

export type FeedbackContentProps = {
	className?: string;
	side?: Side;
	align?: Align;
	sideOffset?: number;
	avoidCollisions?: boolean;
	collisionPadding?: CollisionPadding;
	conversationId?: string;
	trigger?: string;
	topics?: string[];
	defaultTopic?: string;
	topicPlaceholder?: string;
	commentPlaceholder?: string;
	commentRequired?: boolean;
	children?: React.ReactNode;
};

const FeedbackContent: React.FC<FeedbackContentProps> = ({
	className,
	side = "top",
	align = "end",
	sideOffset = 16,
	avoidCollisions = true,
	collisionPadding = 8,
	conversationId,
	trigger,
	topics,
	defaultTopic,
	topicPlaceholder,
	commentPlaceholder,
	commentRequired = false,
	children,
}) => (
	<Content
		align={align}
		avoidCollisions={avoidCollisions}
		className={className}
		collisionPadding={collisionPadding}
		side={side}
		sideOffset={sideOffset}
	>
		{children ?? (
			<FeedbackPanel
				commentPlaceholder={commentPlaceholder}
				commentRequired={commentRequired}
				conversationId={conversationId}
				defaultTopic={defaultTopic}
				topicPlaceholder={topicPlaceholder}
				topics={topics}
				trigger={trigger}
			/>
		)}
	</Content>
);

(FeedbackContent as React.FC & { displayName?: string }).displayName =
	"Feedback.Content";

export type FeedbackRootProps = {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	defaultOpen?: boolean;
	theme?: "light" | "dark";
	className?: string;
	children: React.ReactNode;
};

const FeedbackRoot = React.forwardRef<FeedbackHandle, FeedbackRootProps>(
	({ open, onOpenChange, defaultOpen, theme, className, children }, ref) => {
		const { website, configurationError } = useSupport();
		const isVisitorBlocked = website?.visitor?.isBlocked ?? false;

		if (website && isVisitorBlocked) {
			return null;
		}

		if (!(website || configurationError)) {
			return null;
		}

		return (
			<FeedbackBoundary
				className={className}
				defaultOpen={defaultOpen}
				forwardedRef={ref}
				onOpenChange={onOpenChange}
				open={open}
				theme={theme}
			>
				{children}
			</FeedbackBoundary>
		);
	}
);

FeedbackRoot.displayName = "Feedback.Root";

export const Feedback = Object.assign(FeedbackComponent, {
	Root: FeedbackRoot,
	Trigger: FeedbackTrigger,
	Content: FeedbackContent,
});

export default Feedback;

export type {
	Align,
	CollisionPadding,
	Side,
} from "../support/types";
export type { FeedbackHandle } from "./context/handle";
export { useFeedbackHandle } from "./context/handle";
export type { FeedbackTriggerRenderProps } from "./internal/trigger";
