"use client";

import type React from "react";
import { forwardRef, useEffect, useRef, useState } from "react";
import { Avatar, Facehash } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import { Spinner } from "../../../../components/ui/spinner";
import { AnimatedBeam } from "../animated-beam";

const Circle = forwardRef<
	HTMLDivElement,
	{ className?: string; children?: React.ReactNode }
>(({ className, children }, ref) => (
	<div
		className={cn(
			"relative z-10 flex size-10 items-center justify-center rounded border border-dashed bg-background-100 p-0.5 dark:bg-background-200",
			className
		)}
		ref={ref}
	>
		{children}
	</div>
));

Circle.displayName = "Circle";

const TypingDots = () => (
	<span className="inline-flex space-x-0.5">
		<span className="dot-bounce-1">.</span>
		<span className="dot-bounce-2">.</span>
		<span className="dot-bounce-3">.</span>
	</span>
);

export function CustomToolsGraphic() {
	const containerRef = useRef<HTMLDivElement>(null);
	const div1Ref = useRef<HTMLDivElement>(null);
	const div2Ref = useRef<HTMLDivElement>(null);
	const div3Ref = useRef<HTMLDivElement>(null);
	const div4Ref = useRef<HTMLDivElement>(null);
	const div5Ref = useRef<HTMLDivElement>(null);
	const div6Ref = useRef<HTMLDivElement>(null);
	const div7Ref = useRef<HTMLDivElement>(null);
	const [showTyping, setShowTyping] = useState(false);

	useEffect(() => {
		const showTypingIndicator = () => {
			setShowTyping(true);
			// Hide after 3-5 seconds
			const hideDuration = 3000 + Math.random() * 2000;
			setTimeout(() => {
				setShowTyping(false);
				// Schedule next appearance
				scheduleNextTyping();
			}, hideDuration);
		};

		const scheduleNextTyping = () => {
			// Show again after 5-15 seconds
			const nextShowDelay = 5000 + Math.random() * 10_000;
			setTimeout(showTypingIndicator, nextShowDelay);
		};

		// Initial delay before first appearance
		const initialDelay = 2000 + Math.random() * 3000;
		const timer = setTimeout(showTypingIndicator, initialDelay);

		return () => clearTimeout(timer);
	}, []);

	return (
		<div
			className="relative flex h-[300px] w-full items-start justify-center"
			ref={containerRef}
		>
			<div className="flex size-full max-h-[200px] flex-col items-stretch justify-between gap-10">
				<div className="flex flex-row items-center justify-between">
					<Circle ref={div1Ref}>
						<p className="font-mono text-[8px]">LINEAR</p>
					</Circle>
					<Circle ref={div5Ref}>
						<p className="font-mono text-[8px]">API</p>
					</Circle>
				</div>
				<div className="flex flex-row items-center justify-between">
					<Circle ref={div2Ref}>
						<p className="font-mono text-[8px]">CAL</p>
					</Circle>
					<Circle className="ml-6 size-16 md:ml-8" ref={div4Ref}>
						<Logo className="size-8 text-primary/90" />
					</Circle>
					<Circle className="mr-6 md:mr-8" ref={div6Ref}>
						<Facehash className="size-8 text-primary/90" name="Olrewz" />
						{showTyping && (
							<div className="-bottom-4 fade-in slide-in-from-bottom-1 absolute flex w-[60px] animate-in gap-1 border border-dashed bg-background-100 px-0.5 text-center text-xs duration-300 dark:bg-background-400">
								typing <TypingDots />
							</div>
						)}
					</Circle>
				</div>
				<div className="flex flex-row items-center justify-between">
					<Circle ref={div3Ref}>
						<p className="font-mono text-[8px]">STRIPE</p>
					</Circle>
					<Circle ref={div7Ref}>
						<p className="text-center font-mono text-[8px]">WEB HOOK</p>
					</Circle>
				</div>
			</div>

			<AnimatedBeam
				containerRef={containerRef}
				curvature={-75}
				duration={4.4}
				endYOffset={-10}
				fromRef={div1Ref}
				reverse
				toRef={div4Ref}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				duration={5.2}
				fromRef={div2Ref}
				reverse
				toRef={div4Ref}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				curvature={75}
				duration={4.8}
				endYOffset={10}
				fromRef={div3Ref}
				reverse
				toRef={div4Ref}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				curvature={-75}
				duration={5.6}
				endYOffset={-10}
				fromRef={div5Ref}
				toRef={div4Ref}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				duration={4.6}
				fromRef={div6Ref}
				reverse
				toRef={div4Ref}
			/>
			<AnimatedBeam
				containerRef={containerRef}
				curvature={75}
				duration={5.4}
				endYOffset={10}
				fromRef={div7Ref}
				toRef={div4Ref}
			/>
		</div>
	);
}
