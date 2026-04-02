import type { ContactRecord } from "@api/db/queries/contact";
import type { getCompleteVisitorWithContact } from "@api/db/queries/visitor";
import type { ContactResponse, VisitorResponse } from "@plasma/types";

export type CompleteVisitorRecord = NonNullable<
	Awaited<ReturnType<typeof getCompleteVisitorWithContact>>
>;

export function formatContactResponse(record: ContactRecord): ContactResponse {
	return {
		id: record.id,
		externalId: record.externalId,
		name: record.name,
		email: record.email,
		image: record.image,
		metadata: (record.metadata ?? null) as ContactResponse["metadata"],
		contactOrganizationId: record.contactOrganizationId,
		websiteId: record.websiteId,
		organizationId: record.organizationId,
		userId: record.userId,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
	};
}

export function formatVisitorWithContactResponse(
	record: CompleteVisitorRecord
): VisitorResponse {
	return {
		id: record.id,
		browser: record.browser,
		browserVersion: record.browserVersion,
		os: record.os,
		osVersion: record.osVersion,
		device: record.device,
		deviceType: record.deviceType,
		ip: record.ip,
		city: record.city,
		region: record.region,
		country: record.country,
		countryCode: record.countryCode,
		latitude: record.latitude,
		longitude: record.longitude,
		language: record.language,
		timezone: record.timezone,
		screenResolution: record.screenResolution,
		viewport: record.viewport,
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		lastSeenAt: record.lastSeenAt ?? null,
		websiteId: record.websiteId,
		organizationId: record.organizationId,
		blockedAt: record.blockedAt ?? null,
		blockedByUserId: record.blockedByUserId,
		isBlocked: Boolean(record.blockedAt),
		attribution: record.attribution ?? null,
		currentPage: record.currentPage ?? null,
		contact: record.contact ? formatContactResponse(record.contact) : null,
	} satisfies VisitorResponse;
}
