import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminView } from "./use-admin-users-controls";

let adminView: AdminView = "users";
const setAdminViewCalls: AdminView[] = [];
const setSearchTermCalls: string[] = [];
let capturedSegmentedControlProps: {
	value: AdminView;
	onValueChange: (value: AdminView) => void;
	options: Array<{ value: AdminView; label: React.ReactNode }>;
} | null = null;
let capturedInputPlaceholder = "";

mock.module("@tanstack/react-query", () => ({
	useMutation: (options: { onSuccess?: () => void } = {}) => ({
		isPending: false,
		mutate: () => {
			options.onSuccess?.();
		},
	}),
	useQuery: (options?: { queryKey?: unknown[] }) => ({
		data:
			options?.queryKey?.[0] === "aiAgent"
				? {
						onboardingCompletedAt: "2026-03-10T00:00:00.000Z",
					}
				: null,
	}),
}));

mock.module("next/link", () => ({
	default: ({
		children,
		href,
	}: {
		children: React.ReactNode;
		href: string;
	}) => <a href={href}>{children}</a>,
}));

mock.module("@cossistant/next/hooks", () => ({
	useConversations: () => ({
		conversations: [],
	}),
}));

mock.module("@cossistant/next/provider", () => ({
	useSupport: () => ({
		client: null,
		unreadCount: 0,
	}),
}));

mock.module("@cossistant/next/support", () => ({
	useSupportNavigation: () => ({
		navigate: () => {},
	}),
}));

mock.module("@/components/navigation-dropdown", () => ({
	NavigationDropdown: () => <div>Navigation</div>,
}));

mock.module("@/components/plan/sidebar-upgrade-button", () => ({
	SidebarUpgradeButton: () => <div>Upgrade</div>,
}));

mock.module("@/components/ui/input", () => ({
	Input: ({
		onChange,
		placeholder,
		value,
	}: {
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string;
	}) => {
		capturedInputPlaceholder = placeholder ?? "";
		return (
			<input
				onChange={(event) =>
					onChange?.({ target: { value: event.target.value } })
				}
				placeholder={placeholder}
				value={value}
			/>
		);
	},
}));

mock.module("@/components/ui/layout/sidebars/container", () => ({
	SidebarContainer: ({
		children,
		footer,
	}: {
		children: React.ReactNode;
		footer: React.ReactNode;
	}) => (
		<div>
			{children}
			{footer}
		</div>
	),
}));

mock.module("@/components/ui/layout/sidebars/resizable-sidebar", () => ({
	ResizableSidebar: ({ children }: { children: React.ReactNode }) => (
		<aside>{children}</aside>
	),
}));

mock.module("@/components/ui/segmented-control", () => ({
	SegmentedControl: (props: {
		value: AdminView;
		onValueChange: (value: AdminView) => void;
		options: Array<{ value: AdminView; label: React.ReactNode }>;
	}) => {
		capturedSegmentedControlProps = props;
		return (
			<div>
				{props.options.map((option) => (
					<span key={option.value}>{option.label}</span>
				))}
			</div>
		);
	},
}));

mock.module("@/components/ui/separator", () => ({
	Separator: () => <hr />,
}));

mock.module("@/contexts/website", () => ({
	useWebsite: () => ({
		slug: "acme",
	}),
}));

mock.module("@/hooks/use-support-overlay-state", () => ({
	useSupportOverlayState: () => ({
		isOpen: false,
		openSupportOverlay: () => Promise.resolve(new URLSearchParams()),
	}),
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		plan: {
			getPlanInfo: {
				queryOptions: () => ({
					queryKey: ["plan.getPlanInfo"],
				}),
			},
		},
	}),
}));

mock.module("./use-admin-users-controls", () => ({
	useAdminUsersControls: () => ({
		adminView,
		debouncedSearchTerm: "",
		searchTerm: "",
		setAdminView: (value: AdminView) => {
			setAdminViewCalls.push(value);
		},
		setSearchTerm: (value: string) => {
			setSearchTermCalls.push(value);
		},
	}),
}));

function resetState() {
	adminView = "users";
	setAdminViewCalls.length = 0;
	setSearchTermCalls.length = 0;
	capturedSegmentedControlProps = null;
	capturedInputPlaceholder = "";
}

describe("AdminNavigationSidebar", () => {
	it("toggles between users and websites and updates search copy", async () => {
		resetState();
		const { AdminNavigationSidebar } = await import(
			`./admin-navigation-sidebar?${Math.random()}`
		);

		const usersHtml = renderToStaticMarkup(<AdminNavigationSidebar />);

		expect(usersHtml).toContain("Users");
		expect(usersHtml).toContain("Websites");
		expect(usersHtml.indexOf("Support")).toBeLessThan(
			usersHtml.indexOf("Docs")
		);
		expect(capturedSegmentedControlProps?.value).toBe("users");
		expect(capturedInputPlaceholder).toBe("Search by name or email");

		capturedSegmentedControlProps?.onValueChange("websites");
		expect(setAdminViewCalls).toEqual(["websites"]);

		adminView = "websites";
		renderToStaticMarkup(<AdminNavigationSidebar />);

		expect(capturedSegmentedControlProps?.value).toBe("websites");
		expect(capturedInputPlaceholder).toBe("Search by site, slug, domain");
	});
});
