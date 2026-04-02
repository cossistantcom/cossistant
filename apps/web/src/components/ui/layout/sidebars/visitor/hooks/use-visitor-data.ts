import type { RouterOutputs } from "@api/trpc/types";
import { resolveCountryDetails } from "@plasma/location/country-utils";
import { useMemo } from "react";
import { useVisitorPresenceById } from "@/contexts/visitor-presence";
import { getVisitorNameWithFallback } from "@/lib/visitors";
import { formatLocalTime } from "../utils/time-formatting";

export type UseVisitorDataProps = {
	visitor: RouterOutputs["conversation"]["getVisitorById"] | null;
};

export type VisitorData = {
	fullName: string;
	presence: ReturnType<typeof useVisitorPresenceById>;
	countryDetails: ReturnType<typeof resolveCountryDetails>;
	countryLabel: string | null;
	localTime: {
		time: string | null;
		offset: string | null;
	};
	timezoneTooltip: string | undefined;
};

/**
 * Hook that computes and formats all visitor data for display.
 * Handles country details, local time, presence, and other visitor metadata.
 */
export function useVisitorData({
	visitor,
}: UseVisitorDataProps): VisitorData | null {
	const presence = useVisitorPresenceById(visitor?.id);

	const data = useMemo(() => {
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
			presence,
			countryDetails,
			countryLabel,
			localTime,
			timezoneTooltip,
		};
	}, [visitor, presence]);

	return data;
}
