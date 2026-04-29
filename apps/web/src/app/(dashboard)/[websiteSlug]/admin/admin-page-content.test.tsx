import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const actionHandlers: Array<() => void> = [];
const rowHandlers: Array<() => void> = [];
const buttonHandlers: Array<() => void> = [];
const mutationCalls: Array<{ key: string; input: unknown }> = [];
const invalidateCalls: unknown[] = [];
const confirmCalls: string[] = [];
const routerPushCalls: string[] = [];
const routerRefreshCalls: string[] = [];
const authStoreNotifyCalls: string[] = [];
const toastSuccessCalls: string[] = [];
const toastErrorCalls: string[] = [];

mock.module("@tanstack/react-query", () => ({
	useMutation: (
		options: {
			mutationKey?: string[];
			onSuccess?: () => void | Promise<void>;
		} = {}
	) => ({
		isPending: false,
		mutate: (input: unknown) => {
			mutationCalls.push({
				key: options.mutationKey?.[0] ?? "unknown",
				input,
			});
			void options.onSuccess?.();
		},
	}),
	useQuery: () => ({
		data: null,
		isLoading: false,
	}),
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
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => {
		if (onClick) {
			buttonHandlers.push(() => {
				onClick({
					preventDefault() {},
					stopPropagation() {},
				} as never);
			});
		}

		return (
			<button {...props} type={props.type ?? "button"}>
				{children}
			</button>
		);
	},
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
	ScrollArea: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
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
				getUserWebsites: {
					queryOptions: (input: unknown) => ({
						queryKey: ["admin.getUserWebsites", input],
					}),
				},
				impersonateUser: {
					mutationOptions: mutationOptions("impersonateUser"),
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
		}),
	};
});

mock.module("@/lib/utils", () => ({
	cn: (...parts: Array<string | false | null | undefined>) =>
		parts.filter(Boolean).join(" "),
}));

mock.module("./use-admin-users-controls", () => ({
	useAdminUsersControls: () => ({
		debouncedSearchTerm: "",
		searchTerm: "",
		setSearchTerm: () => {},
	}),
}));

const modulePromise = import("./admin-page-content");

function resetState() {
	actionHandlers.length = 0;
	rowHandlers.length = 0;
	buttonHandlers.length = 0;
	mutationCalls.length = 0;
	invalidateCalls.length = 0;
	confirmCalls.length = 0;
	routerPushCalls.length = 0;
	routerRefreshCalls.length = 0;
	authStoreNotifyCalls.length = 0;
	toastSuccessCalls.length = 0;
	toastErrorCalls.length = 0;

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

	it("renders the selected user's active websites in the detail panel", async () => {
		resetState();
		const { AdminUserDetailPanel } = await modulePromise;
		const closeCalls: string[] = [];

		const html = renderToStaticMarkup(
			<AdminUserDetailPanel
				isLoading={false}
				onClose={() => {
					closeCalls.push("close");
				}}
				organizations={[
					{
						id: "org-1",
						name: "Acme",
						slug: "acme",
						role: "admin",
						joinedAt: "2026-04-01T10:00:00.000Z",
						websites: [
							{
								id: "site-1",
								name: "Cossistant Site",
								slug: "cossistant-site",
								domain: "cossistant.com",
								logoUrl: null,
								accessSource: "organization",
								createdAt: "2026-04-02T10:00:00.000Z",
							},
						],
					},
				]}
				selectedUser={createUser() as never}
			/>
		);

		expect(html).toContain("ada@example.com");
		expect(html).toContain("Acme");
		expect(html).toContain("Cossistant Site");
		expect(html).toContain("cossistant.com");
		expect(html).toContain('href="/cossistant-site"');

		buttonHandlers[0]?.();

		expect(closeCalls).toEqual(["close"]);
	});
});
