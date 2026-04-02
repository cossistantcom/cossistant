import type { RouteRegistry } from "@plasma/core";
import * as React from "react";
import type { PageDefinition } from "../primitives";
import * as Primitive from "../primitives";
import { useSupport } from "../provider";
import { ConfigurationErrorDisplay } from "./components/configuration-error";
import { ArticlesPage } from "./pages/articles";
import { ConversationPage } from "./pages/conversation";
import { ConversationHistoryPage } from "./pages/conversation-history";
import { HomePage } from "./pages/home";
import { useSupportNavigation } from "./store/support-store";

/**
 * Type for custom pages that ensures they match RouteRegistry.
 */
export type CustomPage<K extends keyof RouteRegistry = keyof RouteRegistry> = {
	name: K;
	component: React.ComponentType<{ params?: RouteRegistry[K] }>;
};

export type RouterProps = {
	/**
	 * Custom pages to add alongside the built-in pages.
	 */
	customPages?: CustomPage[];
	/**
	 * Children can include <Support.Page /> components.
	 */
	children?: React.ReactNode;
};

/**
 * Built-in pages that are always available.
 * Type assertion is needed because each page component has different param types,
 * but they all satisfy the PageDefinition interface.
 */
const builtInPages = [
	{ name: "HOME", component: HomePage },
	{ name: "ARTICLES", component: ArticlesPage },
	{ name: "CONVERSATION", component: ConversationPage },
	{ name: "CONVERSATION_HISTORY", component: ConversationHistoryPage },
] as PageDefinition[];

/**
 * Extract page definitions from Support.Page children.
 * This allows declarative page registration via JSX.
 */
function extractPagesFromChildren(children: React.ReactNode): CustomPage[] {
	const pages: CustomPage[] = [];

	React.Children.forEach(children, (child) => {
		if (!React.isValidElement(child)) {
			return;
		}

		// Check if this is a Page component by looking for name and component props
		const props = child.props as {
			name?: string;
			component?: React.ComponentType;
		};
		if (props.name && props.component) {
			pages.push({
				name: props.name as keyof RouteRegistry,
				component: props.component,
			});
		}
	});

	return pages;
}

/**
 * Router with default support pages (HOME, ARTICLES, CONVERSATION, CONVERSATION_HISTORY).
 * Add custom pages via the customPages prop or as children.
 *
 * @example
 * // Default pages only
 * <Support.Router />
 *
 * @example
 * // With custom pages via prop
 * <Support.Router customPages={[{ name: "FAQ", component: FAQPage }]} />
 *
 * @example
 * // With custom pages as children
 * <Support.Router>
 *   <Support.Page name="FAQ" component={FAQPage} />
 *   <Support.Page name="SETTINGS" component={SettingsPage} />
 * </Support.Router>
 */
export const Router: React.FC<RouterProps> = ({
	customPages = [],
	children,
}) => {
	const { current } = useSupportNavigation();
	const { configurationError } = useSupport();

	// Extract pages from JSX children (Support.Page components)
	const extractedPages = React.useMemo(
		() => extractPagesFromChildren(children),
		[children]
	);

	// Merge built-in pages, prop-based custom pages, and JSX-declared pages
	const allPages = React.useMemo(
		() =>
			[...builtInPages, ...customPages, ...extractedPages] as PageDefinition<
				keyof RouteRegistry
			>[],
		[customPages, extractedPages]
	);

	// Show configuration error when API key is missing/invalid
	if (configurationError) {
		return <ConfigurationErrorDisplay error={configurationError} />;
	}

	return (
		<Primitive.Router
			fallback={HomePage as React.ComponentType<{ params?: unknown }>}
			page={current.page}
			pages={allPages}
			params={current.params}
		/>
	);
};

// =============================================================================
// Page Component
// =============================================================================

export type PageProps<K extends keyof RouteRegistry = keyof RouteRegistry> = {
	/**
	 * The route name for this page.
	 */
	name: K;
	/**
	 * The component to render for this page.
	 */
	component: React.ComponentType<{ params?: RouteRegistry[K] }>;
};

/**
 * Declarative way to register custom pages.
 * This component is collected by the Router and doesn't render anything itself.
 *
 * @example
 * <Support.Router>
 *   <Support.Page name="FAQ" component={FAQPage} />
 * </Support.Router>
 */
export const Page = <K extends keyof RouteRegistry>(_props: PageProps<K>) => {
	// This component is declarative and doesn't render anything.
	// The Router collects Page children and uses them for routing.
	return null;
};
