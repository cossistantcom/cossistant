"use client";

import type { RouteRegistry } from "@cossistant/core";
import type { DefaultMessage } from "@cossistant/types";
import * as React from "react";
import { useSupportController } from "../controller-context";
import {
	getCompoundDisplayName,
	parseCompoundChildren,
} from "../internal/compound-children";
import * as Primitive from "../primitives";
import { useSupport } from "../provider";
import { SupportRealtimeProvider } from "../realtime";
import { SupportConfig } from "../support-config";
import { ConfigurationErrorDisplay } from "./components/configuration-error";
import { Content } from "./components/content";
import { Root } from "./components/root";
import { ThemeWrapper } from "./components/theme-wrapper";
import { DefaultTrigger } from "./components/trigger";
import { ControlledStateProvider } from "./context/controlled-state";
import {
	type ConversationEndEvent,
	type ConversationStartEvent,
	type ErrorEvent,
	type MessageReceivedEvent,
	type MessageSentEvent,
	SupportEventsProvider,
} from "./context/events";
import { type SupportHandle, SupportHandleProvider } from "./context/handle";
import { SupportModeProvider } from "./context/mode";
import {
	SupportSlotOverridesProvider,
	type SupportSlotProps,
	type SupportSlots,
} from "./context/slot-overrides";
import { FooterSlot, HeaderSlot } from "./context/slots";
import { type CustomPage, Page, Router } from "./router";
import type { SupportLocale, SupportTextContentOverrides } from "./text";
import { SupportTextProvider } from "./text";
import type {
	Align,
	CollisionPadding,
	Side,
	SupportMode,
	TriggerRenderProps,
} from "./types";

// =============================================================================
// Support Props
// =============================================================================

export type SupportProps<Locale extends string = SupportLocale> = {
	/**
	 * Additional CSS classes for the root wrapper.
	 */
	className?: string;

	/**
	 * Layout mode for the support widget.
	 * When set to `responsive`, the widget always renders inline and
	 * `open`, `onOpenChange`, and `defaultOpen` are ignored for visibility.
	 * @default "floating"
	 */
	mode?: SupportMode;

	/**
	 * Which side of the trigger to place the content.
	 * @default "top"
	 */
	side?: Side;

	/**
	 * Alignment along the side axis.
	 * @default "end"
	 */
	align?: Align;

	/**
	 * Distance (in pixels) between the trigger and the content.
	 * @default 16
	 */
	sideOffset?: number;

	/**
	 * Enable automatic collision avoidance.
	 * When true, the content repositions to stay within the viewport.
	 * @default true
	 */
	avoidCollisions?: boolean;

	/**
	 * Padding from viewport edges when avoiding collisions.
	 * @default 8
	 */
	collisionPadding?: CollisionPadding;

	/**
	 * Granular className overrides for specific parts.
	 */
	classNames?: {
		trigger?: string;
		content?: string;
	};

	/**
	 * Force a specific theme. Omit for automatic detection.
	 */
	theme?: "light" | "dark";

	/**
	 * Controlled open state.
	 * When provided, the widget operates in controlled mode.
	 * Use with `onOpenChange` to manage state externally.
	 */
	open?: boolean;

	/**
	 * Callback fired when the open state should change.
	 * Use with `open` prop for controlled mode.
	 *
	 * @example
	 * const [isOpen, setIsOpen] = useState(false);
	 * <Support open={isOpen} onOpenChange={setIsOpen} />
	 */
	onOpenChange?: (open: boolean) => void;

	/**
	 * Whether the widget should open automatically on mount (uncontrolled mode).
	 * Ignored when `open` prop is provided (controlled mode).
	 * @default false
	 */
	defaultOpen?: boolean;

	/**
	 * Quick reply options displayed to users.
	 */
	quickOptions?: string[];

	/**
	 * Custom welcome messages shown before a conversation starts.
	 */
	defaultMessages?: DefaultMessage[];

	/**
	 * Locale string for widget translations.
	 */
	locale?: Locale;

	/**
	 * Custom text content overrides for internationalization.
	 *
	 * @remarks `SupportTextContentOverrides<Locale>`
	 * @fumadocsType `SupportTextContentOverrides<Locale>`
	 */
	content?: SupportTextContentOverrides<Locale>;

	/**
	 * Custom pages to add to the router.
	 */
	customPages?: CustomPage[];

	/**
	 * Quick component overrides for specific parts of the default widget.
	 * Use this when you want to swap one part without rebuilding the whole tree.
	 */
	slots?: SupportSlots;

	/**
	 * Additional props applied to slot components and key built-in parts.
	 * Runtime-managed values still win over external overrides when required.
	 */
	slotProps?: SupportSlotProps;

	// =========================================================================
	// Event Callbacks
	// =========================================================================

	/**
	 * Called when a new conversation is started.
	 */
	onConversationStart?: (event: ConversationStartEvent) => void;

	/**
	 * Called when a conversation ends (resolved, closed, etc.).
	 */
	onConversationEnd?: (event: ConversationEndEvent) => void;

	/**
	 * Called when the visitor sends a message.
	 */
	onMessageSent?: (event: MessageSentEvent) => void;

	/**
	 * Called when a message is received from an agent (human or AI).
	 */
	onMessageReceived?: (event: MessageReceivedEvent) => void;

	/**
	 * Called when an error occurs within the widget.
	 */
	onError?: (event: ErrorEvent) => void;

	/**
	 * Children for composition. Can include:
	 * - <Support.Trigger> for custom trigger
	 * - <Support.Content> for custom content positioning
	 * - <Support.Page> components for custom routes
	 */
	children?: React.ReactNode;
};

type SupportRuntimeProps<Locale extends string = SupportLocale> = Pick<
	SupportProps<Locale>,
	| "content"
	| "customPages"
	| "defaultMessages"
	| "defaultOpen"
	| "locale"
	| "mode"
	| "onConversationEnd"
	| "onConversationStart"
	| "onError"
	| "onMessageReceived"
	| "onMessageSent"
	| "onOpenChange"
	| "open"
	| "quickOptions"
	| "slotProps"
	| "slots"
	| "theme"
> & {
	children: React.ReactNode;
	forwardedRef: React.Ref<SupportHandle>;
};

const SupportCustomPagesContext = React.createContext<CustomPage[] | undefined>(
	undefined
);

export function useSupportCustomPages(): CustomPage[] | undefined {
	return React.useContext(SupportCustomPagesContext);
}

// =============================================================================
// Child Component Detection
// =============================================================================

type ParsedChildren = {
	trigger: React.ReactNode | null;
	content: React.ReactNode | null;
	pages: React.ReactNode[];
	other: React.ReactNode[];
};

function extractCustomPagesFromNodes(nodes: React.ReactNode[]): CustomPage[] {
	const pages: CustomPage[] = [];

	for (const node of nodes) {
		if (!React.isValidElement(node)) {
			continue;
		}

		const props = node.props as Partial<{
			name: keyof RouteRegistry;
			component: CustomPage["component"];
		}>;

		if (props.name && props.component) {
			pages.push({
				name: props.name,
				component: props.component,
			});
		}
	}

	return pages;
}

function mergeCustomPages(
	...groups: Array<CustomPage[] | undefined>
): CustomPage[] | undefined {
	const pagesByName = new Map<keyof RouteRegistry, CustomPage>();

	for (const group of groups) {
		for (const page of group ?? []) {
			pagesByName.set(page.name, page);
		}
	}

	if (pagesByName.size === 0) {
		return;
	}

	return Array.from(pagesByName.values());
}

function parseChildren(children: React.ReactNode): ParsedChildren {
	const { matched, other } = parseCompoundChildren(children, [
		{
			name: "trigger",
			matches: (child) => {
				const displayName = getCompoundDisplayName(child);
				return (
					displayName === "Support.Trigger" || child.type === SupportTrigger
				);
			},
		},
		{
			name: "content",
			matches: (child) => {
				const displayName = getCompoundDisplayName(child);
				return (
					displayName === "Support.Content" || child.type === SupportContent
				);
			},
		},
		{
			name: "page",
			matches: (child) => {
				const displayName = getCompoundDisplayName(child);
				return displayName === "Support.Page" || child.type === Page;
			},
		},
	] as const);

	return {
		trigger: matched.trigger[0] ?? null,
		content: matched.content[0] ?? null,
		pages: matched.page,
		other,
	};
}

function SupportRuntimeBoundary<Locale extends string = SupportLocale>({
	children,
	content,
	customPages,
	defaultMessages,
	defaultOpen,
	forwardedRef,
	locale,
	mode = "floating",
	onConversationEnd,
	onConversationStart,
	onError,
	onMessageReceived,
	onMessageSent,
	onOpenChange,
	open,
	quickOptions,
	slotProps,
	slots,
	theme,
}: SupportRuntimeProps<Locale>): React.ReactElement | null {
	const { website, configurationError } = useSupport();
	const controller = useSupportController();
	const isVisitorBlocked = website?.visitor?.isBlocked ?? false;
	const hasAppliedInitialDefaultOpenRef = React.useRef(false);

	React.useEffect(() => {
		if (hasAppliedInitialDefaultOpenRef.current) {
			return;
		}

		hasAppliedInitialDefaultOpenRef.current = true;

		if (
			mode === "floating" &&
			open === undefined &&
			defaultOpen !== undefined
		) {
			controller.updateSupportConfig({ isOpen: defaultOpen });
		}
	}, [controller, defaultOpen, mode, open]);

	if (website && isVisitorBlocked) {
		return null;
	}

	if (!(website || configurationError)) {
		return null;
	}

	return (
		<SupportModeProvider mode={mode}>
			<ControlledStateProvider onOpenChange={onOpenChange} open={open}>
				<SupportEventsProvider
					onConversationEnd={onConversationEnd}
					onConversationStart={onConversationStart}
					onError={onError}
					onMessageReceived={onMessageReceived}
					onMessageSent={onMessageSent}
				>
					<SupportHandleProvider forwardedRef={forwardedRef}>
						<ThemeWrapper theme={theme}>
							<SupportCustomPagesContext.Provider value={customPages}>
								<SupportSlotOverridesProvider
									slotProps={slotProps}
									slots={slots}
								>
									<SupportRealtimeProvider>
										<SupportTextProvider content={content} locale={locale}>
											{children}
										</SupportTextProvider>
									</SupportRealtimeProvider>
									<SupportConfig
										defaultMessages={defaultMessages}
										quickOptions={quickOptions}
									/>
								</SupportSlotOverridesProvider>
							</SupportCustomPagesContext.Provider>
						</ThemeWrapper>
					</SupportHandleProvider>
				</SupportEventsProvider>
			</ControlledStateProvider>
		</SupportModeProvider>
	);
}

// =============================================================================
// Main Support Component
// =============================================================================

/**
 * Complete support widget with chat, routing, and real-time features.
 *
 * @example
 * // Zero config - works instantly
 * <Support />
 *
 * @example
 * // With styling
 * <Support
 *   theme="dark"
 *   classNames={{
 *     trigger: "bg-purple-600",
 *     content: "border-purple-200",
 *   }}
 * />
 *
 * @example
 * // With custom positioning
 * <Support side="bottom" align="end" sideOffset={8} />
 *
 * @example
 * // Controlled mode - external state management
 * const [isOpen, setIsOpen] = useState(false);
 * <Support open={isOpen} onOpenChange={setIsOpen} />
 *
 * @example
 * // With imperative ref
 * const supportRef = useRef<SupportHandle>(null);
 * supportRef.current?.open();
 * supportRef.current?.startConversation("Hello!");
 * <Support ref={supportRef} />
 *
 * @example
 * // With custom trigger
 * <Support side="bottom" align="end">
 *   <Support.Trigger className="px-4 py-2">
 *     {({ isOpen, unreadCount }) => (
 *       <span>{isOpen ? "Close" : `Help (${unreadCount})`}</span>
 *     )}
 *   </Support.Trigger>
 * </Support>
 *
 * @example
 * // With custom pages
 * <Support>
 *   <Support.Page name="FAQ" component={FAQPage} />
 * </Support>
 *
 * @example
 * // Responsive embed mode
 * <div className="h-[640px]">
 *   <Support mode="responsive" />
 * </div>
 */
function SupportComponentInner<Locale extends string = SupportLocale>(
	{
		className,
		mode = "floating",
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
		quickOptions,
		defaultMessages,
		locale,
		content,
		customPages,
		slots,
		slotProps,
		onConversationStart,
		onConversationEnd,
		onMessageSent,
		onMessageReceived,
		onError,
		children,
	}: SupportProps<Locale>,
	ref: React.Ref<SupportHandle>
): React.ReactElement | null {
	const { website, configurationError } = useSupport();

	// Parse children to detect custom components
	const parsed = parseChildren(children);
	const declarativePages = React.useMemo(
		() => extractCustomPagesFromNodes(parsed.pages),
		[parsed.pages]
	);
	const mergedCustomPages = React.useMemo(
		() => mergeCustomPages(customPages, declarativePages),
		[customPages, declarativePages]
	);

	// Determine which components to render
	const triggerElement =
		parsed.trigger ??
		(mode === "floating" ? (
			<DefaultTrigger className={classNames.trigger} />
		) : null);

	// Show configuration error inside the widget content when API key is missing
	// This allows the user to see the widget is installed correctly and get setup instructions
	const contentElement = parsed.content ?? (
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
			) : website ? (
				<Router customPages={mergedCustomPages} />
			) : null}
		</Content>
	);

	return (
		<SupportRuntimeBoundary
			content={content}
			customPages={mergedCustomPages}
			defaultMessages={defaultMessages}
			defaultOpen={defaultOpen}
			forwardedRef={ref}
			locale={locale}
			mode={mode}
			onConversationEnd={onConversationEnd}
			onConversationStart={onConversationStart}
			onError={onError}
			onMessageReceived={onMessageReceived}
			onMessageSent={onMessageSent}
			onOpenChange={onOpenChange}
			open={open}
			quickOptions={quickOptions}
			slotProps={slotProps}
			slots={slots}
			theme={theme}
		>
			<Root className={className}>
				{triggerElement}
				{contentElement}
			</Root>
		</SupportRuntimeBoundary>
	);
}

// Forward ref with proper generic typing
const SupportComponent = React.forwardRef(SupportComponentInner) as <
	Locale extends string = SupportLocale,
>(
	props: SupportProps<Locale> & { ref?: React.Ref<SupportHandle> }
) => React.ReactElement | null;

// =============================================================================
// Trigger Compound Component
// =============================================================================

export type SupportTriggerProps = Omit<
	React.ButtonHTMLAttributes<HTMLButtonElement>,
	"children"
> & {
	/**
	 * Content to render inside the trigger.
	 * Can be static content or a function receiving render props.
	 */
	children?: React.ReactNode | ((props: TriggerRenderProps) => React.ReactNode);
	/**
	 * When true, renders children directly with all props passed through.
	 */
	asChild?: boolean;
	className?: string;
};

/**
 * Custom trigger component for the support widget.
 * Use this inside <Support> to replace the default floating button.
 *
 * @example
 * <Support.Trigger className="my-button">
 *   {({ isOpen, unreadCount }) => (
 *     <span>{isOpen ? "Close" : `Help (${unreadCount})`}</span>
 *   )}
 * </Support.Trigger>
 */
const SupportTrigger = React.forwardRef<HTMLButtonElement, SupportTriggerProps>(
	({ children, className, asChild = false, ...props }, ref) => (
		<Primitive.Trigger
			asChild={asChild}
			className={className}
			ref={ref}
			{...props}
		>
			{children}
		</Primitive.Trigger>
	)
);

SupportTrigger.displayName = "Support.Trigger";

// =============================================================================
// Content Compound Component
// =============================================================================

export type SupportContentProps = {
	className?: string;
	/**
	 * Which side of the trigger to place the content.
	 * @default "top"
	 */
	side?: Side;
	/**
	 * Alignment along the side axis.
	 * @default "end"
	 */
	align?: Align;
	/**
	 * Distance (in pixels) between the trigger and the content.
	 * @default 16
	 */
	sideOffset?: number;
	/**
	 * Enable automatic collision avoidance.
	 * When true, the content repositions to stay within the viewport.
	 * @default true
	 */
	avoidCollisions?: boolean;
	/**
	 * Padding from viewport edges when avoiding collisions.
	 * @default 8
	 */
	collisionPadding?: CollisionPadding;
	children?: React.ReactNode;
};

/**
 * Custom content wrapper for the support widget.
 * Use this inside <Support> for custom positioning or styling.
 *
 * @example
 * <Support>
 *   <Support.Trigger>Help</Support.Trigger>
 *   <Support.Content side="bottom" align="end" className="my-content">
 *     <Support.Router />
 *   </Support.Content>
 * </Support>
 */
const SupportContent: React.FC<SupportContentProps> = ({
	className,
	side = "top",
	align = "end",
	sideOffset = 16,
	avoidCollisions = true,
	collisionPadding = 8,
	children,
}) => {
	const customPages = useSupportCustomPages();

	return (
		<Content
			align={align}
			avoidCollisions={avoidCollisions}
			className={className}
			collisionPadding={collisionPadding}
			side={side}
			sideOffset={sideOffset}
		>
			{children ?? <Router customPages={customPages} />}
		</Content>
	);
};

(SupportContent as React.FC & { displayName?: string }).displayName =
	"Support.Content";

// =============================================================================
// Router Compound Component
// =============================================================================

export type SupportRouterProps = {
	/**
	 * Custom pages to add alongside built-in pages.
	 */
	customPages?: CustomPage[];
	/**
	 * Page components to register.
	 */
	children?: React.ReactNode;
};

/**
 * Router with all default pages (Home, Conversation, etc.).
 * Use inside <Support.Content> for full control.
 *
 * @example
 * <Support.Content>
 *   <Support.Router />
 * </Support.Content>
 *
 * @example
 * // With custom pages
 * <Support.Router>
 *   <Support.Page name="FAQ" component={FAQPage} />
 * </Support.Router>
 */
const SupportRouter: React.FC<SupportRouterProps> = ({
	customPages,
	children,
}) => <Router customPages={customPages}>{children}</Router>;

(SupportRouter as React.FC & { displayName?: string }).displayName =
	"Support.Router";

// =============================================================================
// Page Compound Component
// =============================================================================

export type SupportPageProps<
	K extends
		keyof import("@cossistant/core").RouteRegistry = keyof import("@cossistant/core").RouteRegistry,
> = {
	name: K;
	component: React.ComponentType<{
		params?: import("@cossistant/core").RouteRegistry[K];
	}>;
};

/**
 * Declarative page registration for custom routes.
 *
 * @example
 * <Support>
 *   <Support.Page name="FAQ" component={FAQPage} />
 *   <Support.Page name="SETTINGS" component={SettingsPage} />
 * </Support>
 */
const SupportPage = Page;

(SupportPage as unknown as { displayName?: string }).displayName =
	"Support.Page";

// =============================================================================
// Root Compound Component (for full composition)
// =============================================================================

export type SupportRootProps = {
	/**
	 * Layout mode for the support widget.
	 * When set to `responsive`, the widget always renders inline and
	 * `open`, `onOpenChange`, and `defaultOpen` are ignored for visibility.
	 * @default "floating"
	 */
	mode?: SupportMode;
	/**
	 * Controlled open state.
	 * When provided, the widget operates in controlled mode.
	 */
	open?: boolean;
	/**
	 * Callback fired when the open state should change.
	 * Use with `open` prop for controlled mode.
	 */
	onOpenChange?: (open: boolean) => void;
	/**
	 * Whether the widget should open automatically (uncontrolled mode).
	 * Ignored when `open` prop is provided.
	 * @default false
	 */
	defaultOpen?: boolean;
	/**
	 * Force a specific theme.
	 */
	theme?: "light" | "dark";
	/**
	 * Locale string for widget translations.
	 */
	locale?: SupportLocale;
	/**
	 * Custom text content overrides for internationalization.
	 */
	content?: SupportTextContentOverrides;
	/**
	 * Custom welcome messages shown before a conversation starts.
	 */
	defaultMessages?: DefaultMessage[];
	/**
	 * Quick reply options displayed to users.
	 */
	quickOptions?: string[];
	/**
	 * Custom pages to add to the router when using the built-in router/content.
	 */
	customPages?: CustomPage[];
	/**
	 * Quick component overrides for specific parts of the default widget.
	 */
	slots?: SupportSlots;
	/**
	 * Additional props applied to slot components and key built-in parts.
	 */
	slotProps?: SupportSlotProps;
	/**
	 * Additional CSS classes.
	 */
	className?: string;
	/**
	 * Called when a new conversation is started.
	 */
	onConversationStart?: (event: ConversationStartEvent) => void;
	/**
	 * Called when a conversation ends.
	 */
	onConversationEnd?: (event: ConversationEndEvent) => void;
	/**
	 * Called when the visitor sends a message.
	 */
	onMessageSent?: (event: MessageSentEvent) => void;
	/**
	 * Called when a message is received from an agent.
	 */
	onMessageReceived?: (event: MessageReceivedEvent) => void;
	/**
	 * Called when an error occurs.
	 */
	onError?: (event: ErrorEvent) => void;
	children: React.ReactNode;
};

/**
 * Root component for full composition mode.
 * Use when you need complete control over the widget structure.
 *
 * @example
 * // Uncontrolled
 * <Support.Root defaultOpen={false}>
 *   <Support.Trigger asChild>
 *     <button>Help</button>
 *   </Support.Trigger>
 *   <Support.Content side="bottom" align="end">
 *     <Support.Router />
 *   </Support.Content>
 * </Support.Root>
 *
 * @example
 * // Controlled
 * const [isOpen, setIsOpen] = useState(false);
 * <Support.Root open={isOpen} onOpenChange={setIsOpen}>
 *   ...
 * </Support.Root>
 *
 * @example
 * // With imperative ref
 * const supportRef = useRef<SupportHandle>(null);
 * <Support.Root ref={supportRef}>
 *   ...
 * </Support.Root>
 *
 * @example
 * <div className="h-[640px]">
 *   <Support.Root mode="responsive">
 *     <Support.Content />
 *   </Support.Root>
 * </div>
 */
const SupportRoot = React.forwardRef<SupportHandle, SupportRootProps>(
	(
		{
			mode = "floating",
			open,
			onOpenChange,
			defaultOpen,
			theme,
			locale,
			content,
			defaultMessages,
			quickOptions,
			customPages,
			slots,
			slotProps,
			className,
			onConversationStart,
			onConversationEnd,
			onMessageSent,
			onMessageReceived,
			onError,
			children,
		},
		ref
	) => (
		<SupportRuntimeBoundary
			content={content}
			customPages={customPages}
			defaultMessages={defaultMessages}
			defaultOpen={defaultOpen}
			forwardedRef={ref}
			locale={locale}
			mode={mode}
			onConversationEnd={onConversationEnd}
			onConversationStart={onConversationStart}
			onError={onError}
			onMessageReceived={onMessageReceived}
			onMessageSent={onMessageSent}
			onOpenChange={onOpenChange}
			open={open}
			quickOptions={quickOptions}
			slotProps={slotProps}
			slots={slots}
			theme={theme}
		>
			<Root className={className}>{children}</Root>
		</SupportRuntimeBoundary>
	)
);

SupportRoot.displayName = "Support.Root";

// =============================================================================
// Compound Component Assembly
// =============================================================================

export const Support = Object.assign(SupportComponent, {
	Root: SupportRoot,
	Trigger: SupportTrigger,
	Content: SupportContent,
	Router: SupportRouter,
	Page: SupportPage,
	Header: HeaderSlot,
	Footer: FooterSlot,
});

export default Support;

// =============================================================================
// Type Exports
// =============================================================================

export type {
	DefaultRoutes,
	NavigationState,
	RouteRegistry,
	SupportPage as SupportPageType,
} from "@cossistant/core";
export type {
	SupportComposerSlotProps,
	SupportConfigurationErrorSlotProps,
	SupportContentSlotProps,
	SupportConversationHistoryPageSlotProps,
	SupportConversationPageSlotProps,
	SupportFooterSlotProps,
	SupportHeaderSlotProps,
	SupportHomePageSlotProps,
	SupportSlotProps,
	SupportSlots,
	SupportTimelineSlotProps,
	SupportTriggerSlotProps,
	SupportWatermarkSlotProps,
} from "./context/slot-overrides";
// Custom page type
export type { CustomPage } from "./router";
// Types from ./types.ts
export type {
	Align,
	CollisionPadding,
	ContentProps,
	RootProps,
	Side,
	SupportMode,
	TriggerRenderProps,
} from "./types";

// =============================================================================
// Component Exports
// =============================================================================

export type { CossistantButtonProps as SupportButtonProps } from "./components/button";
export {
	/**
	 * @deprecated Use `SupportButton` instead. `Button` collides with the
	 * headless `Button` primitive from `@cossistant/react/primitives/button`.
	 */
	CoButton as Button,
	CoButton as SupportButton,
} from "./components/button";
export { Header } from "./components/header";

// =============================================================================
// Hook Exports
// =============================================================================

export type { WebSocketContextValue } from "./context/websocket";
export { useWebSocket, WebSocketProvider } from "./context/websocket";
export {
	useSupportConfig,
	useSupportNavigation,
	useSupportStore,
} from "./store";

// =============================================================================
// Text & Localization
// =============================================================================

export type { SupportLocale, SupportTextContentOverrides } from "./text";
export { Text, useSupportText } from "./text";

// =============================================================================
// Events
// =============================================================================

export type {
	ConversationEndEvent,
	ConversationStartEvent,
	ErrorEvent,
	MessageReceivedEvent,
	MessageSentEvent,
	SupportEvent,
	SupportEventCallbacks,
	SupportEventType,
} from "./context/events";
export { useSupportEventEmitter, useSupportEvents } from "./context/events";

// =============================================================================
// Imperative Handle
// =============================================================================

export type { SupportHandle } from "./context/handle";
export { useSupportHandle } from "./context/handle";
