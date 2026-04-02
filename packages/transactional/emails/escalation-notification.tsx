import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Link,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

// Needed for email templates, don't remove
import React from "react";

export function EscalationNotification({
	website = {
		name: "Acme",
		slug: "acme",
	},
	conversationId = "conv_123",
	escalationReason = "Visitor requested to speak with a human",
	summary = "A visitor has questions about their account billing that require human review. They mentioned issues with a recent charge and would like clarification.",
	keyPoints = [
		"Visitor concerned about billing",
		"Needs clarification on recent charge",
		"Has been waiting for a response",
	],
	visitorName = "Visitor",
	aiAgentName = "Support AI",
}: {
	website: {
		name: string;
		slug: string;
	};
	conversationId: string;
	escalationReason: string;
	summary: string;
	keyPoints?: string[];
	visitorName: string;
	aiAgentName: string;
}) {
	return (
		<Html>
			<Head />
			<Preview>Human help needed - {website.name}</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-white font-sans">
					<Container className="mx-auto my-8 max-w-[600px] px-8 py-8">
						<Section className="my-8">
							<Heading className="my-0 font-semibold text-black text-xl">
								🚨 Human Help Needed
							</Heading>
							<Text className="mt-2 text-[14px] text-neutral-600">
								{aiAgentName} has escalated a conversation on {website.name}{" "}
								that needs your attention.
							</Text>
						</Section>

						<Hr className="my-4 border-neutral-200" />

						<Section className="my-4">
							<Text className="my-0 font-medium text-[12px] text-neutral-500 uppercase tracking-wide">
								Escalation Reason
							</Text>
							<Text className="mt-1 text-[14px] text-neutral-800">
								{escalationReason}
							</Text>
						</Section>

						<Section className="my-4">
							<Text className="my-0 font-medium text-[12px] text-neutral-500 uppercase tracking-wide">
								Conversation with {visitorName}
							</Text>
							<Text className="mt-1 text-[14px] text-neutral-800">
								{summary}
							</Text>
						</Section>

						{keyPoints && keyPoints.length > 0 && (
							<Section className="my-4">
								<Text className="my-0 font-medium text-[12px] text-neutral-500 uppercase tracking-wide">
									Key Points
								</Text>
								<ul className="m-0 mt-1 list-disc pl-4">
									{keyPoints.map((point, idx) => (
										<li
											className="text-[14px] text-neutral-800 leading-6"
											key={idx}
										>
											{point}
										</li>
									))}
								</ul>
							</Section>
						)}

						<Section className="my-6">
							<Link
								className="block rounded-lg bg-neutral-900 px-6 py-3 text-center font-medium text-[13px] text-white no-underline"
								href={`https://plasma-pandora.com/${website.slug}/inbox/${conversationId}`}
							>
								View Conversation
							</Link>
						</Section>

						<Hr className="my-4 border-neutral-200" />

						<Text className="text-center text-[12px] text-neutral-500 leading-6">
							You can change your notification preferences in the dashboard
							settings.
						</Text>
						<Text className="text-center text-[11px] text-neutral-400">
							Powered by{" "}
							<Link
								className="text-neutral-500 underline"
								href="https://plasma-pandora.com"
							>
								Cossistant
							</Link>
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

export default EscalationNotification;
