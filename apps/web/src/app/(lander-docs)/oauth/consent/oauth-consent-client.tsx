"use client";

import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getApiOrigin } from "@/lib/url";

type ConsentResponse = {
	url?: string;
	redirect_uri?: string;
};

function parseSignedOAuthQuery(search: string): string | undefined {
	const params = new URLSearchParams(search);

	if (!params.has("sig")) {
		return search.startsWith("?") ? search.slice(1) : search;
	}

	const signedParams = new URLSearchParams();
	for (const [key, value] of params.entries()) {
		signedParams.append(key, value);
		if (key === "sig") {
			break;
		}
	}

	return signedParams.toString();
}

function formatScope(scope: string) {
	switch (scope) {
		case "support:read":
			return "Read support knowledge and conversations";
		case "offline_access":
			return "Stay connected after the current session";
		case "openid":
			return "Confirm your Cossistant identity";
		case "profile":
			return "Read your basic profile";
		case "email":
			return "Read your email address";
		default:
			return scope;
	}
}

export function OAuthConsentClient() {
	const searchParams = useSearchParams();
	const [isSubmitting, setIsSubmitting] = useState<"accept" | "deny" | null>(
		null
	);
	const [error, setError] = useState<string | null>(null);
	const clientId = searchParams.get("client_id") ?? "AI agent";
	const scopes = useMemo(
		() => (searchParams.get("scope") ?? "support:read").split(" "),
		[searchParams]
	);

	const submitConsent = async (accept: boolean) => {
		setError(null);
		setIsSubmitting(accept ? "accept" : "deny");

		try {
			const response = await fetch(
				`${getApiOrigin()}/api/auth/oauth2/consent`,
				{
					method: "POST",
					credentials: "include",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						accept,
						oauth_query: parseSignedOAuthQuery(window.location.search),
					}),
				}
			);

			const payload = (await response
				.json()
				.catch(() => null)) as ConsentResponse | null;

			if (!response.ok) {
				throw new Error("Unable to complete authorization");
			}

			const redirectUrl = payload?.url ?? payload?.redirect_uri;
			if (!redirectUrl) {
				throw new Error("Missing authorization redirect");
			}

			window.location.assign(redirectUrl);
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: "Unable to complete authorization"
			);
			setIsSubmitting(null);
		}
	};

	return (
		<section className="flex w-full max-w-md flex-col gap-6">
			<div className="flex flex-col items-center gap-3 text-center">
				<div className="flex size-10 items-center justify-center rounded-[4px] border border-dashed bg-background-200">
					<ShieldCheck className="size-5 text-primary/70" />
				</div>
				<div className="space-y-2">
					<h1 className="font-f37-stout text-4xl">Authorize access</h1>
					<p className="text-primary/60 text-sm">
						{clientId} wants to connect to your Cossistant support workspace.
					</p>
				</div>
			</div>

			<div className="rounded-[4px] border border-dashed bg-background p-4">
				<ul className="space-y-3 text-sm">
					{scopes.map((scope) => (
						<li className="flex items-start gap-3" key={scope}>
							<span className="mt-1 size-1.5 rounded-full bg-primary/60" />
							<span>{formatScope(scope)}</span>
						</li>
					))}
				</ul>
			</div>

			{error ? (
				<p className="text-center text-destructive text-sm">{error}</p>
			) : null}

			<div className="grid grid-cols-2 gap-2">
				<Button
					disabled={Boolean(isSubmitting)}
					onClick={() => submitConsent(false)}
					size="lg"
					type="button"
					variant="outline"
				>
					Deny
				</Button>
				<Button
					disabled={Boolean(isSubmitting)}
					onClick={() => submitConsent(true)}
					size="lg"
					type="button"
				>
					{isSubmitting === "accept" ? "Authorizing..." : "Authorize"}
				</Button>
			</div>
		</section>
	);
}
