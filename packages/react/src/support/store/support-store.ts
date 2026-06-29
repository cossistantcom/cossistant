"use client";

import type {
	SupportConfig,
	SupportNavigation,
	SupportStore,
	SupportStoreState,
} from "@cossistant/core";
import { useCallback, useMemo } from "react";
import {
	useOptionalSupportController,
	useSupportController,
} from "../../controller-context";
import { useStoreSelector } from "../../hooks/private/store/use-store-selector";
import { useControlledState } from "../context/controlled-state";
import { useSupportMode } from "../context/mode";

export type UseSupportStoreResult = SupportStoreState &
	Pick<
		SupportStore,
		| "navigate"
		| "replace"
		| "goBack"
		| "open"
		| "close"
		| "toggle"
		| "updateConfig"
		| "reset"
	>;

/**
 * Access the support widget store state and actions.
 *
 * @example
 * const { isOpen, navigate, toggle } = useSupportStore();
 */
export function useSupportStore(): UseSupportStoreResult {
	const controller = useSupportController();
	const state = useStoreSelector(controller.supportStore, (current) => current);

	return useMemo(
		() => ({
			...state,
			navigate: controller.navigate,
			replace: controller.replace,
			goBack: controller.goBack,
			open: controller.open,
			close: controller.close,
			toggle: controller.toggle,
			updateConfig: controller.updateSupportConfig,
			reset: controller.supportStore.reset,
		}),
		[controller, state]
	);
}

export type UseSupportConfigResult = {
	/**
	 * Whether the support widget is currently open.
	 */
	isOpen: boolean;
	/**
	 * Current widget size configuration.
	 */
	size: SupportConfig["size"];
	/**
	 * Open the widget.
	 *
	 * @returns void
	 */
	open: () => void;
	/**
	 * Close the widget.
	 *
	 * @returns void
	 */
	close: () => void;
	/**
	 * Toggle the widget open or closed.
	 *
	 * @returns void
	 */
	toggle: () => void;
};

export type UseSupportNavigationResult = {
	/**
	 * Current navigation state with page and params.
	 *
	 * @remarks `NavigationState`
	 * @fumadocsType `NavigationState`
	 */
	current: SupportNavigation["current"];
	/**
	 * Current page name.
	 *
	 * @remarks `SupportPage`
	 * @fumadocsType `SupportPage`
	 */
	page: SupportNavigation["current"]["page"];
	/**
	 * Current page parameters.
	 *
	 * @remarks `RouteParams | undefined`
	 * @fumadocsType `RouteParams | undefined`
	 */
	params: SupportNavigation["current"]["params"];
	/**
	 * Navigation history stack.
	 *
	 * @remarks `NavigationState[]`
	 * @fumadocsType `NavigationState[]`
	 */
	previousPages: SupportNavigation["previousPages"];
	/**
	 * Navigate to a page and push the current state to history.
	 *
	 * @remarks `(options: { page: SupportPage; params?: RouteParams }) => void`
	 * @fumadocsType `(options: { page: SupportPage; params?: RouteParams }) => void`
	 *
	 * @returns void
	 */
	navigate: SupportStore["navigate"];
	/**
	 * Replace the current page without pushing to history.
	 *
	 * @remarks `(options: { page: SupportPage; params?: RouteParams }) => void`
	 * @fumadocsType `(options: { page: SupportPage; params?: RouteParams }) => void`
	 *
	 * @returns void
	 */
	replace: SupportStore["replace"];
	/**
	 * Go back to the previous page in history.
	 *
	 * @returns void
	 */
	goBack: SupportStore["goBack"];
	/**
	 * Whether there is at least one page in history to go back to.
	 */
	canGoBack: boolean;
};

/**
 * Access widget configuration (isOpen, size) and toggle helpers.
 * Supports both controlled and uncontrolled modes.
 * In responsive mode, the widget is treated as always open and
 * open/close/toggle become no-ops.
 *
 * In controlled mode (when `open` prop is provided to Support),
 * the `isOpen` state is driven by the prop, and `open`/`close`/`toggle`
 * will call `onOpenChange` instead of updating internal state.
 *
 * @example
 * // Uncontrolled (internal state)
 * const { isOpen, open, close, toggle } = useSupportConfig();
 *
 * @example
 * // Controlled (external state via Support props)
 * <Support open={isOpen} onOpenChange={setIsOpen}>
 *   <MyComponent />
 * </Support>
 */
export const useOptionalSupportConfig = (): UseSupportConfigResult | null => {
	const controller = useOptionalSupportController();
	const config = useStoreSelector(
		controller?.supportStore ?? null,
		(state: SupportStoreState | null) => state?.config ?? null
	);
	const controlledState = useControlledState();
	const mode = useSupportMode();

	// Determine if we're in controlled mode
	const isControlled = controlledState?.isControlled ?? false;
	const controlledOpen = controlledState?.open;
	const onOpenChange = controlledState?.onOpenChange;
	const isResponsive = mode === "responsive";
	const hasRuntime = Boolean(controller && config);

	// Use controlled state if available, otherwise use store state
	const isOpen = isResponsive
		? true
		: isControlled
			? (controlledOpen ?? false)
			: (config?.isOpen ?? false);

	// Create wrapped actions that respect controlled mode
	const open = useCallback(() => {
		if (!(controller && config) || isResponsive) {
			return;
		}

		if (isControlled && onOpenChange) {
			onOpenChange(true);
		} else {
			controller.open();
		}
	}, [config, controller, isControlled, isResponsive, onOpenChange]);

	const close = useCallback(() => {
		if (!(controller && config) || isResponsive) {
			return;
		}

		if (isControlled && onOpenChange) {
			onOpenChange(false);
		} else {
			controller.close();
		}
	}, [config, controller, isControlled, isResponsive, onOpenChange]);

	const toggle = useCallback(() => {
		if (!(controller && config) || isResponsive) {
			return;
		}

		if (isControlled && onOpenChange) {
			onOpenChange(!controlledOpen);
		} else {
			controller.toggle();
		}
	}, [
		config,
		controller,
		isControlled,
		isResponsive,
		onOpenChange,
		controlledOpen,
	]);

	return useMemo(
		() =>
			hasRuntime && config
				? {
						isOpen,
						size: config.size,
						open,
						close,
						toggle,
					}
				: null,
		[hasRuntime, config, isOpen, open, close, toggle]
	);
};

export const useSupportConfig = (): UseSupportConfigResult => {
	const config = useOptionalSupportConfig();

	if (!config) {
		throw new Error(
			"useSupportConfig must be used within a cossistant SupportProvider"
		);
	}

	return config;
};

/**
 * Access navigation state and routing methods.
 *
 * @example
 * const { navigate, goBack, page, params } = useSupportNavigation();
 */
export const useSupportNavigation = (): UseSupportNavigationResult => {
	const controller = useSupportController();
	const navigation = useStoreSelector(
		controller.supportStore,
		(state) => state.navigation
	);
	const { current, previousPages } = navigation;

	return useMemo(
		() => ({
			current,
			page: current.page,
			params: current.params,
			previousPages,
			navigate: controller.navigate,
			replace: controller.replace,
			goBack: controller.goBack,
			canGoBack: previousPages.length > 0,
		}),
		[controller, current, previousPages]
	);
};
