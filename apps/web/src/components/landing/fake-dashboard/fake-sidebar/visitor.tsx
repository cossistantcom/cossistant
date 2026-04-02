"use client";

import { resolveCountryDetails } from "@plasma/location/country-utils";
import { useMemo } from "react";
import { SidebarContainer } from "@/components/ui/layout/sidebars/container";
import {
	CountryFlag,
	formatLocalTime,
} from "@/components/ui/layout/sidebars/visitor/utils";
import { ValueDisplay } from "@/components/ui/layout/sidebars/visitor/value-display";
import { ValueGroup } from "@/components/ui/layout/sidebars/visitor/value-group";
import { VisitorSidebarHeader } from "@/components/ui/layout/sidebars/visitor/visitor-sidebar-header";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import type { FakeVisitor } from "../data";
import { FakeResizableSidebar } from "./fake-resizable-sidebar";

type FakeVisitorSidebarProps = {
	open: boolean;
	visitor: FakeVisitor;
};

export function FakeVisitorSidebar({ open, visitor }: FakeVisitorSidebarProps) {
	const visitorData = useMemo(() => {
		if (!visitor) {
			return null;
		}

		const fullName = getVisitorNameWithFallback(visitor);

		const countryDetails = resolveCountryDetails({
			country: visitor.country,
			countryCode: visitor.countryCode,
			locale: visitor.language,
			timezone: visitor.timezone,
			city: visitor.city,
		});

		const countryLabel = countryDetails.name ?? countryDetails.code;
		const localTime = formatLocalTime(visitor.timezone, visitor.language);
		const timezoneTooltip = visitor.timezone
			? `Timezone: ${visitor.timezone}`
			: undefined;

		return {
			fullName,
			countryDetails,
			countryLabel,
			localTime,
			timezoneTooltip,
		};
	}, [visitor]);

	if (!visitor) {
		return null;
	}

	if (!visitorData) {
		return null;
	}

	return (
		<FakeResizableSidebar className="pointer-events-none" open position="right">
			<SidebarContainer>
				<VisitorSidebarHeader
					avatarUrl={visitor.contact?.image}
					contact={visitor.contact}
					email={visitor.contact?.email}
					fullName={visitorData.fullName}
					lastSeenAt={visitor.lastSeenAt}
					status={undefined}
				/>
				<div className="mt-4 flex flex-col gap-4">
					<ValueGroup>
						<ValueDisplay
							placeholder="Unknown"
							title="Country"
							value={
								visitorData.countryLabel ? (
									<span className="ml-auto inline-flex items-center gap-2">
										{visitorData.countryLabel}
										{visitorData.countryDetails.code ? (
											<CountryFlag
												countryCode={visitorData.countryDetails.code}
											/>
										) : null}
									</span>
								) : null
							}
						/>
						<ValueDisplay
							placeholder="Unknown"
							title="Local time"
							tooltip={visitorData.timezoneTooltip}
							value={
								<>
									{visitorData.localTime.time}
									<span className="ml-2 text-primary/90">
										({visitorData.localTime.offset})
									</span>
								</>
							}
						/>
						<ValueDisplay placeholder="Unknown" title="IP" value={visitor.ip} />
					</ValueGroup>
					<ValueGroup>
						{visitor.browser && (
							<ValueDisplay
								title="Browser"
								value={`${visitor.browser} / ${visitor.browserVersion}`}
							/>
						)}
						{visitor.os && (
							<ValueDisplay
								title="OS"
								value={`${visitor.os} / ${visitor.osVersion}`}
							/>
						)}
						{visitor.device && (
							<ValueDisplay
								title="Device"
								value={`${visitor.device} / ${visitor.deviceType}`}
							/>
						)}
						{visitor.viewport && (
							<ValueDisplay
								title="Viewport"
								tooltip={"The viewport is the visitor's browser window size."}
								value={visitor.viewport}
							/>
						)}
					</ValueGroup>
				</div>
			</SidebarContainer>
		</FakeResizableSidebar>
	);
}
