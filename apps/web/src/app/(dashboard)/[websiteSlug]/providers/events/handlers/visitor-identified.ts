import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { getVisitorPresenceQueryKeyPrefix } from "@/data/use-visitor-presence";
import type { DashboardRealtimeContext } from "../types";

type VisitorIdentifiedEvent = RealtimeEvent<"visitorIdentified">;

type QueryKeyProcedurePath = readonly [string, string];

type QueryKeyWithInput = {
	input?: {
		websiteSlug?: string;
		visitorId?: string;
	};
	type?: string;
};

function extractProcedurePath(
	queryKey: readonly unknown[]
): QueryKeyProcedurePath | null {
	const maybeProcedurePath = queryKey[0];
	if (!Array.isArray(maybeProcedurePath) || maybeProcedurePath.length < 2) {
		return null;
	}

	const namespace = maybeProcedurePath[0];
	const procedure = maybeProcedurePath[1];
	if (typeof namespace !== "string" || typeof procedure !== "string") {
		return null;
	}

	return [namespace, procedure];
}

function extractQueryInput(
	queryKey: readonly unknown[]
): QueryKeyWithInput["input"] | null {
	if (queryKey.length < 2) {
		return null;
	}

	const maybeInput = queryKey[1];
	if (!maybeInput || typeof maybeInput !== "object") {
		return null;
	}

	const input = (maybeInput as QueryKeyWithInput).input;
	if (!input || typeof input !== "object") {
		return null;
	}

	return input;
}

function matchesWebsiteScope(
	queryKey: readonly unknown[],
	websiteSlug: string
): boolean {
	const input = extractQueryInput(queryKey);
	if (!input?.websiteSlug) {
		return true;
	}
	return input.websiteSlug === websiteSlug;
}

export const handleVisitorIdentified = ({
	event,
	context,
}: {
	event: VisitorIdentifiedEvent;
	context: DashboardRealtimeContext;
}) => {
	if (event.payload.websiteId !== context.website.id) {
		return;
	}

	context.queryNormalizer.setNormalizedData(event.payload.visitor);

	const visitorDetailQueries = context.queryClient.getQueryCache().findAll({
		predicate: (query) => {
			const queryKey = query.queryKey as readonly unknown[];
			const procedurePath = extractProcedurePath(queryKey);
			if (!procedurePath) {
				return false;
			}

			const [namespace, procedure] = procedurePath;
			if (namespace !== "conversation" || procedure !== "getVisitorById") {
				return false;
			}

			const input = extractQueryInput(queryKey);
			if (!input) {
				return false;
			}

			return (
				input.websiteSlug === context.website.slug &&
				input.visitorId === event.payload.visitorId
			);
		},
	});

	for (const query of visitorDetailQueries) {
		const queryKey = query.queryKey as readonly unknown[];
		context.queryClient.setQueryData(queryKey, event.payload.visitor);
		context.queryClient
			.invalidateQueries({
				queryKey,
				exact: true,
			})
			.catch((error) => {
				console.error("Failed to invalidate visitor queries:", error);
			});
	}

	const contactListQueries = context.queryClient.getQueryCache().findAll({
		predicate: (query) => {
			const queryKey = query.queryKey as readonly unknown[];
			const procedurePath = extractProcedurePath(queryKey);
			if (!procedurePath) {
				return false;
			}

			const [namespace, procedure] = procedurePath;
			if (namespace !== "contact" || procedure !== "list") {
				return false;
			}

			return matchesWebsiteScope(queryKey, context.website.slug);
		},
	});

	for (const query of contactListQueries) {
		const queryKey = query.queryKey as readonly unknown[];
		context.queryClient
			.invalidateQueries({
				queryKey,
				exact: true,
			})
			.catch((error) => {
				console.error("Failed to invalidate contact list queries:", error);
			});
	}

	context.queryClient
		.invalidateQueries({
			queryKey: getVisitorPresenceQueryKeyPrefix(context.website.slug),
		})
		.catch((error) => {
			console.error("Failed to invalidate visitor presence queries:", error);
		});
};
