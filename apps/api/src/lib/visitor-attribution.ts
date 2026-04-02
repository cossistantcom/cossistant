import type { VisitorAttribution, VisitorCurrentPage } from "@plasma/types";

export type FlattenedVisitorTrackingContext = {
	page_url: string;
	page_path: string;
	page_title: string;
	page_referrer_url: string;
	attribution_channel: string;
	attribution_is_direct: number;
	attribution_referrer_url: string;
	attribution_referrer_domain: string;
	attribution_landing_url: string;
	attribution_landing_path: string;
	attribution_landing_title: string;
	attribution_utm_source: string;
	attribution_utm_medium: string;
	attribution_utm_campaign: string;
	attribution_utm_content: string;
	attribution_utm_term: string;
	attribution_gclid: string;
	attribution_gbraid: string;
	attribution_wbraid: string;
	attribution_fbclid: string;
	attribution_msclkid: string;
	attribution_ttclid: string;
	attribution_li_fat_id: string;
	attribution_twclid: string;
	attribution_captured_at: string;
};

function toStringOrEmpty(value: string | null | undefined): string {
	return typeof value === "string" ? value : "";
}

export function resolveFirstTouchAttribution(params: {
	existingAttribution?: VisitorAttribution | null;
	incomingAttribution?: VisitorAttribution | null;
}): VisitorAttribution | null {
	if (params.existingAttribution?.firstTouch) {
		return params.existingAttribution;
	}

	return params.incomingAttribution ?? null;
}

export function flattenVisitorTrackingContext(params: {
	attribution?: VisitorAttribution | null;
	currentPage?: VisitorCurrentPage | null;
}): FlattenedVisitorTrackingContext {
	const firstTouch = params.attribution?.firstTouch;
	const currentPage = params.currentPage;

	return {
		page_url: toStringOrEmpty(currentPage?.url),
		page_path: toStringOrEmpty(currentPage?.path),
		page_title: toStringOrEmpty(currentPage?.title),
		page_referrer_url: toStringOrEmpty(currentPage?.referrerUrl),
		attribution_channel: toStringOrEmpty(firstTouch?.channel),
		attribution_is_direct: firstTouch?.isDirect ? 1 : 0,
		attribution_referrer_url: toStringOrEmpty(firstTouch?.referrer.url),
		attribution_referrer_domain: toStringOrEmpty(firstTouch?.referrer.domain),
		attribution_landing_url: toStringOrEmpty(firstTouch?.landing.url),
		attribution_landing_path: toStringOrEmpty(firstTouch?.landing.path),
		attribution_landing_title: toStringOrEmpty(firstTouch?.landing.title),
		attribution_utm_source: toStringOrEmpty(firstTouch?.utm.source),
		attribution_utm_medium: toStringOrEmpty(firstTouch?.utm.medium),
		attribution_utm_campaign: toStringOrEmpty(firstTouch?.utm.campaign),
		attribution_utm_content: toStringOrEmpty(firstTouch?.utm.content),
		attribution_utm_term: toStringOrEmpty(firstTouch?.utm.term),
		attribution_gclid: toStringOrEmpty(firstTouch?.clickIds.gclid),
		attribution_gbraid: toStringOrEmpty(firstTouch?.clickIds.gbraid),
		attribution_wbraid: toStringOrEmpty(firstTouch?.clickIds.wbraid),
		attribution_fbclid: toStringOrEmpty(firstTouch?.clickIds.fbclid),
		attribution_msclkid: toStringOrEmpty(firstTouch?.clickIds.msclkid),
		attribution_ttclid: toStringOrEmpty(firstTouch?.clickIds.ttclid),
		attribution_li_fat_id: toStringOrEmpty(firstTouch?.clickIds.li_fat_id),
		attribution_twclid: toStringOrEmpty(firstTouch?.clickIds.twclid),
		attribution_captured_at: toStringOrEmpty(firstTouch?.capturedAt),
	};
}
