const LEGACY_API_DOCS_URL = "https://api.plasma-pandora.com/docs";
const SEARCH_ENGINE_NOINDEX = "noindex, nofollow";

function buildRedirectResponse() {
	return new Response(null, {
		status: 308,
		headers: {
			Location: LEGACY_API_DOCS_URL,
			"X-Robots-Tag": SEARCH_ENGINE_NOINDEX,
		},
	});
}

export async function GET() {
	return buildRedirectResponse();
}

export async function HEAD() {
	return buildRedirectResponse();
}
