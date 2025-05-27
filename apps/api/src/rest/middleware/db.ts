import { db } from "@repo/database";
import type { MiddlewareHandler } from "hono";

/**
 * Database middleware that connects to the database and sets it on context
 */
export const withDatabase: MiddlewareHandler = async (c, next) => {
  // Set database on context
  c.set("db", db);

  await next();
};
