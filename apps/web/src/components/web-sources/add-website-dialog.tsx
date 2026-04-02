"use client";

import {
	ChevronDownIcon,
	ChevronRightIcon,
	FilterIcon,
	PlusIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { UpgradeModal } from "../plan/upgrade-modal";

type AddWebsiteDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (params: {
		url: string;
		includePaths?: string[];
		excludePaths?: string[];
	}) => Promise<void>;
	isSubmitting: boolean;
	isAtLinkLimit: boolean;
	linkLimit?: number | null;
	websiteSlug: string;
	/** Crawl pages limit per source (null = unlimited) */
	crawlPagesLimit?: number | null;
	/** Whether the user is on the free plan */
	isFreePlan?: boolean;
	onUpgradeClick: () => void;
};

export function AddWebsiteDialog({
	open,
	onOpenChange,
	onSubmit,
	isSubmitting,
	isAtLinkLimit,
	linkLimit,
	websiteSlug,
	crawlPagesLimit,
	isFreePlan,
	onUpgradeClick,
}: AddWebsiteDialogProps) {
	const [url, setUrl] = useState("");
	const [isValidUrl, setIsValidUrl] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [includePaths, setIncludePaths] = useState("");
	const [excludePaths, setExcludePaths] = useState("");

	// Validate URL
	useEffect(() => {
		try {
			if (url.trim()) {
				new URL(url);
				setIsValidUrl(true);
			} else {
				setIsValidUrl(false);
			}
		} catch {
			setIsValidUrl(false);
		}
	}, [url]);

	// Reset form when dialog closes
	useEffect(() => {
		if (!open) {
			setUrl("");
			setIncludePaths("");
			setExcludePaths("");
			setShowAdvanced(false);
		}
	}, [open]);

	const handleSubmit = useCallback(async () => {
		if (!isValidUrl) {
			return;
		}

		const includePathsArray = includePaths
			.split("\n")
			.map((p) => p.trim())
			.filter(Boolean);
		const excludePathsArray = excludePaths
			.split("\n")
			.map((p) => p.trim())
			.filter(Boolean);

		await onSubmit({
			url: url.trim(),
			includePaths:
				includePathsArray.length > 0 ? includePathsArray : undefined,
			excludePaths:
				excludePathsArray.length > 0 ? excludePathsArray : undefined,
		});
	}, [isValidUrl, url, includePaths, excludePaths, onSubmit]);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-125">
				<DialogHeader>
					<DialogTitle>Add Website</DialogTitle>
					<DialogDescription>
						Enter a URL to crawl. We'll automatically discover and extract
						content from all accessible pages.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="url">Website URL</Label>
						<Input
							disabled={isSubmitting}
							id="url"
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://docs.example.com"
							type="url"
							value={url}
						/>
					</div>

					<Collapsible onOpenChange={setShowAdvanced} open={showAdvanced}>
						<CollapsibleTrigger asChild>
							<Button
								className="w-full justify-start"
								size="sm"
								variant="ghost"
							>
								<FilterIcon className="mr-2 h-4 w-4" />
								{showAdvanced ? "Hide" : "Show"} Advanced Options
								{showAdvanced ? (
									<ChevronDownIcon className="ml-auto h-4 w-4" />
								) : (
									<ChevronRightIcon className="ml-auto h-4 w-4" />
								)}
							</Button>
						</CollapsibleTrigger>
						<CollapsibleContent className="space-y-4 pt-4">
							<div className="space-y-2">
								<Label htmlFor="includePaths">
									Include Paths (one per line)
								</Label>
								<Textarea
									disabled={isSubmitting}
									id="includePaths"
									onChange={(e) => setIncludePaths(e.target.value)}
									placeholder={"/docs\n/blog\n/guides/*"}
									rows={3}
									value={includePaths}
								/>
								<p className="text-muted-foreground text-xs">
									Only URLs matching these paths will be crawled. Use * for
									wildcards.
								</p>
							</div>

							<div className="space-y-2">
								<Label htmlFor="excludePaths">
									Exclude Paths (one per line)
								</Label>
								<Textarea
									disabled={isSubmitting}
									id="excludePaths"
									onChange={(e) => setExcludePaths(e.target.value)}
									placeholder={"/admin\n/api\n/private/*"}
									rows={3}
									value={excludePaths}
								/>
								<p className="text-muted-foreground text-xs">
									URLs matching these paths will be skipped. Use * for
									wildcards.
								</p>
							</div>
						</CollapsibleContent>
					</Collapsible>

					{/* Crawl pages limit info */}
					{crawlPagesLimit !== undefined && (
						<div className="flex w-full items-center justify-between text-sm">
							<p
								className={cn(
									"text-muted-foreground",
									isFreePlan && "text-plasma-orange"
								)}
							>
								Up to{" "}
								<span className="font-medium">
									{crawlPagesLimit === null
										? "1000+"
										: crawlPagesLimit.toLocaleString()}
								</span>{" "}
								pages will be crawled
							</p>
							{isFreePlan && (
								<button
									className="font-medium text-plasma-orange hover:cursor-pointer hover:underline"
									onClick={onUpgradeClick}
									type="button"
								>
									Upgrade for 1,000+ pages
								</button>
							)}
						</div>
					)}

					{isAtLinkLimit && (
						<p className="text-destructive text-sm">
							You've reached your plan's limit of {linkLimit} link sources.{" "}
							<a
								className="underline hover:text-destructive/80"
								href={`/${websiteSlug}/settings/plan`}
							>
								Upgrade your plan
							</a>{" "}
							to add more.
						</p>
					)}
				</div>

				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button
						disabled={!isValidUrl || isSubmitting || isAtLinkLimit}
						onClick={handleSubmit}
					>
						{isSubmitting ? (
							<>
								<Spinner className="mr-2 h-4 w-4" />
								Adding...
							</>
						) : (
							<>
								<PlusIcon className="mr-2 h-4 w-4" />
								Add & Crawl
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export type { AddWebsiteDialogProps };
