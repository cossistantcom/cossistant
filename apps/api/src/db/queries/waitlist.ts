import { type Database, waitingListEntry } from "@cossistant/database";
import { and, count, eq, gt, lt, or } from "drizzle-orm";

export async function getWaitlistEntryByUserId(
	db: Database,
	params: { userId?: string }
) {
	try {
		const totalEntries = await db
			.select({ count: count() })
			.from(waitingListEntry)
			.$withCache();

		if (!params.userId) {
			return { entry: null, rank: null, totalEntries: totalEntries[0].count };
		}

		const entry = await db.query.waitingListEntry.findFirst({
			where: eq(waitingListEntry.userId, params.userId),
			with: {
				user: true,
			},
		});

		if (!entry) {
			return { entry: null, rank: null, totalEntries: totalEntries[0].count };
		}

		// Take all the person with more points than the current person
		// If there are people with the same points, take the ones that were created before the current person
		const result = await db
			.select({ count: count() })
			.from(waitingListEntry)
			.where(
				or(
					gt(waitingListEntry.points, entry.points),
					and(
						eq(waitingListEntry.points, entry.points),
						lt(waitingListEntry.createdAt, entry.createdAt)
					)
				)
			);

		const rank = result[0].count + 1;

		return {
			entry,
			rank,
			totalEntries: totalEntries[0].count,
		};
	} catch (err) {
		console.error(err);
		return { entry: null, rank: null, totalEntries: 666 };
	}
}
