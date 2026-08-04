"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { DocsMobileNavigation } from "./docs-mobile-navigation";

type TopbarMobileMenuProps = {
	children?: ReactNode;
	navigationLinks: ReadonlyArray<{ href: string; label: string }>;
	tree: ComponentProps<typeof DocsMobileNavigation>["tree"];
};

export function TopbarMobileMenu({
	children,
	navigationLinks,
	tree,
}: TopbarMobileMenuProps) {
	return (
		<Sheet>
			<SheetTrigger asChild>
				<Button
					className="size-8 shrink-0 border border-dashed lg:hidden"
					data-slot="topbar-mobile-menu-trigger"
					size="icon"
					type="button"
					variant="ghost"
				>
					<MenuIcon className="size-4" />
					<span className="sr-only">Open navigation menu</span>
				</Button>
			</SheetTrigger>
			<SheetContent className="inset-0 h-svh w-screen max-w-none overflow-y-auto rounded-none border-0 border-dashed bg-background p-6 sm:max-w-none">
				<SheetHeader>
					<SheetTitle>Navigation</SheetTitle>
					<SheetDescription>
						Browse docs, product pages, and updates.
					</SheetDescription>
				</SheetHeader>
				{children ? (
					<div
						className="mt-6 flex flex-wrap items-center gap-3 px-2"
						data-slot="topbar-mobile-sheet-actions"
					>
						{children}
					</div>
				) : null}
				<div className="mt-6 flex flex-col gap-2 px-2">
					{navigationLinks.map((link) => (
						<SheetClose asChild key={link.href}>
							<Link
								className="rounded-sm px-2 py-2 font-medium text-sm transition-colors hover:bg-secondary"
								href={link.href}
							>
								{link.label}
							</Link>
						</SheetClose>
					))}
				</div>
				<DocsMobileNavigation tree={tree} />
			</SheetContent>
		</Sheet>
	);
}
