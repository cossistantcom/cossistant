"use client";

import { motion } from "motion/react";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function ComponentPreviewTabs({
	className,
	align = "center",
	component,
	source,
	withOrnament: _withOrnament,
	sizeClasses = "min-h-[350px] md:min-h-[450px]",
}: React.ComponentProps<"div"> & {
	align?: "center" | "start" | "end";
	component: React.ReactNode;
	source: React.ReactNode;
	withOrnament?: boolean;
	sizeClasses?: string;
}) {
	const [tab, setTab] = React.useState("preview");
	const previewAlignment = {
		center: "justify-center",
		start: "justify-start",
		end: "justify-end",
	}[align];

	return (
		<div
			className={cn("group relative flex h-full w-full flex-col", className)}
		>
			<Tabs
				className="relative w-full gap-2"
				onValueChange={setTab}
				value={tab}
			>
				<div
					className="flex items-center px-6"
					data-slot="component-preview-tabs"
				>
					<TabsList className="justify-start gap-4 bg-transparent p-0">
						<TabsTrigger
							className="h-8 flex-none px-0 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
							value="preview"
						>
							Preview
						</TabsTrigger>
						<TabsTrigger
							className="h-8 flex-none px-0 text-muted-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none"
							value="code"
						>
							Code
						</TabsTrigger>
					</TabsList>
				</div>
				<div
					className="relative overflow-hidden border-dashed bg-transparent"
					data-slot="component-preview-frame"
				>
					{tab === "preview" && (
						<div
							className={cn(
								"flex h-full w-full min-w-0 items-center overflow-hidden px-4 py-6",
								previewAlignment,
								sizeClasses
							)}
						>
							{component}
						</div>
					)}
					{tab === "code" && (
						<div
							className={cn(
								"scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-background-100 h-full w-full overflow-auto px-5 py-4 dark:bg-background-100",
								sizeClasses
							)}
						>
							{source}
						</div>
					)}
				</div>
			</Tabs>
		</div>
	);
}
