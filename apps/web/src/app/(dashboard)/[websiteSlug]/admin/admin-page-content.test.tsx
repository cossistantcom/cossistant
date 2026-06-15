import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const actionHandlers: Array<() => void> = [];
const rowHandlers: Array<() => void> = [];
const mutationCalls: Array<{ key: string; input: unknown }> = [];
const invalidateCalls: unknown[] = [];
const confirmCalls: string[] = [];
const routerPushCalls: string[] = [];
const routerRefreshCalls: string[] = [];
const authStoreNotifyCalls: string[] = [];
const toastSuccessCalls: string[] = [];
const toastErrorCalls: string[] = [];
const queryDataByKey = new Map<string, unknown>();
const scrollAreaClassNames: string[] = [];

mock.module("@tanstack/react-query", () => ({
	useMutation: (
		options: {
			mutationKey?: string[];
			onSuccess?: (data?: {
				organizationDeleted?: boolean;
			}) => void | Promise<void>;
		} = {}
	) => ({
		isPending: false,
		mutate: (input: unknown) => {
			const key = options.mutationKey?.[0] ?? "unknown";
			mutationCalls.push({
				key,
				input,
			});
			void options.onSuccess?.(
				key === "deleteWebsiteForever"
					? { organizationDeleted: false }
					: undefined
			);
		},
	}),
	useQuery: (options: { queryKey?: unknown[] } = {}) => {
		const queryKey = options.queryKey?.[0];

		return {
			data:
				typeof queryKey === "string"
					? (queryDataByKey.get(queryKey) ?? null)
					: null,
			isError: false,
			isLoading: false,
		};
	},
	useQueryClient: () => ({
		invalidateQueries: async (input: unknown) => {
			invalidateCalls.push(input);
		},
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

mock.module("next/navigation", () => ({
	usePathname: () => "/acme/admin",
	useRouter: () => ({
		push: (href: string) => {
			routerPushCalls.push(href);
		},
		refresh: () => {
			routerRefreshCalls.push("refresh");
		},
	}),
}));

mock.module("nuqs", () => ({
	parseAsString: {},
	useQueryState: () => [null, () => Promise.resolve(null)] as const,
}));

mock.module("sonner", () => ({
	toast: {
		error: (message: string) => {
			toastErrorCalls.push(message);
		},
		success: (message: string) => {
			toastSuccessCalls.push(message);
		},
	},
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({ fallbackName }: { fallbackName: string }) => (
		<span data-slot="avatar">{fallbackName}</span>
	),
}));

mock.module("@/components/ui/badge", () => ({
	Badge: ({ children }: { children: React.ReactNode }) => (
		<span data-slot="badge">{children}</span>
	),
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		children,
		onClick,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button onClick={onClick} {...props} type={props.type ?? "button"}>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/checkbox", () => ({
	Checkbox: ({
		checked,
		disabled,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		disabled?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			checked={Boolean(checked)}
			disabled={disabled}
			id={id}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
			type="checkbox"
		/>
	),
}));

mock.module("@/components/ui/dialog", () => ({
	Dialog: ({
		children,
		open,
	}: {
		children: React.ReactNode;
		open?: boolean;
	}) => (open ? <div>{children}</div> : null),
	DialogContent: ({ children }: { children: React.ReactNode }) => (
		<section>{children}</section>
	),
	DialogDescription: ({ children }: { children: React.ReactNode }) => (
		<p>{children}</p>
	),
	DialogFooter: ({ children }: { children: React.ReactNode }) => (
		<footer>{children}</footer>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => (
		<header>{children}</header>
	),
	DialogTitle: ({ children }: { children: React.ReactNode }) => (
		<h2>{children}</h2>
	),
}));

mock.module("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({
		children,
		onClick,
	}: {
		children: React.ReactNode;
		onClick?: () => void;
	}) => {
		if (onClick) {
			actionHandlers.push(onClick);
		}

		return <button type="button">{children}</button>;
	},
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

mock.module("@/components/ui/layout", () => ({
	Page: ({ children }: { children: React.ReactNode }) => (
		<main>{children}</main>
	),
	PageHeader: ({ children }: { children: React.ReactNode }) => (
		<header>{children}</header>
	),
	PageHeaderTitle: ({ children }: { children: React.ReactNode }) => (
		<h1>{children}</h1>
	),
}));

mock.module("@/components/ui/scroll-area", () => ({
	ScrollArea: ({
		children,
		className,
	}: {
		children: React.ReactNode;
		className?: string;
	}) => {
		scrollAreaClassNames.push(className ?? "");
		return <div>{children}</div>;
	},
}));

mock.module("@/components/ui/input", () => ({
	Input: ({
		disabled,
		id,
		onChange,
		placeholder,
		value,
	}: {
		disabled?: boolean;
		id?: string;
		onChange?: (event: { target: { value: string } }) => void;
		placeholder?: string;
		value?: string;
	}) => (
		<input
			disabled={disabled}
			id={id}
			onChange={(event) =>
				onChange?.({ target: { value: event.target.value } })
			}
			placeholder={placeholder}
			value={value}
		/>
	),
}));

mock.module("@/components/ui/table", () => ({
	Table: ({ children }: { children: React.ReactNode }) => (
		<table>{children}</table>
	),
	TableBody: ({ children }: { children: React.ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({ children }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
		<td>{children}</td>
	),
	TableHead: ({ children }: { children: React.ReactNode }) => (
		<th>{children}</th>
	),
	TableHeader: ({ children }: { children: React.ReactNode }) => (
		<thead>{children}</thead>
	),
	TableRow: ({
		children,
		onClick,
	}: React.HTMLAttributes<HTMLTableRowElement>) => {
		if (onClick) {
			rowHandlers.push(() => {
				onClick({
					preventDefault() {},
					stopPropagation() {},
				} as never);
			});
		}

		return <tr>{children}</tr>;
	},
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

mock.module("@/components/ui/website-image", () => ({
	WebsiteImage: ({ name }: { name: string }) => (
		<span data-slot="website-image">{name}</span>
	),
}));

mock.module("./numeric-confirmation-sheet", () => ({
	NumericConfirmationSheet: ({
		children,
		confirmLabel,
		targetLabel,
	}: {
		children?: React.ReactNode;
		confirmLabel: string;
		targetLabel: string;
	}) => (
		<section>
			<p>{targetLabel}</p>
			{children}
			<button type="button">{confirmLabel}</button>
		</section>
	),
}));

mock.module("@/lib/auth/client", () => ({
	authClient: {
		$store: {
			notify: (signal: string) => {
				authStoreNotifyCalls.push(signal);
			},
		},
	},
}));

mock.module("@/lib/date", () => ({
	formatFullDateTime: (date: Date) => date.toISOString(),
	formatLastSeenAt: (date: Date) => date.toISOString(),
}));

mock.module("@/lib/trpc/client", () => {
	const mutationOptions =
		(key: string) =>
		(options: Record<string, unknown> = {}) => ({
			...options,
			mutationKey: [key],
		});

	return {
		useTRPC: () => ({
			admin: {
				banUser: {
					mutationOptions: mutationOptions("banUser"),
				},
				deleteWebsiteForever: {
					mutationOptions: mutationOptions("deleteWebsiteForever"),
				},
				getUserWebsites: {
					queryOptions: (input: unknown) => ({
						queryKey: ["admin.getUserWebsites", input],
					}),
				},
				getWebsiteDeletionPreview: {
					queryOptions: (input: unknown) => ({
						queryKey: ["admin.getWebsiteDeletionPreview", input],
					}),
				},
				impersonateUser: {
					mutationOptions: mutationOptions("impersonateUser"),
				},
				grantWebsiteAiUsage: {
					mutationOptions: mutationOptions("grantWebsiteAiUsage"),
				},
				getWebsiteAiUsage: {
					queryKey: (input: unknown) => ["admin.getWebsiteAiUsage", input],
					queryOptions: (input: unknown) => ({
						queryKey: ["admin.getWebsiteAiUsage", input],
					}),
				},
				listWebsites: {
					queryKey: () => ["admin.listWebsites"],
					queryOptions: (input: unknown) => ({
						queryKey: ["admin.listWebsites", input],
					}),
				},
				listUsers: {
					queryKey: () => ["admin.listUsers"],
					queryOptions: (input: unknown) => ({
						queryKey: ["admin.listUsers", input],
					}),
				},
				revokeUserSessions: {
					mutationOptions: mutationOptions("revokeUserSessions"),
				},
				unbanUser: {
					mutationOptions: mutationOptions("unbanUser"),
				},
			},
			plan: {
				getPlanInfo: {
					queryKey: (input: unknown) => ["plan.getPlanInfo", input],
				},
			},
		}),
	};
});

mock.module("@/lib/utils", () => ({
	cn: (...parts: Array<string | false | null | undefined>) =>
		parts.filter(Boolean).join(" "),
}));

mock.module("./use-admin-users-controls", () => ({
	useAdminUsersControls: () => ({
		adminView: "users",
		debouncedSearchTerm: "",
		searchTerm: "",
		setSearchTerm: () => {},
	}),
}));

const modulePromise = import("./admin-page-content");

function resetState() {
	actionHandlers.length = 0;
	rowHandlers.length = 0;
	mutationCalls.length = 0;
	invalidateCalls.length = 0;
	confirmCalls.length = 0;
	routerPushCalls.length = 0;
	routerRefreshCalls.length = 0;
	authStoreNotifyCalls.length = 0;
	toastSuccessCalls.length = 0;
	toastErrorCalls.length = 0;
	scrollAreaClassNames.length = 0;
	queryDataByKey.clear();

	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: {
			confirm: (message?: string) => {
				confirmCalls.push(message ?? "");
				return true;
			},
		},
	});
}

function createUser(overrides: Record<string, unknown> = {}) {
	return {
		id: "user-1",
		name: "Ada Lovelace",
		email: "ada@example.com",
		image: null,
		role: "user",
		banned: false,
		banReason: null,
		banExpires: null,
		createdAt: "2026-04-01T10:00:00.000Z",
		updatedAt: "2026-04-01T10:00:00.000Z",
		lastSeenAt: "2026-04-02T10:00:00.000Z",
		...overrides,
	};
}

function createWebsite(overrides: Record<string, unknown> = {}) {
	return {
		id: "site-1",
		name: "Cossistant Site",
		slug: "cossistant-site",
		domain: "cossistant.com",
		logoUrl: null,
		status: "active",
		organizationId: "org-1",
		organizationName: "Cossistant Inc",
		organizationSlug: "cossistant-inc",
		teamId: "team-1",
		createdAt: "2026-04-01T10:00:00.000Z",
		updatedAt: "2026-04-01T10:00:00.000Z",
		...overrides,
	};
}

describe("admin page content", () => {
	it("renders the users table and wires safe Better Auth actions", async () => {
		resetState();
		const { AdminUsersTable } = await modulePromise;
		const selectedUserIds: string[] = [];

		const html = renderToStaticMarkup(
			<AdminUsersTable
				data={[createUser() as never]}
				isLoading={false}
				onSelectUser={(userId) => {
					selectedUserIds.push(userId);
				}}
				selectedUserId={null}
				websiteSlug="acme"
			/>
		);

		expect(html).toContain("Ada Lovelace");
		expect(html).toContain("ada@example.com");
		expect(html).toContain("Active");
		expect(html).toContain("Ban user");
		expect(html).toContain("Revoke sessions");
		expect(html).toContain("Impersonate");

		rowHandlers[0]?.();
		actionHandlers[0]?.();
		actionHandlers[1]?.();
		actionHandlers[2]?.();

		expect(selectedUserIds).toEqual(["user-1"]);
		expect(confirmCalls).toEqual([
			"Ban ada@example.com?",
			"Revoke all sessions for ada@example.com?",
			"Impersonate ada@example.com?",
		]);
		expect(mutationCalls).toEqual([
			{ key: "banUser", input: { userId: "user-1" } },
			{ key: "revokeUserSessions", input: { userId: "user-1" } },
			{ key: "impersonateUser", input: { userId: "user-1" } },
		]);
		expect(authStoreNotifyCalls).toEqual(["$sessionSignal"]);
		expect(routerPushCalls).toEqual(["/acme"]);
		expect(routerRefreshCalls).toEqual(["refresh"]);
	});

	it("renders website actions for granting AI usage and deleting forever", async () => {
		resetState();
		const { AdminWebsitesTable } = await modulePromise;
		const deleteTargets: string[] = [];
		const grantTargets: string[] = [];

		const html = renderToStaticMarkup(
			<AdminWebsitesTable
				data={[createWebsite() as never]}
				isLoading={false}
				onDeleteForever={(website) => {
					deleteTargets.push(website.id);
				}}
				onGrantAiUsage={(website) => {
					grantTargets.push(website.id);
				}}
			/>
		);

		expect(html).toContain("Cossistant Site");
		expect(html).toContain("cossistant.com");
		expect(html).toContain('href="/cossistant-site"');
		expect(html).toContain("Grant AI usage");
		expect(html).toContain("Delete forever");

		actionHandlers[0]?.();
		actionHandlers[1]?.();

		expect(grantTargets).toEqual(["site-1"]);
		expect(deleteTargets).toEqual(["site-1"]);
	});

	it("renders the delete dialog with slug confirmation and disabled org deletion when blocked", async () => {
		resetState();
		queryDataByKey.set("admin.getWebsiteDeletionPreview", {
			website: {
				id: "site-1",
				name: "Cossistant Site",
				slug: "cossistant-site",
				domain: "cossistant.com",
			},
			organization: {
				id: "org-1",
				name: "Cossistant Inc",
				slug: "cossistant-inc",
				activeWebsiteCount: 2,
				memberEmailCount: 3,
			},
		});
		const { AdminDeleteWebsiteDialog } = await modulePromise;

		const html = renderToStaticMarkup(
			<AdminDeleteWebsiteDialog
				isPending={false}
				onConfirm={() => {}}
				onOpenChange={() => {}}
				open
				website={createWebsite() as never}
			/>
		);

		expect(html).toContain("Delete website forever");
		expect(html).toContain("cossistant-site");
		expect(html).toContain("Also delete organization");
		expect(html).toContain(
			"Blocked because Cossistant Inc has 2 active websites."
		);
		expect(html).toContain("disabled");
	});

	it("bounds the admin table scroll area", async () => {
		resetState();
		const { AdminPageContent } = await modulePromise;

		renderToStaticMarkup(<AdminPageContent websiteSlug="acme" />);

		expect(scrollAreaClassNames.some((value) => value.includes("flex-1"))).toBe(
			true
		);
		expect(
			scrollAreaClassNames.some((value) => value.includes("min-h-0"))
		).toBe(true);
	});

	it("shows current AI usage inside the grant sheet", async () => {
		resetState();
		queryDataByKey.set("admin.getWebsiteAiUsage", {
			website: {
				id: "site-1",
				name: "Cossistant Site",
				slug: "cossistant-site",
				organizationId: "org-1",
			},
			plan: {
				name: "pro",
				displayName: "Pro",
				includedAiCredits: 1000,
			},
			billing: {
				enabled: true,
				provider: "polar",
				canManageSubscription: true,
			},
			aiCredits: {
				balance: 875,
				consumedUnits: 125,
				creditedUnits: 1000,
				lastSyncedAt: "2026-04-02T10:00:00.000Z",
				meterBacked: true,
				source: "live",
			},
		});
		const { AdminGrantAiUsageSheet } = await modulePromise;

		const html = renderToStaticMarkup(
			<AdminGrantAiUsageSheet
				isPending={false}
				onConfirm={() => {}}
				onOpenChange={() => {}}
				open
				website={createWebsite() as never}
			/>
		);

		expect(html).toContain("Current AI usage");
		expect(html).toContain("Pro plan");
		expect(html).toContain("1,000 included");
		expect(html).toContain("125 / 1,000 used this cycle");
		expect(html).toContain("875 left");
	});

	it("does not render the old empty user detail rail", async () => {
		resetState();
		const { AdminUsersTable } = await modulePromise;

		const html = renderToStaticMarkup(
			<AdminUsersTable
				data={[createUser() as never]}
				isLoading={false}
				onSelectUser={() => {}}
				selectedUserId={null}
				websiteSlug="acme"
			/>
		);

		expect(html).not.toContain("Select a user to view their websites.");
	});
});
