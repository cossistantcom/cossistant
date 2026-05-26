import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

import React from "react";
import { LOGO_URL } from "../constants";

type OpenRouterByokProblemAlertProps = {
	website: {
		name: string;
		slug: string;
		domain: string;
	};
	maskedKey: string;
	errorCode: string;
	checkedAt: string;
	settingsUrl: string;
};

function formatCheckedAt(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}

	return parsed.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
	});
}

export function OpenRouterByokProblemAlert({
	website = {
		name: "Acme",
		slug: "acme",
		domain: "acme.com",
	},
	maskedKey = "sk-or-v1...abcdef",
	errorCode = "provider_error",
	checkedAt = new Date().toISOString(),
	settingsUrl = `https://cossistant.com/${website.slug}/settings/developers`,
}: OpenRouterByokProblemAlertProps) {
	return (
		<Html>
			<Head />
			<Preview>OpenRouter key needs attention - {website.name}</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-white font-sans">
					<Container className="mx-auto my-8 max-w-[600px] px-8 py-8">
						<Section className="mt-8">
							<Img
								alt="Cossistant"
								className="h-auto w-[120px]"
								src={LOGO_URL}
							/>
						</Section>

						<Section className="my-8">
							<Heading className="my-0 font-semibold text-black text-xl">
								OpenRouter key needs attention
							</Heading>
							<Text className="mt-2 text-[14px] text-neutral-600">
								BYOK is enabled for {website.name}, but a website-scoped
								OpenRouter call failed while using the saved customer key.
							</Text>
						</Section>

						<Section className="my-4 rounded-lg bg-neutral-50 px-5 py-4">
							<Text className="my-0 font-medium text-[12px] text-neutral-500 uppercase tracking-wide">
								Website
							</Text>
							<Text className="mt-1 mb-4 text-[14px] text-neutral-800">
								{website.name} ({website.domain})
							</Text>

							<Text className="my-0 font-medium text-[12px] text-neutral-500 uppercase tracking-wide">
								Saved key
							</Text>
							<Text className="mt-1 mb-4 font-mono text-[13px] text-neutral-800">
								{maskedKey}
							</Text>

							<Text className="my-0 font-medium text-[12px] text-neutral-500 uppercase tracking-wide">
								Last error
							</Text>
							<Text className="mt-1 mb-4 font-mono text-[13px] text-neutral-800">
								{errorCode}
							</Text>

							<Text className="my-0 font-medium text-[12px] text-neutral-500 uppercase tracking-wide">
								Checked at
							</Text>
							<Text className="mt-1 mb-0 text-[14px] text-neutral-800">
								{formatCheckedAt(checkedAt)}
							</Text>
						</Section>

						<Text className="text-[14px] text-neutral-700 leading-6">
							Cossistant retried the request with our OpenRouter key so the
							workflow could continue. Normal Cossistant AI credit billing
							applies to the fallback call.
						</Text>

						<Section className="my-6">
							<Button
								className="inline-block rounded-[6px] bg-black px-[24px] py-[12px] text-center font-medium text-white no-underline"
								href={settingsUrl}
							>
								Review Developer settings
							</Button>
						</Section>

						<Hr className="my-4 border-neutral-200" />

						<Text className="text-[12px] text-neutral-500 leading-6">
							This alert is sent to organization owners at most once per website
							every 24 hours.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

export default OpenRouterByokProblemAlert;
