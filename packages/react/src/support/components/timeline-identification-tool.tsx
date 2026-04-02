import type { SendTimelineItemRequest } from "@plasma/types/api/timeline-item";
import {
	ConversationEventType,
	ConversationTimelineType,
	TimelineItemVisibility,
} from "@plasma/types/enums";
import { type FormEventHandler, useCallback, useMemo, useState } from "react";

import { useVisitor } from "../../hooks/use-visitor";
import { useSupport } from "../../provider";
import { useSupportText } from "../text";
import { CoButton } from "./button";
import type { ConversationTimelineToolProps } from "./conversation-timeline";

export const IdentificationTimelineTool: React.FC<
	ConversationTimelineToolProps
> = ({ conversationId }) => {
	const text = useSupportText();
	const { identify, visitor } = useVisitor();
	const { client } = useSupport();
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<
		"idle" | "submitting" | "success" | "error"
	>("idle");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const isAlreadyIdentified = Boolean(visitor?.contact);
	const hasSucceeded = status === "success" || isAlreadyIdentified;

	const ctaLabel = text("component.identificationTool.cta");
	const successLabel = text("component.identificationTool.success");
	const description = text("component.identificationTool.description");
	const title = text("component.identificationTool.title");

	const submitDisabled = hasSucceeded || status === "submitting";

	const handleSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
		async (event) => {
			event.preventDefault();

			if (submitDisabled) {
				return;
			}

			const trimmedEmail = email.trim();
			if (!trimmedEmail) {
				setErrorMessage(text("component.identificationTool.validation"));
				return;
			}

			setStatus("submitting");
			setErrorMessage(null);

			try {
				const identifyResult = await identify({ email: trimmedEmail });

				if (!identifyResult) {
					setStatus("error");
					setErrorMessage(text("component.identificationTool.error"));
					return;
				}

				const payload: SendTimelineItemRequest = {
					conversationId,
					item: {
						type: ConversationTimelineType.EVENT,
						text: "",
						tool: null,
						parts: [
							{
								type: "event" as const,
								eventType: ConversationEventType.VISITOR_IDENTIFIED,
								actorUserId: null,
								actorAiAgentId: null,
								targetUserId: null,
								targetAiAgentId: null,
								message: null,
							},
						],
						visitorId: identifyResult.visitorId,
						visibility: TimelineItemVisibility.PUBLIC,
					},
				};

				await client?.sendMessage(payload);

				setStatus("success");
				setEmail("");

				void client?.fetchWebsite({ force: true }).catch(() => {});
			} catch {
				setStatus("error");
				setErrorMessage(text("component.identificationTool.error"));
			}
		},
		[conversationId, email, identify, client, submitDisabled, text]
	);

	const helperMessage = useMemo(() => {
		if (errorMessage) {
			return (
				<p className="text-co-destructive text-xs" role="alert">
					{errorMessage}
				</p>
			);
		}

		if (hasSucceeded) {
			return <p className="text-co-primary text-xs">{successLabel}</p>;
		}

		return null;
	}, [errorMessage, hasSucceeded, successLabel]);

	return (
		<div className="mt-6 rounded border border-co-border bg-co-background p-4">
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1">
					<h3 className="font-semibold text-sm">{title}</h3>
					<p className="text-co-muted-foreground text-xs">{description}</p>
				</div>
				{hasSucceeded ? (
					<div className="rounded-md bg-co-primary/10 px-3 py-2 text-co-primary text-sm">
						{successLabel}
					</div>
				) : (
					<form className="flex gap-2" onSubmit={handleSubmit}>
						<input
							aria-label={text("component.identificationTool.inputLabel")}
							autoComplete="email"
							className="h-10 w-full rounded border border-co-border bg-transparent px-3 py-2 text-sm outline-none focus:border-co-primary focus:ring-2 focus:ring-co-primary/20"
							disabled={submitDisabled}
							inputMode="email"
							onChange={(event) => setEmail(event.target.value)}
							placeholder={text(
								"component.identificationTool.inputPlaceholder"
							)}
							type="email"
							value={email}
						/>
						{helperMessage}
						<CoButton className="h-10" disabled={submitDisabled} type="submit">
							{status === "submitting"
								? text("component.identificationTool.loading")
								: ctaLabel}
						</CoButton>
					</form>
				)}
			</div>
		</div>
	);
};

IdentificationTimelineTool.displayName = "IdentificationTimelineTool";
