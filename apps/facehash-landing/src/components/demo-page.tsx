"use client";

import { Facehash } from "facehash";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlasmaLogo } from "./plasma-logo";
import { useShape } from "./shape-context";

const COLORS = [
	"hsla(314, 100%, 80%, 1)",
	"hsla(58, 93%, 72%, 1)",
	"hsla(218, 92%, 72%, 1)",
	"hsla(19, 99%, 44%, 1)",
	"hsla(156, 86%, 40%, 1)",
	"hsla(314, 100%, 85%, 1)",
	"hsla(58, 92%, 79%, 1)",
	"hsla(218, 91%, 78%, 1)",
	"hsla(19, 99%, 50%, 1)",
	"hsla(156, 86%, 64%, 1)",
];

const DEMO_NAMES = [
	"Elon Musk",
	"Taylor Swift",
	"Satoshi Nakamoto",
	"Ada Lovelace",
	"Claude",
	"Tony Stark",
	"Bilbo Baggins",
	"Marie Curie",
	"Hayao Miyazaki",
	"Linus Torvalds",
];

const TYPING_SPEED = 90;
const PAUSE_AFTER_COMPLETE = 2200;
const PAUSE_BEFORE_CLEAR = 400;

function Spinner({ size = 14 }: { size?: number }) {
	return (
		<svg
			aria-hidden="true"
			height={size}
			style={{ animation: "demo-page-spin 1s linear infinite" }}
			viewBox="0 0 24 24"
			width={size}
		>
			<circle
				cx="12"
				cy="12"
				fill="none"
				r="10"
				stroke="currentColor"
				strokeDasharray="32"
				strokeDashoffset="12"
				strokeLinecap="round"
				strokeWidth="3"
			/>
		</svg>
	);
}

export function DemoPage() {
	const { borderRadius } = useShape();
	const [currentText, setCurrentText] = useState("");
	const [completedNames, setCompletedNames] = useState<string[]>([]);
	const nameIndexRef = useRef(0);
	const charIndexRef = useRef(0);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

	const typeNextChar = useCallback(() => {
		const currentName = DEMO_NAMES[nameIndexRef.current % DEMO_NAMES.length];
		if (!currentName) {
			return;
		}

		if (charIndexRef.current < currentName.length) {
			charIndexRef.current++;
			setCurrentText(currentName.slice(0, charIndexRef.current));
			timeoutRef.current = setTimeout(
				typeNextChar,
				TYPING_SPEED + Math.random() * 40
			);
		} else {
			// Name complete — pause to showcase
			timeoutRef.current = setTimeout(() => {
				// Add to completed names (keep last 5)
				setCompletedNames((prev) => {
					const next = [...prev, currentName];
					return next.slice(-5);
				});
				// Brief pause before clearing
				timeoutRef.current = setTimeout(() => {
					setCurrentText("");
					charIndexRef.current = 0;
					nameIndexRef.current++;
					// Start typing next name
					timeoutRef.current = setTimeout(
						typeNextChar,
						TYPING_SPEED + Math.random() * 60
					);
				}, PAUSE_BEFORE_CLEAR);
			}, PAUSE_AFTER_COMPLETE);
		}
	}, []);

	useEffect(() => {
		timeoutRef.current = setTimeout(typeNextChar, 600);
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [typeNextChar]);

	const displayName = currentText || "facehash";

	return (
		<div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-8">
			{/* Main face — large, updating live */}
			<div className="mb-8 flex flex-col items-center gap-3">
				<Facehash
					className="text-black transition-all duration-150"
					colors={COLORS}
					enableBlink
					intensity3d="dramatic"
					name={displayName}
					size={120}
					style={{ borderRadius }}
				/>
				<span className="text-[var(--muted-foreground)] text-sm opacity-70">
					{`"${currentText}"`}
				</span>
			</div>

			{/* Fake input */}
			<div className="relative mx-auto w-full max-w-md">
				<div className="flex items-center border border-[var(--border)] bg-[var(--background)]/80 px-5 py-4 backdrop-blur-md">
					<span className="pointer-events-none select-none text-[var(--muted-foreground)] opacity-50">
						name=&quot;
					</span>
					<span className="relative min-w-[1ch] text-[var(--foreground)]">
						{currentText}
						<span className="-right-[2px] absolute top-0 inline-block h-full w-[2px] animate-demo-blink bg-[var(--foreground)]" />
					</span>
					<span className="pointer-events-none select-none text-[var(--muted-foreground)] opacity-50">
						&quot;
					</span>
				</div>
			</div>

			{/* Recently completed names — row of smaller faces */}
			<div className="mt-10 flex items-end gap-5">
				{completedNames.map((name) => (
					<div
						className="flex animate-demo-fade-in flex-col items-center gap-1.5"
						key={name}
					>
						<Facehash
							className="text-black"
							colors={COLORS}
							enableBlink
							intensity3d="dramatic"
							name={name}
							size={52}
							style={{ borderRadius }}
						/>
						<span className="text-[10px] text-[var(--muted-foreground)] opacity-60">
							{name.toLowerCase()}
						</span>
					</div>
				))}
				{/* Loading/thinking face */}
				<div className="flex flex-col items-center gap-1.5">
					<Facehash
						className="text-black"
						colors={COLORS}
						enableBlink
						intensity3d="dramatic"
						name="thinking"
						onRenderMouth={() => <Spinner size={10} />}
						size={52}
						style={{ borderRadius }}
					/>
					<span className="text-[10px] text-[var(--muted-foreground)] opacity-60">
						loading...
					</span>
				</div>
			</div>

			{/* Subtle install command */}
			<div className="mt-16 flex items-center gap-2">
				<code className="text-primary">
					<span className="opacity-50">$</span> npm i facehash
				</code>
				<div className="flex items-center gap-2 text-primary">
					<span>by</span>
					<PlasmaLogo className="h-3 w-auto" />
					<span>Plasma</span>
				</div>
			</div>

			<style>{`
				@keyframes demo-blink {
					0%, 100% { opacity: 1; }
					50% { opacity: 0; }
				}

				@keyframes demo-fade-in {
					from {
						opacity: 0;
						transform: translateY(8px) scale(0.9);
					}
					to {
						opacity: 1;
						transform: translateY(0) scale(1);
					}
				}

				@keyframes demo-page-spin {
					from { transform: rotate(0deg); }
					to { transform: rotate(360deg); }
				}

				.animate-demo-blink {
					animation: demo-blink 0.8s step-end infinite;
				}

				.animate-demo-fade-in {
					animation: demo-fade-in 0.4s ease-out;
				}
			`}</style>
		</div>
	);
}
