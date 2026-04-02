"use client";

import { ArrowRightIcon, TerminalIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfig } from "@/hooks/use-config";
import { cn } from "@/lib/utils";

type SignUpCTAProps = {
	title?: string;
	description?: string;
	className?: string;
};

export function SignUpCTA({
	title = "Ready to take control of your support?",
	description = "Get started with Cossistant in minutes. Install the package and add the widget to your app.",
	className,
}: SignUpCTAProps) {
	const [config, setConfig] = useConfig();

	const packageManager = config.packageManager || "pnpm";
	const tabs = React.useMemo(
		() => ({
			pnpm: "pnpm add @plasma/react",
			npm: "npm install @plasma/react",
			yarn: "yarn add @plasma/react",
			bun: "bun add @plasma/react",
		}),
		[]
	);

	return (
		<div
			className={cn(
				"not-prose my-30 overflow-hidden rounded border",
				className
			)}
		>
			<div className="px-4 py-6">
				<h3 className="font-heading font-semibold text-lg">{title}</h3>
				<p className="mt-1 text-muted-foreground text-sm">{description}</p>
			</div>

			<div className="border-y bg-background-50 dark:bg-background-100">
				<div className="relative overflow-x-auto">
					<Tabs
						className="gap-0"
						onValueChange={(value) => {
							setConfig({
								...config,
								packageManager: value as "pnpm" | "npm" | "yarn" | "bun",
							});
						}}
						value={packageManager}
					>
						<div className="flex items-center gap-2 px-4 py-2">
							<div className="flex size-4 items-center justify-center rounded-[1px] bg-primary">
								<TerminalIcon className="size-3 text-primary-foreground" />
							</div>
							<TabsList className="rounded-none bg-transparent p-0">
								{Object.entries(tabs).map(([key]) => (
									<TabsTrigger
										className="h-7 rounded border border-transparent pt-0.5 data-[state=active]:border-input data-[state=active]:bg-background data-[state=active]:shadow-none"
										key={key}
										value={key}
									>
										{key}
									</TabsTrigger>
								))}
							</TabsList>
						</div>
						<div className="no-scrollbar overflow-x-auto">
							{Object.entries(tabs).map(([key, value]) => (
								<TabsContent className="mt-0 px-4 py-3" key={key} value={key}>
									<pre>
										<code
											className="relative font-mono text-primary text-sm leading-none"
											data-language="bash"
										>
											{value}
										</code>
									</pre>
								</TabsContent>
							))}
						</div>
					</Tabs>
					<CopyButton
						className="absolute top-2 right-2 z-10 size-7 opacity-70 hover:opacity-100 focus-visible:opacity-100"
						value={tabs[packageManager] || ""}
					/>
				</div>
			</div>

			<div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-muted-foreground text-sm">
					Or sign up to get your API key and start building.
				</p>
				<Button asChild size="sm">
					<Link href="/sign-up">
						Get started free
						<ArrowRightIcon className="size-4" />
					</Link>
				</Button>
			</div>
		</div>
	);
}
