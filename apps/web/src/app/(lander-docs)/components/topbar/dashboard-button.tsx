"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
	TopbarButton,
	topbarButtonLinkClassName,
} from "@/components/ui/topbar-button";
import { authClient } from "@/lib/auth/client";
import { CtaButton } from "./cta-button";

const dashboardButtonClassName = "h-auto px-2 py-1.5";
const dashboardButtonReserveClassName =
	"pointer-events-none invisible hidden select-none items-center gap-2 whitespace-nowrap md:col-start-1 md:row-start-1 md:flex";
const dashboardButtonLiveClassName =
	"flex items-center gap-2 md:col-start-1 md:row-start-1 md:w-full md:justify-end";

export function DashboardButtonSkeleton() {
	return (
		<Button
			className={dashboardButtonClassName}
			data-slot="dashboard-button-skeleton"
			variant="ghost"
		>
			Dashboard
		</Button>
	);
}

function DashboardButtonReserve() {
	return (
		<div
			aria-hidden="true"
			className={dashboardButtonReserveClassName}
			data-slot="dashboard-button-reserve"
		>
			<span
				className={topbarButtonLinkClassName}
				data-slot="dashboard-button-reserve-login"
			>
				Login
			</span>
			<span
				className={buttonVariants({ variant: "outline" })}
				data-slot="dashboard-button-reserve-signup"
			>
				Sign up
			</span>
		</div>
	);
}

export function DashboardButtonLiveContent({
	isPending,
	isSignedIn,
}: {
	isPending: boolean;
	isSignedIn: boolean;
}) {
	if (isPending) {
		return (
			<div className="contents" data-slot="dashboard-button-state-pending">
				<DashboardButtonSkeleton />
			</div>
		);
	}

	if (!isSignedIn) {
		return (
			<div className="contents" data-slot="dashboard-button-state-signed-out">
				<TopbarButton
					href="/login"
					shortcuts={["l"]}
					tooltip="Login"
					withBrackets={false}
				>
					Login
				</TopbarButton>
				<CtaButton />
			</div>
		);
	}

	return (
		<div className="contents" data-slot="dashboard-button-state-signed-in">
			<Link href="/select">
				<Button className={dashboardButtonClassName} variant="ghost">
					Dashboard
				</Button>
			</Link>
		</div>
	);
}

export function DashboardButton() {
	const { data: session, isPending } = authClient.useSession();
	const [hasMounted, setHasMounted] = useState(false);

	useEffect(() => {
		setHasMounted(true);
	}, []);

	return (
		<div className="md:grid md:items-center" data-slot="dashboard-button-shell">
			<DashboardButtonReserve />
			<div
				className={dashboardButtonLiveClassName}
				data-slot="dashboard-button-live"
			>
				<DashboardButtonLiveContent
					isPending={!hasMounted || isPending}
					isSignedIn={hasMounted && !!session?.user}
				/>
			</div>
		</div>
	);
}
