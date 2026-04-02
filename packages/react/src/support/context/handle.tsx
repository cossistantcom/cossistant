"use client";

import type { RouteRegistry } from "@plasma/core";
import * as React from "react";
import { PENDING_CONVERSATION_ID } from "../../utils/id";
import { useSupportConfig, useSupportNavigation } from "../store/support-store";

// =============================================================================
// Handle Type
// =============================================================================

/**
 * Imperative handle for programmatic control of the Support widget.
 * Access via ref on the Support component or via useSupportHandle hook.
 *
 * @example
 * const supportRef = useRef<SupportHandle>(null);
 *
 * // Open the widget
 * supportRef.current?.open();
 *
 * // Navigate to a conversation
 * supportRef.current?.openConversation("conv_123");
 *
 * // Start a new conversation with a message
 * supportRef.current?.startConversation("I need help with...");
 *
 * <Support ref={supportRef} />
 */
export type SupportHandle = {
	/**
	 * Open the support widget.
	 */
	open: () => void;
	/**
	 * Close the support widget.
	 */
	close: () => void;
	/**
	 * Toggle the support widget open/closed.
	 */
	toggle: () => void;
	/**
	 * Navigate to a specific page with optional params.
	 */
	navigate: <K extends keyof RouteRegistry>(options: {
		page: K;
		params?: RouteRegistry[K];
	}) => void;
	/**
	 * Go back to the previous page.
	 */
	goBack: () => void;
	/**
	 * Open a specific conversation.
	 */
	openConversation: (conversationId: string) => void;
	/**
	 * Start a new conversation, optionally with an initial message.
	 */
	startConversation: (initialMessage?: string) => void;
	/**
	 * Navigate to the home page.
	 */
	goHome: () => void;
};

// =============================================================================
// Context
// =============================================================================

const SupportHandleContext = React.createContext<SupportHandle | null>(null);

export type SupportHandleProviderProps = {
	/**
	 * Ref to expose the handle to parent components.
	 */
	forwardedRef?: React.Ref<SupportHandle>;
	children: React.ReactNode;
};

/**
 * Provider that creates and exposes the imperative handle.
 */
export const SupportHandleProvider: React.FC<SupportHandleProviderProps> = ({
	forwardedRef,
	children,
}) => {
	const { open, close, toggle } = useSupportConfig();
	const { navigate, goBack } = useSupportNavigation();

	const handle = React.useMemo<SupportHandle>(
		() => ({
			open,
			close,
			toggle,
			navigate: <K extends keyof RouteRegistry>(options: {
				page: K;
				params?: RouteRegistry[K];
			}) => {
				// Use type assertion since we know the navigate function accepts these types
				navigate(options as Parameters<typeof navigate>[0]);
			},
			goBack,
			openConversation: (conversationId: string) => {
				navigate({
					page: "CONVERSATION",
					params: { conversationId },
				});
				// Also open the widget if closed
				open();
			},
			startConversation: (initialMessage?: string) => {
				navigate({
					page: "CONVERSATION",
					params: {
						conversationId: PENDING_CONVERSATION_ID,
						initialMessage,
					},
				});
				// Also open the widget if closed
				open();
			},
			goHome: () => {
				navigate({ page: "HOME" });
			},
		}),
		[open, close, toggle, navigate, goBack]
	);

	// Expose handle via ref
	React.useImperativeHandle(forwardedRef, () => handle, [handle]);

	return (
		<SupportHandleContext.Provider value={handle}>
			{children}
		</SupportHandleContext.Provider>
	);
};

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the imperative handle from within the widget.
 * Returns null if not inside Support component.
 *
 * @example
 * function MyComponent() {
 *   const support = useSupportHandle();
 *
 *   return (
 *     <button onClick={() => support?.startConversation("Hello!")}>
 *       Get Help
 *     </button>
 *   );
 * }
 */
export function useSupportHandle(): SupportHandle | null {
	return React.useContext(SupportHandleContext);
}
