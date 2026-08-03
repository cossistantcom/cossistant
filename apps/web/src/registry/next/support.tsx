"use client";

import { Support as CossistantSupport } from "@cossistant/next/support";
import { motion } from "motion/react";
import { TriggerContent } from "./bubble";

export function Support() {
	return (
		<CossistantSupport>
			<CossistantSupport.Trigger asChild>
				{(props) => (
					<motion.button
						className="relative flex size-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
						type="button"
						whileTap={{ scale: 0.95 }}
					>
						<TriggerContent {...props} />
					</motion.button>
				)}
			</CossistantSupport.Trigger>
		</CossistantSupport>
	);
}
