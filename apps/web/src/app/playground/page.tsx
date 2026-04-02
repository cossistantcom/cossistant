"use client";

import { useRealtimeSupport } from "@plasma/next/hooks";
import { Support } from "@plasma/next/support";
import { useSupport } from "@plasma/react/index";
import { type DefaultMessage, SenderType } from "@plasma/types";
import Image from "next/image";
import { AsciiImage } from "@/components/ui/ascii-image";
import { Background } from "@/components/ui/background";
import { LogoText } from "@/components/ui/logo";

function PlaygroundPropDisplay({
	name,
	value,
}: {
	name: string;
	value: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4 font-medium uppercase">
			<h2 className="text-primary/80 text-sm">{name}</h2>
			<div className="h-[1px] flex-1 bg-primary/10" />
			<p className="font-mono text-sm">{value}</p>
		</div>
	);
}

const DEFAULT_MESSAGES: DefaultMessage[] = [
	{
		content: "Hi 👋 I'm Coss, I'm here to help you with your questions.",
		senderType: SenderType.AI,
	},
	{
		content:
			"(if you need help or want to chat with Anthony our founder just ask away!)",
		senderType: SenderType.AI,
	},
];

const QUICK_OPTIONS = ["How to install Cossistant?", "Pricing"];

export default function Playground() {
	const { isConnected } = useRealtimeSupport();
	const { size, isOpen } = useSupport();

	return (
		<div className="relative flex min-h-screen flex-col items-center justify-center bg-background p-4 md:p-20">
			<Background asciiOpacity={0.5} />

			{/* Header */}
			<div className="absolute top-4 left-4 z-10 md:top-10 md:left-10">
				<h1 className="flex items-center gap-2 font-f37-stout text-xl">
					<LogoText className="text-background" />
					<span className="-mt-4 font-medium font-mono text-background text-xs">
						playground
					</span>
				</h1>
			</div>

			{/* Centered Widget */}
			<div className="z-10 flex flex-col items-center gap-6">
				<Support
					defaultMessages={DEFAULT_MESSAGES}
					onOpenChange={() => {}}
					open={true}
					quickOptions={QUICK_OPTIONS}
				>
					<Support.Content className="md:!fixed md:!inset-auto md:!left-1/2 md:!top-1/2 md:!-translate-x-1/2 md:!-translate-y-1/2 relative" />
				</Support>
			</div>

			{/* Status Display */}
			<div className="absolute right-4 bottom-4 z-10 w-full max-w-xs md:right-10 md:bottom-10">
				<div className="flex flex-col gap-2">
					<PlaygroundPropDisplay
						name="Websocket healthy"
						value={isConnected.toString()}
					/>
				</div>
			</div>
		</div>
	);
}
