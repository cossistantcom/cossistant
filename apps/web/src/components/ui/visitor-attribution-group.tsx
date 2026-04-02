import type { VisitorAttribution } from "@plasma/types";
import {
	ValueDisplay,
	ValueGroup,
} from "@/components/ui/layout/sidebars/shared";
import { getVisitorAttributionDisplay } from "@/lib/visitor-attribution";

export type VisitorAttributionGroupProps = {
	attribution: VisitorAttribution | null | undefined;
	header?: string;
	className?: string;
	includeDirect?: boolean;
	mode?: "source" | "full";
	withPaddingLeft?: boolean;
};

export function VisitorAttributionGroup({
	attribution,
	header,
	className,
	includeDirect = false,
	mode = "source",
	withPaddingLeft = false,
}: VisitorAttributionGroupProps) {
	const display = getVisitorAttributionDisplay(attribution);
	const rows = [
		display.sourceLabel
			? {
					title: "Source",
					value: display.sourceLabel,
				}
			: null,
		...(mode === "full"
			? [
					display.channelLabel
						? {
								title: "Channel",
								value: display.channelLabel,
							}
						: null,
					display.landingLabel
						? {
								title: "Landing page",
								value: display.landingLabel,
							}
						: null,
					display.campaignLabel
						? {
								title: "Campaign",
								value: display.campaignLabel,
							}
						: null,
					display.adIdsLabel
						? {
								title: "Ad IDs",
								value: display.adIdsLabel,
							}
						: null,
				]
			: []),
	].filter(
		(
			row
		): row is {
			title: string;
			value: string;
		} => Boolean(row)
	);

	if (!includeDirect && display.isDirect) {
		return null;
	}

	if (rows.length === 0) {
		return null;
	}

	return (
		<div data-slot="visitor-attribution-group">
			<ValueGroup className={className} header={header}>
				{rows.map((row) => (
					<ValueDisplay
						key={row.title}
						title={row.title}
						value={row.value}
						withPaddingLeft={withPaddingLeft}
					/>
				))}
			</ValueGroup>
		</div>
	);
}
