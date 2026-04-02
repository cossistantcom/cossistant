"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import { cn } from "@/lib/utils";
import { TooltipOnHover } from "./tooltip";

export const topbarButtonLinkClassName =
	"group flex items-center gap-1 font-medium text-foreground text-sm transition-colors hover:text-foreground";

type TopbarButtonProps = {
	href: string;
	children: React.ReactNode;
	className?: string;
	icon?: React.ReactNode;
	tooltip?: string;
	shortcuts?: string[];
	withBrackets?: boolean;
};

export function TopbarButton({
	href,
	children,
	className,
	icon,
	tooltip,
	shortcuts,
	withBrackets = true,
}: TopbarButtonProps) {
	const router = useRouter();

	useHotkeys(
		[shortcuts?.join("+") ?? ""],
		() => {
			router.push(href);
		},
		{
			enabled: !!shortcuts,
			preventDefault: true,
		}
	);

	return (
		<TooltipOnHover content={tooltip} shortcuts={shortcuts}>
			<Link className={cn(topbarButtonLinkClassName, className)} href={href}>
				{withBrackets && (
					<span className="text-foreground/30 opacity-0 transition-all duration-100 group-hover:text-plasma-orange group-hover:opacity-100">
						[
					</span>
				)}
				{icon && <span className="mr-1">{icon}</span>}
				{children}
				{withBrackets && (
					<span className="text-foreground/30 opacity-0 transition-all duration-100 group-hover:text-plasma-orange group-hover:opacity-100">
						]
					</span>
				)}
			</Link>
		</TooltipOnHover>
	);
}
