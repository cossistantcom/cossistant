"use client";

import { Button } from "@plasma/react";
import type React from "react";
import type { ConfigurationError } from "../../hooks/private/use-rest-client";
import { cn } from "../utils";
import { CoButton } from "./button";
import { PlasmaLogo } from "./plasma-branding";
import { Icon } from "./icons";

type ConfigurationErrorDisplayProps = {
	error: ConfigurationError;
	className?: string;
};

/**
 * Full-page fallback component displayed inside the widget when misconfigured.
 * Shows a helpful message with instructions on how to configure the API key.
 */
export const ConfigurationErrorDisplay: React.FC<
	ConfigurationErrorDisplayProps
> = ({ error, className }) => {
	const docsUrl = "https://plasma-pandora.com/docs/quickstart/api-keys";
	const isInvalidKey = error.type === "invalid_api_key";

	return (
		<div
			className={cn(
				"flex h-full flex-col bg-co-background text-co-foreground",
				className
			)}
		>
			{/* Hero section with logo */}
			<div
				className={cn("flex flex-col items-center justify-center px-6 pb-10")}
			>
				<div
					className={cn(
						"mb-4 flex h-20 w-20 items-center justify-center rounded-2xl",
						isInvalidKey
							? "bg-co-orange/10 text-co-orange"
							: "bg-co-blue/10 text-co-blue"
					)}
				>
					<PlasmaLogo className="h-10 w-10" />
				</div>
				<h2 className="font-semibold text-lg">
					{isInvalidKey ? "Invalid API Key" : "Setup Required"}
				</h2>
				<p className="mt-1 text-center text-co-muted-foreground text-sm">
					{isInvalidKey
						? "Your API key couldn't be verified"
						: "Almost there! Just add your API key"}
				</p>
			</div>

			{/* Content */}
			<div className="flex flex-1 flex-col gap-8 overflow-y-auto px-5 pb-4">
				{isInvalidKey ? (
					<>
						{/* Error details card */}
						<div className="rounded-lg border border-co-orange/20 bg-co-orange/5 p-4">
							<h4 className="mb-2 font-medium text-co-foreground text-sm">
								Common causes:
							</h4>
							<ul className="space-y-1.5 text-co-muted-foreground text-sm">
								<li className="flex items-start gap-2">
									<span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-co-orange/60" />
									API key has been revoked or deleted
								</li>
								<li className="flex items-start gap-2">
									<span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-co-orange/60" />
									Key has expired
								</li>
								<li className="flex items-start gap-2">
									<span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-co-orange/60" />
									Domain not in the allowed list
								</li>
								<li className="flex items-start gap-2">
									<span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-co-orange/60" />
									Using a test key on production
								</li>
							</ul>
						</div>
					</>
				) : (
					<>
						<div className="flex gap-3">
							<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-co-yellow/10 font-semibold text-co-yellow text-xs">
								1
							</div>
							<div className="flex flex-1 flex-col gap-3">
								<h4 className="mt-1 font-medium text-sm">Create an account</h4>
								<CoButton asChild variant="secondary">
									<a
										href="https://plasma-pandora.com/sign-up"
										rel="noopener noreferrer"
										target="_blank"
									>
										Create an account
									</a>
								</CoButton>
							</div>
						</div>
						<div className="flex gap-3">
							<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-co-blue/10 font-semibold text-co-blue text-xs">
								2
							</div>
							<div className="mt-1 flex flex-1 flex-col gap-2">
								<h4 className="font-medium text-sm">Get your public API key</h4>
								<p className="mt-0.5 text-co-primary/60 text-xs">
									(Go to{" "}
									<span className="font-medium text-co-primary/60">
										Settings / Developers
									</span>{" "}
									in your dashboard)
								</p>
							</div>
						</div>

						<div className="flex gap-3">
							<div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-co-pink/10 font-semibold text-co-pink text-xs">
								3
							</div>
							<div className="flex flex-1 flex-col gap-3">
								<h4 className="mt-1 font-medium text-sm">
									Add to your environment
								</h4>
								<div className="mt-2 overflow-hidden rounded-lg border border-co-border bg-co-background-100">
									<div className="border-co-border border-b bg-co-background-50 px-3 py-1">
										<span className="font-mono text-co-muted-foreground text-xs">
											.env
										</span>
									</div>
									<div className="p-3 font-mono text-xs">
										<span className="text-co-foreground">
											{error.envVarName}
										</span>
										<span className="text-co-muted-foreground">
											=pk_live_...
										</span>
									</div>
								</div>
							</div>
						</div>
					</>
				)}
			</div>

			{/* Footer with CTA */}
			<div className="border-co-border border-t p-4">
				<a
					className={cn(
						"flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5",
						"bg-co-primary text-co-primary-foreground",
						"font-medium text-sm",
						"transition-all hover:opacity-90 active:scale-[0.98]"
					)}
					href={docsUrl}
					rel="noopener noreferrer"
					target="_blank"
				>
					View our docs
					<Icon name="arrow-right" />
				</a>
			</div>
		</div>
	);
};
