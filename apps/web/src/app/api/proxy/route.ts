// TODO: Uncomment when OpenAPI docs are needed (requires fumadocs-openapi v10 migration)
// See: https://www.fumadocs.dev/blog/openapi-v10 for migration guide
//
// import { openapi } from "@/lib/openapi";
//
// export const { GET, HEAD, PUT, POST, PATCH, DELETE } = openapi.createProxy({
// 	// optional, we recommend to set a list of allowed origins for proxied requests
// 	allowedOrigins: ["https://plasma-pandora.com"],
// });

import { NextResponse } from "next/server";

export function GET() {
	return NextResponse.json(
		{ error: "OpenAPI proxy not configured" },
		{ status: 501 }
	);
}
