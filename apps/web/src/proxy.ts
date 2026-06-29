import { trackAICrawlerRequest } from "@datafast/ai-crawl";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import {
	type NextFetchEvent,
	type NextRequest,
	NextResponse,
} from "next/server";
import { isDatafastEnabled } from "@/lib/analytics-flags";
import { DATAFAST_DOMAIN, DATAFAST_WEBSITE_ID } from "@/lib/datafast";

const { rewrite: rewriteDocs } = rewritePath(
	"/docs{/*path}",
	"/llms.mdx/docs{/*path}"
);
const { rewrite: rewriteBlog } = rewritePath(
	"/blog{/*path}",
	"/llms.mdx/blog{/*path}"
);
const { rewrite: rewriteChangelog } = rewritePath(
	"/changelog{/*path}",
	"/llms.mdx/changelog{/*path}"
);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
	if (isDatafastEnabled()) {
		trackAICrawlerRequest(request, event, {
			domain: DATAFAST_DOMAIN,
			websiteId: DATAFAST_WEBSITE_ID,
		});
	}

	if (isMarkdownPreferred(request)) {
		const pathname = request.nextUrl.pathname;
		const result =
			rewriteDocs(pathname) ||
			rewriteBlog(pathname) ||
			rewriteChangelog(pathname);

		if (result) {
			return NextResponse.rewrite(new URL(result, request.nextUrl));
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
