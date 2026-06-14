import type { ReactElement } from "react";
import { useHomePage } from "../../hooks/use-home-page";
import { useSupport } from "../../provider";
import { PENDING_CONVERSATION_ID } from "../../utils/id";
import { AvatarStack } from "../components/avatar-stack";
import { CoButton } from "../components/button";
import { ConversationButtonLink } from "../components/conversation-button-link";
import { FooterSurface } from "../components/footer-surface";
import { Header } from "../components/header";
import Icon from "../components/icons";
import { Watermark } from "../components/watermark";
import { useSupportSlotOverrides } from "../context/slot-overrides";
import { useSupportNavigation } from "../store/support-store";
import { Text, useSupportText } from "../text";
import { cn } from "../utils";

type HomePageProps = {
	params?: undefined;
};

/**
 * Home page with welcome message, quick options, and conversation starter.
 */
export const HomePage = (_props: HomePageProps = {}): ReactElement => {
	const {
		website,
		availableHumanAgents,
		availableAIAgents,
		visitor,
		quickOptions,
	} = useSupport();
	const { navigate } = useSupportNavigation();
	const text = useSupportText();
	const { slots, slotProps } = useSupportSlotOverrides();
	const HomePageSlot = slots.homePage;
	const homePageSlotProps = slotProps.homePage;

	// Main home page hook - handles all logic
	const home = useHomePage({
		onStartConversation: (initialMessage) => {
			navigate({
				page: "CONVERSATION",
				params: {
					conversationId: PENDING_CONVERSATION_ID,
					initialMessage,
				},
			});
		},
		onOpenConversation: (conversationId) => {
			navigate({
				page: "CONVERSATION",
				params: {
					conversationId,
				},
			});
		},
		onOpenConversationHistory: () => {
			navigate({
				page: "CONVERSATION_HISTORY",
			});
		},
	});

	if (HomePageSlot) {
		return (
			<HomePageSlot
				{...homePageSlotProps}
				availableAIAgents={availableAIAgents}
				availableConversationsCount={home.availableConversationsCount}
				availableHumanAgents={availableHumanAgents}
				className={cn(homePageSlotProps?.className)}
				conversations={home.conversations}
				data-page="HOME"
				data-slot="home-page"
				error={home.error}
				hasConversations={home.hasConversations}
				isLoading={home.isLoading}
				lastOpenConversation={home.lastOpenConversation}
				openConversation={home.openConversation}
				openConversationHistory={home.openConversationHistory}
				quickOptions={quickOptions}
				startConversation={home.startConversation}
				visitor={visitor}
				website={website}
			/>
		);
	}

	return (
		<div
			className="flex h-full flex-col"
			data-page="HOME"
			data-slot="home-page"
		>
			<Header page="HOME">{/* <NavigationTab /> */}</Header>
			<div className="sticky top-0 flex flex-1 px-6">
				<div className="flex flex-col gap-2">
					<div
						className="co-animate-slide-up-blur flex flex-col gap-2"
						style={{ animationDelay: "100ms" }}
					>
						<AvatarStack
							aiAgents={availableAIAgents}
							className="mb-4"
							hideDefaultAIAgent={availableAIAgents.length === 0}
							humanAgents={availableHumanAgents}
							size={44}
							spacing={42}
						/>
						<h2 className="max-w-xs text-balance font-co-sans font-medium text-2xl text-co-primary leading-normal tracking-wide">
							{text("page.home.greeting", {
								visitorName: visitor?.contact?.name?.split(" ")[0] ?? undefined,
							})}
						</h2>
					</div>

					{quickOptions.length > 0 && (
						<div
							className="co-animate-slide-up-blur mt-6 space-x-2 space-y-2"
							style={{ animationDelay: "100ms" }}
						>
							{quickOptions?.map((option) => (
								<CoButton
									className="inline-flex w-fit rounded-co-lg border-dashed px-2"
									key={option}
									onClick={() => home.startConversation(option)}
									size="default"
									variant="outline"
								>
									{option}
								</CoButton>
							))}
						</div>
					)}
				</div>
			</div>
			<FooterSurface
				className="flex flex-shrink-0 flex-col items-center justify-center gap-2 px-6 pb-4"
				page="HOME"
			>
				{home.availableConversationsCount > 0 && (
					<CoButton
						className="relative w-full text-co-primary/40 text-xs hover:text-co-primary"
						onClick={home.openConversationHistory}
						variant="ghost"
					>
						<Text
							as="span"
							textKey="page.home.history.more"
							variables={{ count: home.availableConversationsCount }}
						/>
					</CoButton>
				)}

				{home.lastOpenConversation && (
					<div className="flex w-full flex-col overflow-clip rounded-co border border-co-border/80">
						<ConversationButtonLink
							className="rounded-none"
							conversation={home.lastOpenConversation}
							key={home.lastOpenConversation.id}
							onClick={() => {
								if (home.lastOpenConversation) {
									home.openConversation(home.lastOpenConversation.id);
								}
							}}
						/>
					</div>
				)}

				<div className="sticky bottom-4 z-10 flex w-full flex-col items-center gap-2">
					<CoButton
						className="relative w-full justify-between"
						onClick={() => home.startConversation()}
						size="large"
						variant="secondary"
					>
						<Icon
							className="-translate-y-1/2 absolute top-1/2 right-4 size-3 text-co-primary/60 transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:text-co-primary"
							name="arrow-right"
							variant="default"
						/>
						<Text as="span" textKey="common.actions.askQuestion" />
					</CoButton>
					<Watermark className="mt-4 mb-0" />
				</div>
				<div />
			</FooterSurface>
		</div>
	);
};
