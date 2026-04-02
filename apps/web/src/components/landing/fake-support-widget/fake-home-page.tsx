"use client";

import { AvatarStack } from "@plasma/react/support/components/avatar-stack";
import { CoButton as Button } from "@plasma/react/support/components/button";
import Icon from "@plasma/react/support/components/icons";
import { Watermark } from "@plasma/react/support/components/watermark";
import { motion } from "motion/react";
import { forwardRef } from "react";
import { useFakeSupport } from "./fake-support-context";
import { useFakeSupportConfig } from "./fake-support-store";
import { useSupportText } from "./fake-support-text";

/**
 * Fake Header component that mimics the real Header but uses fake hooks
 */
function FakeHeader({ children }: { children?: React.ReactNode }) {
	const { close } = useFakeSupportConfig();

	return (
		<div className="absolute inset-x-0 top-0 z-10 h-18">
			<div className="absolute inset-0 z-10 flex items-center justify-between gap-3 px-4">
				<div className="flex flex-1 items-center gap-3">{children}</div>
				<Button onClick={close} size="icon" type="button" variant="ghost">
					<Icon name="close" />
				</Button>
			</div>
		</div>
	);
}

type FakeHomePageProps = {
	onStartConversation: () => void;
	showMouseCursor?: boolean;
};

/**
 * Fake home page for the support widget animation.
 * Simplified version of the real HomePage component.
 */
export const FakeHomePage = forwardRef<HTMLButtonElement, FakeHomePageProps>(
	({ onStartConversation, showMouseCursor }, buttonRef) => {
		const { website, availableHumanAgents, visitor } = useFakeSupport();
		const text = useSupportText();

		return (
			<>
				<FakeHeader>{/* Empty header like real HomePage */}</FakeHeader>
				<div className="relative flex flex-1 flex-col px-6 pt-10">
					<div className="flex flex-col gap-2">
						<motion.div
							animate="visible"
							className="flex flex-col gap-2"
							exit="exit"
							initial="hidden"
							transition={{
								delay: 0.1,
							}}
							variants={{
								hidden: { opacity: 0, y: 20, filter: "blur(12px)" },
								visible: { opacity: 1, y: 0, filter: "blur(0px)" },
								exit: { opacity: 0, y: 20, filter: "blur(12px)" },
							}}
						>
							<AvatarStack
								aiAgents={website?.availableAIAgents || []}
								humanAgents={availableHumanAgents}
								size={44}
								spacing={32}
							/>
							<h2 className="max-w-xs text-balance font-co-sans font-medium text-2xl leading-normal">
								{text("page.home.greeting", {
									visitorName:
										visitor?.contact?.name?.split(" ")[0] ?? undefined,
								})}
							</h2>
						</motion.div>
					</div>
				</div>
				<div className="flex flex-shrink-0 flex-col items-center justify-center gap-2 px-6 pb-4">
					<div className="sticky bottom-4 z-10 flex w-full flex-col items-center gap-2">
						<Button
							className="relative w-full justify-between"
							onClick={onStartConversation}
							ref={buttonRef}
							size="large"
							variant="secondary"
						>
							<Icon
								className="-translate-y-1/2 absolute top-1/2 right-4 size-3 text-co-primary/60 transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:text-co-primary"
								name="arrow-right"
								variant="default"
							/>
							<span>{text("common.actions.askQuestion")}</span>
						</Button>
						<Watermark className="mt-4 mb-0" />
					</div>
					<div />
				</div>
			</>
		);
	}
);

FakeHomePage.displayName = "FakeHomePage";
