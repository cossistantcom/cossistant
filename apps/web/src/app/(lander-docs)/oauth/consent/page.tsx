import { utilityNoindex } from "@/lib/metadata";
import { OAuthConsentClient } from "./oauth-consent-client";

export const dynamic = "force-dynamic";

export const metadata = utilityNoindex({
	title: "Authorize agent access",
	path: "/oauth/consent",
});

export default function OAuthConsentPage() {
	return (
		<div className="flex min-h-screen w-full items-center justify-center border-b border-dashed px-4 py-10">
			<OAuthConsentClient />
		</div>
	);
}
