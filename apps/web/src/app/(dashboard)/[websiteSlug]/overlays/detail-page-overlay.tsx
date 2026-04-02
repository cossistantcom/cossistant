"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { resolveCountryDetails } from "@plasma/location/country-utils";
import type { ContactDetailResponse } from "@plasma/types";
import { useQueryNormalizer } from "@normy/react-query";
import * as ReactQuery from "@tanstack/react-query";
import { Monitor, Smartphone } from "lucide-react";
import { useMemo } from "react";
import { Globe, type GlobeFocus, type GlobeVisitor } from "@/components/globe";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import {
	ValueDisplay,
	ValueGroup,
} from "@/components/ui/layout/sidebars/shared";
import {
	CountryFlag,
	formatLocalTime,
} from "@/components/ui/layout/sidebars/visitor/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { TooltipOnHover } from "@/components/ui/tooltip";
import { VisitorAttributionGroup } from "@/components/ui/visitor-attribution-group";
import { VisitorSourceBadge } from "@/components/ui/visitor-source-badge";
import { useWebsite } from "@/contexts/website";
import { useContactVisitorDetailState } from "@/hooks/use-contact-visitor-detail-state";
import { formatFullDateTime, formatLastSeenAt } from "@/lib/date";
import { useTRPC } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import {
	DashboardOverlayCenteredState,
	DashboardOverlayShell,
} from "./dashboard-overlay-shell";

type ContactDetail = RouterOutputs["contact"]["get"];
type DetailContact = ContactDetailResponse["contact"];
type LeadVisitorSummary = ContactDetailResponse["visitors"][number];
type VisitorDetail = NonNullable<
	RouterOutputs["conversation"]["getVisitorById"]
>;
type HeroDetails = ReturnType<typeof buildHeroDetails>;
type HeroGlobeData = {
	focus: GlobeFocus;
	visitors: readonly GlobeVisitor[];
};
type DeviceKind = "desktop" | "mobile";
type DeviceDetailById = Record<
	string,
	{
		deviceType?: string | null;
		ip?: string | null;
	}
>;

type ContactVisitorDetailViewProps = {
	mode: "contact" | "visitor";
	contact: DetailContact | null;
	deviceDetailsById: DeviceDetailById;
	globeVisitors?: readonly (VisitorDetail | null | undefined)[];
	heroVisitor: VisitorDetail | null;
	isError: boolean;
	isLoading: boolean;
	leadVisitorSummary: LeadVisitorSummary | null;
	visitors: ContactDetailResponse["visitors"];
	websiteSlug: string;
};

function isContactDetailResponse(value: unknown): value is ContactDetail {
	if (!value || typeof value !== "object") {
		return false;
	}

	return (
		"contact" in value &&
		"visitors" in value &&
		Array.isArray((value as { visitors?: unknown }).visitors)
	);
}

function getLeadVisitorSummary(
	contactDetail: ContactDetail | undefined
): LeadVisitorSummary | null {
	return contactDetail?.visitors?.[0] ?? null;
}

function formatTimestampLabel(timestamp: string | null | undefined) {
	if (!timestamp) {
		return {
			tooltip: undefined,
			value: "Unknown",
		};
	}

	const date = new Date(timestamp);

	if (Number.isNaN(date.getTime())) {
		return {
			tooltip: undefined,
			value: "Unknown",
		};
	}

	return {
		tooltip: formatFullDateTime(date),
		value: formatLastSeenAt(date),
	};
}

function getTimestampValue(timestamp: string | null | undefined) {
	if (!timestamp) {
		return null;
	}

	const time = new Date(timestamp).getTime();

	return Number.isNaN(time) ? null : time;
}

function sortVisitorsByLastSeen(visitors: ContactDetailResponse["visitors"]) {
	return [...visitors].sort((left, right) => {
		const leftTime =
			getTimestampValue(left.lastSeenAt) ??
			getTimestampValue(left.createdAt) ??
			0;
		const rightTime =
			getTimestampValue(right.lastSeenAt) ??
			getTimestampValue(right.createdAt) ??
			0;

		return rightTime - leftTime;
	});
}

function formatLanguageLabel(language: string | null | undefined) {
	if (!language) {
		return "Unknown";
	}

	try {
		const locale = new Intl.Locale(language);
		const languageName = new Intl.DisplayNames(["en"], {
			type: "language",
		}).of(locale.language);

		if (!languageName) {
			return language;
		}

		if (!locale.region) {
			return languageName;
		}

		const regionName = new Intl.DisplayNames(["en"], {
			type: "region",
		}).of(locale.region);

		return regionName ? `${languageName} (${regionName})` : languageName;
	} catch {
		return language;
	}
}

function inferDeviceKind(params: {
	browser?: string | null;
	device?: string | null;
	deviceType?: string | null;
}): DeviceKind {
	const normalizedDeviceType = params.deviceType?.toLowerCase();

	if (normalizedDeviceType === "mobile" || normalizedDeviceType === "tablet") {
		return "mobile";
	}

	const deviceLabel = [params.device, params.browser].filter(Boolean).join(" ");

	return /android|iphone|ipad|mobile|phone|tablet/i.test(deviceLabel)
		? "mobile"
		: "desktop";
}

function hasGlobeCoordinates<
	T extends {
		latitude: number | null;
		longitude: number | null;
	},
>(
	visitor: T | null | undefined
): visitor is T & {
	latitude: number;
	longitude: number;
} {
	return visitor?.latitude != null && visitor.longitude != null;
}

function pickGlobeVisitor(params: {
	heroVisitor: VisitorDetail | null;
	visitors?: readonly (VisitorDetail | null | undefined)[];
}) {
	if (hasGlobeCoordinates(params.heroVisitor)) {
		return params.heroVisitor;
	}

	return params.visitors?.find(hasGlobeCoordinates) ?? null;
}

function buildHeroDetails(params: {
	contact: DetailContact | null;
	heroVisitor: VisitorDetail | null;
	leadVisitorSummary: LeadVisitorSummary | null;
}) {
	const { contact, heroVisitor, leadVisitorSummary } = params;

	const title = heroVisitor
		? getVisitorNameWithFallback(heroVisitor)
		: (contact?.name ?? contact?.email ?? "Contact");
	const avatarUrl = heroVisitor?.contact?.image ?? contact?.image ?? null;

	const countryDetails = heroVisitor
		? resolveCountryDetails({
				city: heroVisitor.city,
				country: heroVisitor.country,
				countryCode: heroVisitor.countryCode,
				locale: heroVisitor.language,
				timezone: heroVisitor.timezone,
			})
		: null;
	const locationLabel = heroVisitor
		? [heroVisitor.city, countryDetails?.name ?? countryDetails?.code ?? null]
				.filter(Boolean)
				.join(", ")
		: [leadVisitorSummary?.city, leadVisitorSummary?.country]
				.filter(Boolean)
				.join(", ");
	const localTime = heroVisitor
		? formatLocalTime(heroVisitor.timezone, heroVisitor.language)
		: null;
	const browserLabel = heroVisitor
		? [heroVisitor.browser, heroVisitor.browserVersion]
				.filter(Boolean)
				.join(" / ")
		: (leadVisitorSummary?.browser ?? null);
	const deviceLabel = heroVisitor
		? [heroVisitor.device, heroVisitor.deviceType].filter(Boolean).join(" / ")
		: (leadVisitorSummary?.device ?? null);
	const osLabel = heroVisitor
		? [heroVisitor.os, heroVisitor.osVersion].filter(Boolean).join(" / ")
		: null;
	const firstSeen = formatTimestampLabel(
		heroVisitor?.createdAt ?? leadVisitorSummary?.createdAt
	);
	const lastSeen = formatTimestampLabel(
		heroVisitor?.lastSeenAt ?? leadVisitorSummary?.lastSeenAt
	);

	return {
		attribution: heroVisitor?.attribution ?? null,
		avatarUrl,
		browserLabel,
		countryCode: countryDetails?.code ?? null,
		deviceLabel,
		firstSeen,
		ipAddress: heroVisitor?.ip ?? null,
		isBlocked: heroVisitor?.isBlocked ?? leadVisitorSummary?.isBlocked ?? false,
		language: heroVisitor?.language ?? leadVisitorSummary?.language ?? null,
		lastSeen,
		localTime,
		locationLabel: locationLabel || null,
		osLabel,
		title,
		viewport: heroVisitor?.viewport ?? null,
	};
}

function buildHeroGlobeData(params: {
	hero: HeroDetails;
	globeVisitor: VisitorDetail | null;
}): HeroGlobeData | null {
	const { globeVisitor, hero } = params;

	if (!hasGlobeCoordinates(globeVisitor)) {
		return null;
	}

	const countryDetails = resolveCountryDetails({
		city: globeVisitor.city,
		country: globeVisitor.country,
		countryCode: globeVisitor.countryCode,
		locale: globeVisitor.language,
		timezone: globeVisitor.timezone,
	});
	const locationLabel =
		hero.locationLabel ||
		[globeVisitor.city, countryDetails.name ?? countryDetails.code ?? null]
			.filter(Boolean)
			.join(", ") ||
		null;

	return {
		focus: {
			latitude: globeVisitor.latitude,
			longitude: globeVisitor.longitude,
		},
		visitors: [
			{
				avatarUrl: hero.avatarUrl,
				id: globeVisitor.id,
				latitude: globeVisitor.latitude,
				locationLabel,
				longitude: globeVisitor.longitude,
				name: hero.title,
				pageLabel:
					globeVisitor.currentPage?.path ??
					globeVisitor.currentPage?.title ??
					null,
			},
		],
	};
}

function DetailHeroGlobe({
	frameClassName,
	globeData,
	heightClassName,
}: {
	frameClassName?: string;
	globeData: HeroGlobeData;
	heightClassName?: string;
}) {
	return (
		<div
			className="fade-in zoom-in-95 slide-in-from-bottom-2 animate-in duration-300 ease-out"
			data-slot="contact-visitor-detail-globe-entrance"
		>
			<div
				className={cn("relative overflow-hidden", frameClassName)}
				data-slot="contact-visitor-detail-globe-frame"
			>
				<div
					className={cn("relative w-full", heightClassName)}
					data-slot="contact-visitor-detail-globe-crop"
				>
					<div
						className="absolute inset-0"
						data-slot="contact-visitor-detail-globe-stage"
					>
						<Globe
							allowDrag
							autoRotate={false}
							className="h-full w-full"
							focus={globeData.focus}
							minHeight={null}
							renderOffset={{ y: "0%" }}
							renderScale={1.25}
							visitors={globeData.visitors}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

type DetailMetricProps = {
	label: string;
	tooltip?: string;
	value: string;
};

function buildDeviceLabel(params: {
	browser?: string | null;
	device?: string | null;
	ip?: string | null;
	isBlocked?: boolean;
}) {
	const primary = params.device ?? params.browser ?? "Unknown device";
	const secondary =
		params.browser && params.browser !== primary ? params.browser : null;

	return [primary, secondary, params.ip, params.isBlocked ? "Blocked" : null]
		.filter(Boolean)
		.join(" • ");
}

function getTimeOfDayLabel(localTime: string | null | undefined) {
	if (!localTime) {
		return null;
	}

	const normalizedTime = localTime.trim().toLowerCase();
	const timeMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/);

	if (!timeMatch) {
		return null;
	}

	let hour = Number.parseInt(timeMatch[1] ?? "", 10);

	if (Number.isNaN(hour)) {
		return null;
	}

	if (timeMatch[3] === "pm" && hour < 12) {
		hour += 12;
	} else if (timeMatch[3] === "am" && hour === 12) {
		hour = 0;
	}

	if (hour < 12) {
		return "morning";
	}

	if (hour < 18) {
		return "afternoon";
	}

	return "evening";
}

function formatSummaryTime(localTime: string | null | undefined) {
	if (!localTime) {
		return null;
	}

	const normalizedTime = localTime.trim().toLowerCase();
	const timeMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})(?:\s*([ap]m))?$/);

	if (!timeMatch) {
		return localTime;
	}

	let hour = Number.parseInt(timeMatch[1] ?? "", 10);
	const minute = timeMatch[2];

	if (!minute || Number.isNaN(hour)) {
		return localTime;
	}

	if (timeMatch[3] === "pm" && hour < 12) {
		hour += 12;
	} else if (timeMatch[3] === "am" && hour === 12) {
		hour = 0;
	}

	return `${String(hour).padStart(2, "0")}:${minute}`;
}

function buildVisitorInsight(hero: HeroDetails): React.ReactNode {
	const language = formatLanguageLabel(hero.language);
	const location = hero.locationLabel ?? "Unknown";
	const localTime = hero.localTime?.time ?? null;
	const summaryTime = formatSummaryTime(localTime);
	const timeOfDay = getTimeOfDayLabel(localTime);
	const locationContent = (
		<span
			className="inline-flex items-center gap-1 text-primary"
			data-slot="contact-visitor-summary-location"
		>
			{hero.countryCode ? (
				<span
					className="overflow-clip rounded-[2px] border p-[1px]"
					data-slot="contact-visitor-summary-flag"
				>
					<CountryFlag countryCode={hero.countryCode} />
				</span>
			) : null}
			<span>{location}</span>
		</span>
	);
	const languageContent = (
		<span className="text-primary" data-slot="contact-visitor-summary-language">
			{language}
		</span>
	);

	if (!(summaryTime && timeOfDay)) {
		return (
			<>
				<span className="block">
					This visitor appears to be in {locationContent}.
				</span>
				<span className="block">
					Their browser language is {languageContent}.
				</span>
				<span className="block">Local time unavailable.</span>
			</>
		);
	}

	return (
		<>
			<span className="block">
				This visitor appears to be in {locationContent}.
			</span>
			<span className="block">
				Their browser language is {languageContent}.
			</span>
			<span className="block">
				It&apos;s the{" "}
				<span
					className="text-primary"
					data-slot="contact-visitor-summary-time-of-day"
				>
					{timeOfDay}
				</span>{" "}
				(
				<span className="text-primary" data-slot="contact-visitor-summary-time">
					{summaryTime}
				</span>
				) for them.
			</span>
		</>
	);
}

function DetailMetric({ label, tooltip, value }: DetailMetricProps) {
	const content = (
		<section className="flex min-w-[140px] flex-1 cursor-default flex-col gap-1">
			<p className="text-primary/60 text-xs">{label}</p>
			<p className="font-medium text-primary text-sm">{value}</p>
		</section>
	);

	if (!tooltip) {
		return content;
	}

	return <TooltipOnHover content={tooltip}>{content}</TooltipOnHover>;
}

function DevicesSection({
	deviceDetailsById,
	heroVisitor,
	mode,
	visitors,
}: {
	deviceDetailsById: DeviceDetailById;
	heroVisitor: VisitorDetail | null;
	mode: "contact" | "visitor";
	visitors: ContactDetailResponse["visitors"];
}) {
	const rows =
		mode === "contact"
			? sortVisitorsByLastSeen(visitors).map((visitor) => {
					const visitorDetail = deviceDetailsById[visitor.id];

					return {
						id: visitor.id,
						kind: inferDeviceKind({
							browser: visitor.browser,
							device: visitor.device,
							deviceType: visitorDetail?.deviceType,
						}),
						label: buildDeviceLabel({
							browser: visitor.browser,
							device: visitor.device,
							ip: visitorDetail?.ip,
							isBlocked: visitor.isBlocked,
						}),
						lastSeen: formatTimestampLabel(visitor.lastSeenAt),
					};
				})
			: heroVisitor
				? [
						{
							id: heroVisitor.id,
							kind: inferDeviceKind({
								browser: heroVisitor.browser,
								device: heroVisitor.device,
								deviceType: heroVisitor.deviceType,
							}),
							label: buildDeviceLabel({
								browser: heroVisitor.browser,
								device: heroVisitor.device,
								ip: heroVisitor.ip,
								isBlocked: heroVisitor.isBlocked,
							}),
							lastSeen: formatTimestampLabel(heroVisitor.lastSeenAt),
						},
					]
				: [];

	return (
		<div data-slot="contact-visitor-detail-device-list">
			<ValueGroup
				className="mt-0 px-0"
				header={mode === "contact" ? `Devices (${rows.length})` : "Device"}
			>
				{rows.length > 0 ? (
					<div className="divide-y divide-primary/10 dark:divide-primary/5">
						{rows.map((row) => {
							const DeviceIcon = row.kind === "mobile" ? Smartphone : Monitor;

							return (
								<div
									className="flex items-center gap-2 py-2"
									data-slot="contact-visitor-device-row"
									key={row.id}
								>
									<DeviceIcon className="size-3.5 shrink-0 text-primary/50" />
									<p className="min-w-0 flex-1 truncate text-primary text-xs">
										{row.label}
									</p>
									<p className="shrink-0 text-primary/60 text-xs">
										{row.lastSeen.value}
									</p>
								</div>
							);
						})}
					</div>
				) : (
					<p className="text-primary/60 text-sm">
						No device information is available yet.
					</p>
				)}
			</ValueGroup>
		</div>
	);
}

function DetailPrimaryPanel({
	contact,
	hero,
	globeVisitors,
	heroVisitor,
	leadVisitorSummary,
	mode,
	visitors,
	websiteSlug,
}: {
	contact: DetailContact | null;
	hero: HeroDetails;
	globeVisitors?: readonly (VisitorDetail | null | undefined)[];
	heroVisitor: VisitorDetail | null;
	leadVisitorSummary: LeadVisitorSummary | null;
	mode: "contact" | "visitor";
	visitors: ContactDetailResponse["visitors"];
	websiteSlug: string;
}) {
	const localTimeLabel =
		hero.localTime?.time && hero.localTime.offset
			? `${hero.localTime.time} (${hero.localTime.offset})`
			: (hero.localTime?.time ?? null);
	const visitorInsight = buildVisitorInsight(hero);
	const summaryLabel =
		mode === "contact"
			? String(visitors.length)
			: contact
				? "Identified"
				: "Anonymous";
	const hasIdentifiers = Boolean(
		contact?.email || contact?.externalId || contact?.contactOrganizationId
	);
	const heroGlobeData = buildHeroGlobeData({
		hero,
		globeVisitor: pickGlobeVisitor({
			heroVisitor,
			visitors: globeVisitors,
		}),
	});

	return (
		<div className="relative h-full border-primary/5 border-b lg:border-r lg:border-b-0">
			<ScrollArea
				className="relative h-full px-5 py-6 lg:px-8 lg:py-8"
				maskHeight="120px"
				scrollMask
			>
				<div
					className={cn(
						"mx-auto flex w-full max-w-sm flex-col gap-8",
						heroGlobeData ? "pb-8 lg:pb-72" : undefined
					)}
					data-slot="contact-visitor-detail-primary-panel"
				>
					<div className="flex flex-col gap-4">
						<Avatar
							className="size-10 rounded-[2px] ring-0 ring-offset-0"
							fallbackName={hero.title}
							lastOnlineAt={
								heroVisitor?.lastSeenAt ?? leadVisitorSummary?.lastSeenAt
							}
							url={hero.avatarUrl}
						/>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<h2 className="truncate font-semibold text-xl tracking-tight">
									{hero.title}
								</h2>
								<VisitorSourceBadge
									attribution={hero.attribution}
									prependText="from"
								/>
							</div>
						</div>
						{hero.isBlocked ? (
							<div className="flex flex-wrap items-center gap-3 text-primary/60 text-sm">
								<span className="text-rose-600">Blocked</span>
							</div>
						) : null}
					</div>

					<div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
						<DetailMetric
							label="Last seen"
							tooltip={hero.lastSeen.tooltip}
							value={hero.lastSeen.value}
						/>
						<DetailMetric
							label="First seen"
							tooltip={hero.firstSeen.tooltip}
							value={hero.firstSeen.value}
						/>
						<DetailMetric
							label={mode === "contact" ? "Devices" : "Identity"}
							value={summaryLabel}
						/>
						<DetailMetric
							label="Local time"
							value={localTimeLabel ?? "Unknown"}
						/>
					</div>

					{hasIdentifiers && (
						<ValueGroup className="mt-0 px-0">
							<ValueDisplay
								title="Email"
								value={contact?.email ?? "Not set"}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								title="External ID"
								value={contact?.externalId ?? "Not set"}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								title="Organization ID"
								value={contact?.contactOrganizationId ?? "Not set"}
								withPaddingLeft={false}
							/>
						</ValueGroup>
					)}

					<p
						className="text-pretty text-primary/70 text-sm leading-6"
						data-slot="contact-visitor-summary-copy"
					>
						{visitorInsight}
					</p>

					{heroGlobeData ? (
						<div
							className="lg:hidden"
							data-slot="contact-visitor-detail-mobile-globe-wrapper"
						>
							<DetailHeroGlobe
								globeData={heroGlobeData}
								heightClassName="h-80"
							/>
						</div>
					) : null}
				</div>
			</ScrollArea>

			{heroGlobeData ? (
				<div
					className="-bottom-30 pointer-events-none absolute inset-x-0 hidden lg:block"
					data-slot="contact-visitor-detail-desktop-globe-wrapper"
				>
					<div className="pointer-events-auto mx-auto max-w-lg">
						<DetailHeroGlobe
							globeData={heroGlobeData}
							heightClassName="h-110"
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

function DetailSecondaryPanel({
	contact,
	deviceDetailsById,
	hero,
	heroVisitor,
	mode,
	visitors,
}: {
	contact: DetailContact | null;
	deviceDetailsById: DeviceDetailById;
	hero: HeroDetails;
	heroVisitor: VisitorDetail | null;
	mode: "contact" | "visitor";
	visitors: ContactDetailResponse["visitors"];
}) {
	const metadataEntries = contact?.metadata
		? Object.entries(contact.metadata)
		: [];
	const localTimeFallback = hero.localTime?.time ?? "Local time unavailable";
	const localTimeValue =
		hero.localTime?.time && hero.localTime.offset ? (
			<>
				{hero.localTime.time}
				<span className="ml-2 text-primary/90">({hero.localTime.offset})</span>
			</>
		) : (
			localTimeFallback
		);

	return (
		<ScrollArea
			className="h-full px-5 py-6 lg:px-8 lg:py-8"
			maskHeight="120px"
			scrollMask
		>
			<div
				className="mx-auto flex w-full max-w-sm flex-col gap-8"
				data-slot="contact-visitor-detail-secondary-panel"
			>
				<DevicesSection
					deviceDetailsById={deviceDetailsById}
					heroVisitor={heroVisitor}
					mode={mode}
					visitors={visitors}
				/>
				<VisitorAttributionGroup
					attribution={hero.attribution}
					className="mt-0 px-0"
				/>

				{contact ? (
					<div data-slot="contact-visitor-detail-metadata-panel">
						<ValueGroup className="mt-0 px-0" header="Metadata">
							{metadataEntries.length > 0 ? (
								metadataEntries.map(([key, value]) => (
									<ValueDisplay
										autoFormat
										key={key}
										title={key}
										value={value}
									/>
								))
							) : (
								<p className="text-primary/60 text-sm">
									No metadata has been attached to this contact yet.
								</p>
							)}
						</ValueGroup>
					</div>
				) : (
					<div data-slot="contact-visitor-detail-visitor-panel">
						<ValueGroup className="mt-0 px-0" header="Visitor">
							<ValueDisplay
								placeholder="Unknown"
								title="Location"
								value={hero.locationLabel}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								placeholder="Unknown"
								title="Browser"
								value={hero.browserLabel}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								placeholder="Unknown"
								title="OS"
								value={hero.osLabel}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								placeholder="Unknown"
								title="Device"
								value={hero.deviceLabel}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								placeholder="Unknown"
								title="Language"
								value={formatLanguageLabel(hero.language)}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								title="Local time"
								value={localTimeValue}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								placeholder="Unknown"
								title="IP"
								value={hero.ipAddress}
								withPaddingLeft={false}
							/>
							<ValueDisplay
								placeholder="Unknown"
								title="Viewport"
								value={hero.viewport}
								withPaddingLeft={false}
							/>
							{heroVisitor?.createdAt && (
								<ValueDisplay
									autoFormat
									title="createdAt"
									value={heroVisitor.createdAt}
									withPaddingLeft={false}
								/>
							)}
							{heroVisitor?.lastSeenAt && (
								<ValueDisplay
									autoFormat
									title="lastSeenAt"
									value={heroVisitor.lastSeenAt}
									withPaddingLeft={false}
								/>
							)}
						</ValueGroup>
					</div>
				)}
			</div>
		</ScrollArea>
	);
}

export function ContactVisitorDetailView({
	contact,
	deviceDetailsById,
	globeVisitors,
	heroVisitor,
	isError,
	isLoading,
	leadVisitorSummary,
	mode,
	visitors,
	websiteSlug,
}: ContactVisitorDetailViewProps) {
	const hero = buildHeroDetails({
		contact,
		heroVisitor,
		leadVisitorSummary,
	});

	if (isLoading) {
		return (
			<DashboardOverlayShell
				data-mode={mode}
				dataSlot="contact-visitor-detail-overlay"
			>
				<DashboardOverlayCenteredState>
					<div className="flex items-center gap-3 text-primary/60 text-sm">
						<Spinner className="h-5 w-5" />
						<span>Loading details...</span>
					</div>
				</DashboardOverlayCenteredState>
			</DashboardOverlayShell>
		);
	}

	if (isError) {
		return (
			<DashboardOverlayShell
				data-mode={mode}
				dataSlot="contact-visitor-detail-overlay"
			>
				<div className="px-4 py-6 lg:px-6 lg:py-8">
					<Alert variant="destructive">
						<AlertTitle>Unable to load details</AlertTitle>
						<AlertDescription>
							An unexpected error occurred while loading this contact or
							visitor.
						</AlertDescription>
					</Alert>
				</div>
			</DashboardOverlayShell>
		);
	}

	if (!(contact || heroVisitor) && visitors.length === 0) {
		return (
			<DashboardOverlayShell
				data-mode={mode}
				dataSlot="contact-visitor-detail-overlay"
			>
				<DashboardOverlayCenteredState className="px-6 text-center text-primary/60 text-sm">
					No details are available for this selection.
				</DashboardOverlayCenteredState>
			</DashboardOverlayShell>
		);
	}

	return (
		<DashboardOverlayShell
			data-mode={mode}
			dataSlot="contact-visitor-detail-overlay"
		>
			<div
				className="grid h-full grid-cols-1 lg:grid-cols-2"
				data-slot="contact-visitor-detail-layout"
			>
				<DetailPrimaryPanel
					contact={contact}
					globeVisitors={globeVisitors}
					hero={hero}
					heroVisitor={heroVisitor}
					leadVisitorSummary={leadVisitorSummary}
					mode={mode}
					visitors={visitors}
					websiteSlug={websiteSlug}
				/>
				<DetailSecondaryPanel
					contact={contact}
					deviceDetailsById={deviceDetailsById}
					hero={hero}
					heroVisitor={heroVisitor}
					mode={mode}
					visitors={visitors}
				/>
			</div>
		</DashboardOverlayShell>
	);
}

export function ContactVisitorDetailOverlay() {
	const website = useWebsite();
	const trpc = useTRPC();
	const queryNormalizer = useQueryNormalizer();
	const { activeDetail } = useContactVisitorDetailState();

	const activeContactId =
		activeDetail?.type === "contact" ? activeDetail.contactId : null;
	const activeVisitorId =
		activeDetail?.type === "visitor" ? activeDetail.visitorId : null;

	const contactPlaceholder = useMemo<ContactDetail | undefined>(() => {
		if (!activeContactId) {
			return;
		}

		const candidate = queryNormalizer.getObjectById(activeContactId);

		return isContactDetailResponse(candidate) ? candidate : undefined;
	}, [activeContactId, queryNormalizer]);

	const contactQuery = ReactQuery.useQuery({
		...trpc.contact.get.queryOptions({
			contactId: activeContactId ?? "",
			websiteSlug: website.slug,
		}),
		enabled: Boolean(activeContactId),
		placeholderData: contactPlaceholder,
	});

	const leadVisitorSummary = getLeadVisitorSummary(contactQuery.data);
	const leadVisitorId = activeVisitorId ?? leadVisitorSummary?.id ?? null;

	const visitorPlaceholder = useMemo<VisitorDetail | undefined>(() => {
		if (!leadVisitorId) {
			return;
		}

		return queryNormalizer.getObjectById<VisitorDetail>(leadVisitorId);
	}, [leadVisitorId, queryNormalizer]);

	const visitorQuery = ReactQuery.useQuery({
		...trpc.conversation.getVisitorById.queryOptions({
			visitorId: leadVisitorId ?? "",
			websiteSlug: website.slug,
		}),
		enabled: Boolean(leadVisitorId),
		placeholderData: visitorPlaceholder,
		refetchOnMount: "always",
		staleTime: 0,
	});
	const resolvedHeroVisitor = visitorQuery.data ?? null;

	const contactVisitorDetailsQueries = ReactQuery.useQueries({
		queries:
			activeDetail?.type === "contact"
				? (contactQuery.data?.visitors ?? []).map((visitor) => ({
						...trpc.conversation.getVisitorById.queryOptions({
							visitorId: visitor.id,
							websiteSlug: website.slug,
						}),
						enabled: Boolean(visitor.id),
						placeholderData: queryNormalizer.getObjectById<VisitorDetail>(
							visitor.id
						),
						refetchOnMount: "always",
						staleTime: 0,
					}))
				: [],
	});

	const deviceDetailsById = useMemo<DeviceDetailById>(() => {
		const details: DeviceDetailById = {};

		if (resolvedHeroVisitor) {
			details[resolvedHeroVisitor.id] = {
				deviceType: resolvedHeroVisitor.deviceType,
				ip: resolvedHeroVisitor.ip,
			};
		}

		for (const query of contactVisitorDetailsQueries) {
			const visitor = query.data;

			if (!visitor?.id) {
				continue;
			}

			details[visitor.id] = {
				deviceType: visitor.deviceType,
				ip: visitor.ip,
			};
		}

		return details;
	}, [contactVisitorDetailsQueries, resolvedHeroVisitor]);

	if (!activeDetail) {
		return null;
	}

	return (
		<ContactVisitorDetailView
			contact={
				activeDetail.type === "contact"
					? (contactQuery.data?.contact ?? null)
					: (visitorQuery.data?.contact ?? null)
			}
			deviceDetailsById={deviceDetailsById}
			globeVisitors={contactVisitorDetailsQueries.map(
				(query) => query.data ?? null
			)}
			heroVisitor={resolvedHeroVisitor}
			isError={
				activeDetail.type === "contact"
					? contactQuery.isError
					: visitorQuery.isError
			}
			isLoading={
				activeDetail.type === "contact"
					? contactQuery.isLoading && !contactQuery.data
					: visitorQuery.isLoading && !visitorQuery.data
			}
			leadVisitorSummary={leadVisitorSummary}
			mode={activeDetail.type}
			visitors={contactQuery.data?.visitors ?? []}
			websiteSlug={website.slug}
		/>
	);
}
