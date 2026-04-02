import { formatMessagePreview } from "@plasma/tiny-markdown/utils";
import {
	Body,
	Column,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Row,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

// Needed for email templates, don't remove
import React from "react";

const MAX_DISPLAYED_MESSAGES = 5;

import { AVATAR_URL, LOGO_URL } from "../constants";

export function NewMessageInConversation({
	website = {
		name: "Acme",
		slug: "acme",
		logo: null,
	},
	conversationId = "conv_123",
	messages = [
		{
			text: "Hello, how are you?",
			createdAt: new Date(Date.now() - 1000 * 60 * 10) as unknown as string,
			sender: {
				id: "user_123e",
				name: "Anthony",
				image: null,
			},
		},
		{
			text: "You are for sure eligible. We'll most likely make those changes within the next day or two. Stay tuned.",
			createdAt: new Date(Date.now() - 1000 * 60 * 5) as unknown as string,
			sender: {
				id: "user_123",
				name: "Brendan Urie",
				image: null,
			},
		},
		{
			text: "You're all set now!",
			createdAt: new Date() as unknown as string,
			sender: {
				id: "user_123",
				name: "Brendan Urie",
				image: null,
			},
		},
	],
	email = "user@example.com",
	totalCount = 2,
	isReceiverVisitor = true,
}: {
	website: {
		name: string;
		slug: string;
		logo: string | null;
	};
	conversationId: string;
	messages: {
		text: string;
		createdAt: string | Date;
		sender: {
			id: string;
			name: string;
			image: string | null;
		};
	}[];
	email: string;
	totalCount?: number;
	isReceiverVisitor: boolean;
}) {
	// Use totalCount if provided, otherwise fall back to messages.length
	const actualCount = totalCount ?? messages.length;

	// Helper function to determine if a message is the first in its group
	const isFirstInGroup = (
		index: number,
		msgs: Array<{
			text: string;
			createdAt: string | Date;
			sender: { id: string; name: string; image: string | null };
		}>
	): boolean => {
		if (index === 0) {
			return true;
		}
		const currentMsg = msgs[index];
		const previousMsg = msgs[index - 1];
		if (!currentMsg) {
			return true;
		}
		if (!previousMsg) {
			return true;
		}
		return currentMsg.sender.id !== previousMsg.sender.id;
	};

	// Helper function to determine if a message is the last in its group
	const isLastInGroup = (
		index: number,
		msgs: Array<{
			text: string;
			createdAt: string | Date;
			sender: { id: string; name: string; image: string | null };
		}>
	): boolean => {
		if (index === msgs.length - 1) {
			return true;
		}
		const currentMsg = msgs[index];
		const nextMsg = msgs[index + 1];
		if (!currentMsg) {
			return true;
		}
		if (!nextMsg) {
			return true;
		}
		return currentMsg.sender.id !== nextMsg.sender.id;
	};

	return (
		<Html>
			<Head />
			<Preview>New message from {website.name}</Preview>
			<Tailwind>
				<Body className="mx-auto my-auto bg-white font-sans">
					<Container className="mx-auto my-8 max-w-[600px] px-8 py-8">
						<Section className="mt-8">
							{website.logo && (
								<Img alt={website.name} height="24" src={website.logo} />
							)}
						</Section>

						<Section className="my-8">
							<Heading className="my-0 font-semibold text-black text-xl">
								{website.name} support
							</Heading>
							<Text className="mt-2 text-[14px] text-neutral-600">
								You have{" "}
								{actualCount > 1
									? `${actualCount} new messages`
									: "a new message"}{" "}
								in your conversation
							</Text>
						</Section>

						<Section className="my-4">
							{actualCount > MAX_DISPLAYED_MESSAGES && (
								<Text className="mb-3 text-center text-[12px] text-neutral-500">
									+{actualCount - MAX_DISPLAYED_MESSAGES} earlier{" "}
									{actualCount - MAX_DISPLAYED_MESSAGES === 1
										? "message"
										: "messages"}
								</Text>
							)}
							{messages.slice(0, MAX_DISPLAYED_MESSAGES).map((message, idx) => {
								const firstInGroup = isFirstInGroup(
									idx,
									messages.slice(0, MAX_DISPLAYED_MESSAGES)
								);
								const lastInGroup = isLastInGroup(
									idx,
									messages.slice(0, MAX_DISPLAYED_MESSAGES)
								);

								return (
									<React.Fragment key={idx}>
										<Row
											className={
												firstInGroup && idx > 0 ? "pt-3" : idx > 0 ? "pt-1" : ""
											}
										>
											<Column className="w-full">
												{firstInGroup && (
													<Text className="my-0 font-medium text-[12px] text-neutral-500">
														<span className="text-neutral-700">
															{message.sender.name}
														</span>
														&nbsp;&nbsp;
														{new Date(message.createdAt).toLocaleTimeString(
															"en-US",
															{
																hour: "numeric",
																minute: "numeric",
															}
														)}
													</Text>
												)}
												<Text
													className="my-0 rounded-lg rounded-bl-none bg-neutral-100 px-4 py-2.5 text-neutral-800 text-sm leading-5"
													style={{ whiteSpace: "pre-wrap" }}
												>
													{formatMessagePreview(message.text)}
												</Text>
											</Column>
										</Row>
										{lastInGroup && (
											<Row className="mt-2">
												<Column className="align-top" style={{ width: "28px" }}>
													<Img
														alt={message.sender.name}
														className="rounded-full"
														height="28"
														src={
															message.sender.image ||
															`${AVATAR_URL}${encodeURIComponent(message.sender.name)}`
														}
														width="28"
													/>
												</Column>
											</Row>
										)}
									</React.Fragment>
								);
							})}
							{isReceiverVisitor ? (
								<Text className="mt-4 text-center font-medium text-[12px] text-primary">
									You can reply by replying to this email.
								</Text>
							) : (
								<Link
									className="mt-14 block rounded-lg bg-neutral-900 px-6 py-3 text-center font-medium text-[13px] text-white no-underline"
									href={`https://plasma-pandora.com/${website.slug}/inbox/${conversationId}`}
								>
									View conversation in Dashboard
								</Link>
							)}
						</Section>

						{!isReceiverVisitor && (
							<Text className="text-center text-[12px] text-neutral-500 leading-6">
								You can change your notification preferences in the dashboard
								settings.
							</Text>
						)}
						<Text className="text-center text-[11px] text-neutral-400">
							Our support is powered by{" "}
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

export default NewMessageInConversation;
