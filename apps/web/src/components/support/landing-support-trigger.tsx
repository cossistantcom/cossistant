"use client";

import { Support } from "@cossistant/react/support";
import { LandingTriggerContent } from "./custom-trigger";

/**
 * Client Component wrapper for the landing page Support trigger.
 * This is needed because render props (function children) cannot be passed
 * from Server Components to Client Components in Next.js App Router.
 */
export function LandingSupportTrigger() {
	return (
		<Support>
			<Support.Trigger className="fixed right-4 bottom-4 z-[9999] flex size-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors">
				{(props) => <LandingTriggerContent {...props} />}
			</Support.Trigger>
		</Support>
	);
}
