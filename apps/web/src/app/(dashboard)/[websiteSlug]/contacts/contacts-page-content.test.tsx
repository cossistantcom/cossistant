import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const rowFocusHandlers: Array<() => void> = [];
const rowMouseEnterHandlers: Array<() => void> = [];

mock.module("@/contexts/visitor-presence", () => ({
	useVisitorPresence: () => ({
		visitors: [],
	}),
}));

mock.module("@/components/ui/avatar", () => ({
	Avatar: ({ fallbackName }: { fallbackName: string }) => (
		<div data-fallback-name={fallbackName} data-slot="mock-avatar" />
	),
}));

mock.module("@/components/ui/badge", () => ({
	Badge: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

mock.module("@/components/ui/button", () => ({
	Button: ({
		asChild: _asChild,
		children,
		className,
		disabled,
		onClick,
		size: _size,
		type = "button",
		variant: _variant,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
		asChild?: boolean;
		size?: string;
		variant?: string;
	}) => (
		<button
			className={className}
			disabled={disabled}
			onClick={onClick}
			type={type}
			{...props}
		>
			{children}
		</button>
	),
}));

mock.module("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="mock-dropdown-menu">{children}</div>
	),
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="mock-dropdown-menu-content">{children}</div>
	),
	DropdownMenuItem: ({
		children,
		disabled,
		variant,
	}: {
		children: React.ReactNode;
		disabled?: boolean;
		variant?: string;
	}) => (
		<button
			data-slot="mock-dropdown-menu-item"
			data-variant={variant}
			disabled={disabled}
			type="button"
		>
			{children}
		</button>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="mock-dropdown-menu-trigger">{children}</div>
	),
}));

mock.module("@/components/ui/tooltip", () => ({
	TooltipOnHover: ({ children }: { children: React.ReactNode }) => children,
}));

mock.module("@/components/ui/table", () => ({
	Table: ({ children }: { children: React.ReactNode }) => (
		<table>{children}</table>
	),
	TableBody: ({ children }: { children: React.ReactNode }) => (
		<tbody>{children}</tbody>
	),
	TableCell: ({ children }: { children: React.ReactNode }) => (
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
		onFocus,
		onMouseEnter,
	}: React.HTMLAttributes<HTMLTableRowElement>) => {
		if (onFocus) {
			rowFocusHandlers.push(() => {
				onFocus({
					preventDefault() {},
					stopPropagation() {},
				} as never);
			});
		}

		if (onMouseEnter) {
			rowMouseEnterHandlers.push(() => {
				onMouseEnter({
					preventDefault() {},
					stopPropagation() {},
				} as never);
			});
		}

		return <tr>{children}</tr>;
	},
}));

const modulePromise = import("./contacts-page-content");

describe("ContactsTable", () => {
	it("prefetches contact detail on row hover and focus", async () => {
		rowFocusHandlers.length = 0;
		rowMouseEnterHandlers.length = 0;
		const prefetchCalls: Array<{ contactId: string; index: number }> = [];
		const { ContactsTable } = await modulePromise;

		renderToStaticMarkup(
			<ContactsTable
				data={[
					{
						contactOrganizationId: null,
						contactOrganizationName: null,
						createdAt: "2026-03-01T00:00:00.000Z",
						email: "contact@example.com",
						id: "contact-1",
						image: "https://example.com/contact.png",
						lastSeenAt: "2026-03-02T00:00:00.000Z",
						name: "Contact Name",
						updatedAt: "2026-03-03T00:00:00.000Z",
						visitorCount: 2,
					},
				]}
				focusedIndex={0}
				isLoading={false}
				onDeleteContact={() => {}}
				onRowClick={() => {}}
				onRowPrefetch={(contactId, index) => {
					prefetchCalls.push({ contactId, index });
				}}
				onSortingChange={() => {}}
				selectedContactId={null}
				sorting={[]}
			/>
		);

		rowMouseEnterHandlers[0]?.();
		rowFocusHandlers[0]?.();

		expect(prefetchCalls).toEqual([
			{
				contactId: "contact-1",
				index: 0,
			},
			{
				contactId: "contact-1",
				index: 0,
			},
		]);
	});

	it("renders a hover and focus-visible contact action menu", async () => {
		const { ContactsTable } = await modulePromise;

		const html = renderToStaticMarkup(
			<ContactsTable
				data={[
					{
						contactOrganizationId: null,
						contactOrganizationName: null,
						createdAt: "2026-03-01T00:00:00.000Z",
						email: "contact@example.com",
						id: "contact-1",
						image: null,
						lastSeenAt: null,
						name: "Contact Name",
						updatedAt: "2026-03-03T00:00:00.000Z",
						visitorCount: 0,
					},
				]}
				focusedIndex={0}
				isLoading={false}
				onDeleteContact={() => {}}
				onRowClick={() => {}}
				onRowPrefetch={() => {}}
				onSortingChange={() => {}}
				selectedContactId={null}
				sorting={[]}
			/>
		);

		expect(html).toContain("Open contact actions");
		expect(html).toContain("Delete");
		expect(html).toContain("group-hover/contact-row:opacity-100");
		expect(html).toContain("group-focus-within/contact-row:opacity-100");
		expect(html).toContain('data-variant="destructive"');
	});
});

describe("ContactsHeaderActions", () => {
	it("renders the bulk delete action in the header menu", async () => {
		const { ContactsHeaderActions } = await modulePromise;

		const html = renderToStaticMarkup(
			<ContactsHeaderActions disabled={false} onDeleteAllContacts={() => {}} />
		);

		expect(html).toContain("Open contacts actions");
		expect(html).toContain("Delete all contacts");
		expect(html).toContain('data-variant="destructive"');
	});
});
