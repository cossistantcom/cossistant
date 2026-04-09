import "./support.css";

import type { DefaultMessage } from "@plasma/types";
import * as React from "react";
import { useSupportController } from "../controller-context";
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

// =============================================================================
// Child Component Detection
// =============================================================================

type ParsedChildren = {
	trigger: React.ReactNode | null;
	content: React.ReactNode | null;
	pages: React.ReactNode[];
	other: React.ReactNode[];
};

function parseChildren(children: React.ReactNode): ParsedChildren {
	const result: ParsedChildren = {
		trigger: null,
		content: null,
		pages: [],
		other: [],
	};

	React.Children.forEach(children, (child) => {
		if (!React.isValidElement(child)) {
			result.other.push(child);
			return;
		}

		// Check component type by displayName or the component reference
		const displayName = (child.type as React.ComponentType)?.displayName ?? "";

		if (displayName === "Support.Trigger" || child.type === SupportTrigger) {
			result.trigger = child;
		} else if (
			displayName === "Support.Content" ||
			child.type === SupportContent
		) {
			result.content = child;
		} else if (displayName === "Support.Page" || child.type === Page) {
			result.pages.push(child);
		} else {
			result.other.push(child);
		}
	});

	return result;
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
	const controller = useSupportController();
	const isVisitorBlocked = website?.visitor?.isBlocked ?? false;

	// Initialize store for uncontrolled mode (when open prop is not provided)
	React.useEffect(() => {
		if (
			mode === "floating" &&
			open === undefined &&
			defaultOpen !== undefined
		) {
			controller.updateSupportConfig({ isOpen: defaultOpen });
		}
	}, [controller, defaultOpen, mode, open]);

	// If visitor is blocked, don't render anything
	if (website && isVisitorBlocked) {
		return null;
	}

	// Parse children to detect custom components
	const parsed = parseChildren(children);

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
				<Router customPages={customPages}>{parsed.pages}</Router>
			) : null}
		</Content>
	);

	// When there's a configuration error, render a minimal version without realtime/events
	if (configurationError) {
		return (
			<SupportModeProvider mode={mode}>
				<ControlledStateProvider onOpenChange={onOpenChange} open={open}>
					<SupportHandleProvider forwardedRef={ref}>
						<ThemeWrapper theme={theme}>
							<Root className={className}>
								{triggerElement}
								{contentElement}
							</Root>
						</ThemeWrapper>
					</SupportHandleProvider>
				</ControlledStateProvider>
			</SupportModeProvider>
		);
	}

	// Don't render anything while loading or if no website
	if (!website) {
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
					<SupportHandleProvider forwardedRef={ref}>
						<ThemeWrapper theme={theme}>
							<SupportRealtimeProvider>
								<SupportTextProvider content={content} locale={locale}>
									<Root className={className}>
										{triggerElement}
										{contentElement}
									</Root>
								</SupportTextProvider>
							</SupportRealtimeProvider>
							<SupportConfig
								defaultMessages={defaultMessages}
								quickOptions={quickOptions}
							/>
						</ThemeWrapper>
					</SupportHandleProvider>
				</SupportEventsProvider>
			</ControlledStateProvider>
		</SupportModeProvider>
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
}) => (
	<Content
		align={align}
		avoidCollisions={avoidCollisions}
		className={className}
		collisionPadding={collisionPadding}
		side={side}
		sideOffset={sideOffset}
	>
		{children ?? <Router />}
	</Content>
);

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
		keyof import("@plasma/core").RouteRegistry = keyof import("@plasma/core").RouteRegistry,
> = {
	name: K;
	component: React.ComponentType<{
		params?: import("@plasma/core").RouteRegistry[K];
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
			className,
			onConversationStart,
			onConversationEnd,
			onMessageSent,
			onMessageReceived,
			onError,
			children,
		},
		ref
	) => {
		const { website, configurationError } = useSupport();
		const controller = useSupportController();
		const isVisitorBlocked = website?.visitor?.isBlocked ?? false;

		// Initialize store for uncontrolled mode
		React.useEffect(() => {
			if (
				mode === "floating" &&
				open === undefined &&
				defaultOpen !== undefined
			) {
				controller.updateSupportConfig({ isOpen: defaultOpen });
			}
		}, [controller, defaultOpen, mode, open]);

		// If visitor is blocked, don't render anything
		if (website && isVisitorBlocked) {
			return null;
		}

		// When there's a configuration error, render a minimal version without realtime/events
		// The children (Trigger + Content) will still render, but Content should show the error
		if (configurationError) {
			return (
				<SupportModeProvider mode={mode}>
					<ControlledStateProvider onOpenChange={onOpenChange} open={open}>
						<SupportHandleProvider forwardedRef={ref}>
							<ThemeWrapper theme={theme}>
								<Root className={className}>{children}</Root>
							</ThemeWrapper>
						</SupportHandleProvider>
					</ControlledStateProvider>
				</SupportModeProvider>
			);
		}

		// Don't render anything while loading or if no website
		if (!website) {
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
						<SupportHandleProvider forwardedRef={ref}>
							<ThemeWrapper theme={theme}>
								<SupportRealtimeProvider>
									<Root className={className}>{children}</Root>
								</SupportRealtimeProvider>
							</ThemeWrapper>
						</SupportHandleProvider>
					</SupportEventsProvider>
				</ControlledStateProvider>
			</SupportModeProvider>
		);
	}
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
} from "@plasma/core";
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

export { CoButton as Button } from "./components/button";
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
