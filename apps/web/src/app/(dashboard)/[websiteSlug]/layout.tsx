import { notFound, redirect } from "next/navigation";
import { mdxComponents } from "@/app/(lander-docs)/components/docs/mdx-components";
import { CentralContainer } from "@/components/ui/layout";
import { NavigationTopbar } from "@/components/ui/layout/navigation-topbar";
import { InboxesProvider } from "@/contexts/inboxes";
import { VisitorPresenceProvider } from "@/contexts/visitor-presence";
import { WebsiteProvider } from "@/contexts/website";
import { isTinybirdEnabled } from "@/lib/analytics-flags";
import { buildSessionExpiredLoginPath } from "@/lib/auth/redirect";
import { getLatestRelease, getLatestReleaseBody } from "@/lib/latest-release";
import {
	getQueryClient,
	HydrateClient,
	prefetch,
	trpc,
} from "@/lib/trpc/server";
import { isValidWebsiteSlug } from "@/lib/url";
import { getDashboardPrefetchTasks } from "./layout-prefetch";
import { ContactVisitorDetailOverlay } from "./overlays/detail-page-overlay";
import { LiveVisitorsOverlay } from "./overlays/live-visitors-overlay";
import { ModalsAndSheets } from "./overlays/modals-and-sheets";
import { SupportOverlay } from "./overlays/support-overlay";
import { Realtime } from "./providers/realtime";
import { DashboardWebSocketProvider } from "./providers/websocket";

type LayoutProps = {
	children: React.ReactNode;
	params: Promise<{
		websiteSlug: string;
	}>;
};

export default async function Layout({ children, params }: LayoutProps) {
	const { websiteSlug } = await params;
	const tinybirdEnabled = isTinybirdEnabled();

	// Reject invalid slugs (e.g., __webpack_hmr, _next paths)
	if (!isValidWebsiteSlug(websiteSlug)) {
		notFound();
	}

	const latestRelease = getLatestRelease();
	const ChangelogBody = getLatestReleaseBody();
	const changelogContent = ChangelogBody ? (
		<ChangelogBody components={mdxComponents} />
	) : null;
	const queryClient = getQueryClient();

	const handleAuthRedirect = (
		error: Parameters<NonNullable<Parameters<typeof prefetch>[1]>>[0]
	) => {
		if (error.data?.code === "UNAUTHORIZED") {
			redirect(buildSessionExpiredLoginPath(`/${websiteSlug}/inbox`));
		}

		if (error.data?.code === "FORBIDDEN") {
			redirect("/select");
		}

		redirect("/select");
	};

	await prefetch(
		trpc.website.getBySlug.queryOptions({ slug: websiteSlug }),
		handleAuthRedirect
	);

	await Promise.all(
		getDashboardPrefetchTasks({
			handleAuthRedirect,
			prefetch,
			queryClient,
			tinybirdEnabled,
			trpc,
			websiteSlug,
		})
	);

	return (
		<HydrateClient>
			<WebsiteProvider websiteSlug={websiteSlug}>
				<VisitorPresenceProvider websiteSlug={websiteSlug}>
					<DashboardWebSocketProvider>
						<Realtime>
							<InboxesProvider websiteSlug={websiteSlug}>
								<div className="h-screen w-screen overflow-hidden bg-background-100 dark:bg-background">
									<NavigationTopbar
										changelogContent={changelogContent}
										latestRelease={latestRelease}
									/>
									<CentralContainer>{children}</CentralContainer>
									<LiveVisitorsOverlay />
									<ContactVisitorDetailOverlay />
									<SupportOverlay />
									<ModalsAndSheets />
								</div>
							</InboxesProvider>
						</Realtime>
					</DashboardWebSocketProvider>
				</VisitorPresenceProvider>
			</WebsiteProvider>
		</HydrateClient>
	);
}
