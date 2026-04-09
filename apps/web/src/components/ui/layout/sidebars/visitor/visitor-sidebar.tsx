/** biome-ignore-all lint/nursery/noUnnecessaryConditions: ok here */
import type { RouterOutputs } from "@api/trpc/types";
import Link from "next/link";
import { useCallback } from "react";
import { useConversationActionRunner } from "@/components/conversation/actions/use-conversation-action-runner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VisitorAttributionGroup } from "@/components/ui/visitor-attribution-group";
import { useWebsite } from "@/contexts/website";
import { usePrefetchContactVisitorDetail } from "@/data/use-prefetch-contact-visitor-detail";
import { useContactVisitorDetailState } from "@/hooks/use-contact-visitor-detail-state";
import { SidebarContainer } from "../container";
import { ResizableSidebar } from "../resizable-sidebar";
import { ValueDisplay, ValueGroup } from "../shared";
import { useVisitorData } from "./hooks";
import { VisitorSidebarPlaceholder } from "./placeholder";
import { CountryFlag } from "./utils";
import { VisitorSidebarHeader } from "./visitor-sidebar-header";

export type VisitorSidebarProps = {
	conversationId: string;
	visitorId: string | null;
	visitor: RouterOutputs["conversation"]["getVisitorById"] | null;
	isLoading: boolean;
};

export function VisitorSidebar({
	visitor,
	isLoading,
	conversationId,
	visitorId,
}: VisitorSidebarProps) {
	const website = useWebsite();
	const { openVisitorDetail } = useContactVisitorDetailState();
	const { prefetchDetail } = usePrefetchContactVisitorDetail({
		websiteSlug: website.slug,
	});
	const visitorData = useVisitorData({ visitor });
	const { unblockVisitor, pendingAction, runAction } =
		useConversationActionRunner({
			conversationId,
			visitorId: visitorId ?? visitor?.id ?? null,
		});

	const handleUnblock = useCallback(() => {
		void runAction(() => unblockVisitor(), {
			successMessage: "Visitor unblocked",
			errorMessage: "Failed to unblock visitor",
		});
	}, [runAction, unblockVisitor]);

	const handleOpenDetail = useCallback(() => {
		if (visitorId ?? visitor?.id) {
			void openVisitorDetail(visitorId ?? visitor?.id ?? "");
		}
	}, [openVisitorDetail, visitor?.id, visitorId]);

	const handlePrefetchDetail = useCallback(() => {
		const nextVisitorId = visitorId ?? visitor?.id;

		if (!nextVisitorId) {
			return;
		}

		void prefetchDetail({
			type: "visitor",
			id: nextVisitorId,
		});
	}, [prefetchDetail, visitor?.id, visitorId]);

	if (isLoading || !visitor || !visitorData) {
		return <VisitorSidebarPlaceholder />;
	}

	const {
		fullName,
		presence,
		countryDetails,
		countryLabel,
		localTime,
		timezoneTooltip,
	} = visitorData;

	const metadata =
		(visitor.contact?.metadata && Object.entries(visitor.contact.metadata)) ||
		[];

	return (
		<ResizableSidebar
			className="hidden lg:flex"
			position="right"
			sidebarTitle="Visitor"
		>
			<SidebarContainer>
				<VisitorSidebarHeader
					attribution={visitor.attribution}
					avatarUrl={visitor.contact?.image}
					contact={visitor.contact}
					email={visitor.contact?.email}
					fullName={fullName}
					lastSeenAt={presence?.lastSeenAt ?? visitor.lastSeenAt}
					onOpenDetail={handleOpenDetail}
					onOpenDetailPrefetch={handlePrefetchDetail}
					status={presence?.status}
				/>
				<ScrollArea
					className="-mr-1.5 mt-4 flex flex-1 flex-col gap-4 pr-2 pb-32"
					scrollMask
				>
					{visitor.isBlocked ? (
						<Alert className="my-6" variant="destructive">
							<AlertTitle>Visitor blocked</AlertTitle>
							<AlertDescription>
								<div className="flex flex-col gap-3">
									<span>This visitor can't see or send messages.</span>
									<Button
										className="mt-4"
										disabled={pendingAction.unblockVisitor}
										onClick={handleUnblock}
										size="sm"
										type="button"
										variant="destructive"
									>
										{pendingAction.unblockVisitor ? "Unblocking..." : "Unblock"}
									</Button>
								</div>
							</AlertDescription>
						</Alert>
					) : null}
					<ValueGroup header="Location">
						<ValueDisplay
							placeholder="Unknown"
							title="Country"
							value={
								countryLabel ? (
									<span className="ml-auto inline-flex items-center gap-2">
										{countryLabel}
										{countryDetails.code ? (
											<div className="overflow-clip rounded-[2px] border p-[1px]">
												<CountryFlag countryCode={countryDetails.code} />
											</div>
										) : null}
									</span>
								) : null
							}
							withPaddingLeft={false}
						/>
						<ValueDisplay
							placeholder="Unknown"
							title="Local time"
							tooltip={timezoneTooltip}
							value={
								<>
									{localTime.time}
									<span className="ml-2 text-primary/90">
										({localTime.offset})
									</span>
								</>
							}
							withPaddingLeft={false}
						/>
						<ValueDisplay
							placeholder="Unknown"
							title="IP"
							value={visitor.ip}
							withPaddingLeft={false}
						/>
					</ValueGroup>
					<VisitorAttributionGroup attribution={visitor.attribution} />
					<ValueGroup>
						{visitor.browser && (
							<ValueDisplay
								title="Browser"
								value={`${visitor.browser} / ${visitor.browserVersion}`}
								withPaddingLeft={false}
							/>
						)}
						{visitor.os && (
							<ValueDisplay
								title="OS"
								value={`${visitor.os} / ${visitor.osVersion}`}
								withPaddingLeft={false}
							/>
						)}
						{visitor.device && (
							<ValueDisplay
								title="Device"
								value={`${visitor.device} / ${visitor.deviceType}`}
								withPaddingLeft={false}
							/>
						)}
						{visitor.viewport && (
							<ValueDisplay
								title="Viewport"
								tooltip={"The viewport is the visitor's browser window size."}
								value={visitor.viewport}
								withPaddingLeft={false}
							/>
						)}
					</ValueGroup>
					<ValueGroup header="Metadata">
						{metadata.map(([key, value]) => (
							<ValueDisplay autoFormat key={key} title={key} value={value} />
						))}
						{metadata.length === 0 && (
							<p className="text-primary/60 text-xs">
								No metadata yet, see our{" "}
								<Link
									className="text-primary/60 underline hover:text-primary/80"
									href="/docs/concepts/contacts#contact-metadata"
								>
									documentation
								</Link>{" "}
								to learn more.
							</p>
						)}
					</ValueGroup>
					<div className="h-32" />
				</ScrollArea>
			</SidebarContainer>
		</ResizableSidebar>
	);
}
