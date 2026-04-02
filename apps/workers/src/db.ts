import * as schema from "@plasma/api/schema";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { env } from "./env";

let _db: NodePgDatabase<typeof schema> | null = null;

function createDb(): NodePgDatabase<typeof schema> {
	if (_db) {
		return _db;
	}

	_db = drizzle({
		connection: {
			host: env.DATABASE_HOST,
			port: env.DATABASE_PORT,
			user: env.DATABASE_USERNAME,
			password: env.DATABASE_PASSWORD,
			database: env.DATABASE_NAME,
			ssl:
				env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
		},
		schema,
	});

	return _db;
}

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export const db = new Proxy({} as Database, {
	get: (target, prop) => {
		const actualDb = createDb();
		return actualDb[prop as keyof typeof actualDb];
	},
});
