import type { Database } from "@api/db";
import { getSupportStateForVisitor } from "@api/db/queries/support";
import type { SupportStateResponse } from "@cossistant/types/api/support";
import { realtime } from "./emitter";

export async function emitSupportStateUpdated(params: {
	db: Database;
	websiteId: string;
	organizationId: string;
	visitorId: string;
	state?: SupportStateResponse | null;
}): Promise<void> {
	const state =
		params.state ??
		(await getSupportStateForVisitor(params.db, {
			websiteId: params.websiteId,
			visitorId: params.visitorId,
		}));

	if (!state) {
		return;
	}

	await realtime.emit("supportStateUpdated", {
		websiteId: params.websiteId,
		organizationId: params.organizationId,
		visitorId: params.visitorId,
		userId: null,
		state,
	});
}
