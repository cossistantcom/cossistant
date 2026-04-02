"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Tabs({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			className={cn("flex flex-col gap-2", className)}
			data-slot="tabs"
			{...props}
		/>
	);
}

function TabsList({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			className={cn(
				"inline-flex h-9 w-fit items-center justify-center p-[3px] text-muted-foreground",
				className
			)}
			data-slot="tabs-list"
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	children,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			className={cn(
				"group inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-0.5 py-1 font-medium text-primary/50 text-sm transition-[color,box-shadow] [&_svg:not([class*= focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-primary dark:text-muted-foreground dark:data-[state=active]:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className
			)}
			data-slot="tabs-trigger"
			{...props}
		>
			<span className="text-foreground/30 opacity-0 transition-all duration-100 group-data-[state=active]:text-plasma-orange group-data-[state=active]:opacity-100">
				[
			</span>
			{children}
			<span className="text-foreground/30 opacity-0 transition-all duration-100 group-data-[state=active]:text-plasma-orange group-data-[state=active]:opacity-100">
				]
			</span>
		</TabsPrimitive.Trigger>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			className={cn("flex-1 outline-none", className)}
			data-slot="tabs-content"
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
