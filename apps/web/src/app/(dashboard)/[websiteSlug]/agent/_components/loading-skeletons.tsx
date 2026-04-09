import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { Skeleton } from "@/components/ui/skeleton";

function HeaderActionSkeleton() {
	return <Skeleton className="h-9 w-28 rounded-md" />;
}

function TrainingRowsSkeleton({ count = 4 }: { count?: number }) {
	return (
		<div className="space-y-1">
			{Array.from({ length: count }).map((_, index) => (
				<div
					className="flex items-center gap-3 rounded px-2 py-2"
					key={`training-loading-row-${index}`}
				>
					<Skeleton className="size-8 rounded-[8px]" />
					<div className="flex min-w-0 flex-1 items-center gap-4">
						<Skeleton className="h-4 w-52 shrink-0" />
						<Skeleton className="hidden h-4 flex-1 md:block" />
					</div>
					<Skeleton className="h-4 w-24 shrink-0" />
				</div>
			))}
		</div>
	);
}

export function GeneralSettingsLoading() {
	return (
		<SettingsPage>
			<SettingsHeader>General Settings</SettingsHeader>
			<PageContent className="py-30">
				<SettingsRow
					description="Configure your AI assistant that automatically responds to visitor messages. When enabled, the agent will help visitors with common questions."
					title="AI Agent Configuration"
				>
					<div className="space-y-6 px-4 py-6">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-32 w-full" />
						<div className="grid grid-cols-2 gap-4">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					</div>
				</SettingsRow>

				<SettingsRow
					description="Control how many non-finish tool invocations the AI can use per run."
					title="Tool Invocation Budget"
				>
					<div className="space-y-3 p-4">
						<Skeleton className="h-10 w-40" />
						<Skeleton className="h-10 w-full" />
					</div>
				</SettingsRow>

				<SettingsRow
					description="Permanently delete this AI agent and all associated data. This action cannot be undone."
					title="Danger Zone"
					variant="danger"
				>
					<div className="flex items-center justify-between gap-4 p-4">
						<div className="space-y-2">
							<Skeleton className="h-5 w-36" />
							<Skeleton className="h-4 w-80 max-w-full" />
						</div>
						<Skeleton className="h-10 w-28 rounded-md" />
					</div>
				</SettingsRow>
			</PageContent>
		</SettingsPage>
	);
}

export function BehaviorSettingsLoading() {
	return (
		<SettingsPage>
			<SettingsHeader>Behaviour</SettingsHeader>
			<PageContent className="py-30">
				<div className="space-y-8">
					{Array.from({ length: 3 }).map((_, index) => (
						<SettingsRow
							description="Loading behaviour prompt..."
							key={`behavior-loading-${index}`}
							title="Behaviour"
						>
							<div className="space-y-4 p-4">
								<Skeleton className="h-6 w-48" />
								<Skeleton className="h-32 w-full" />
								<div className="flex justify-between gap-3">
									<Skeleton className="h-8 w-36" />
									<div className="flex gap-2">
										<Skeleton className="h-9 w-20 rounded-md" />
										<Skeleton className="h-9 w-20 rounded-md" />
									</div>
								</div>
							</div>
						</SettingsRow>
					))}
				</div>
			</PageContent>
		</SettingsPage>
	);
}

export function ToolsSettingsLoading() {
	return (
		<SettingsPage>
			<SettingsHeader>Tools & Skills</SettingsHeader>
			<PageContent className="py-30">
				<div className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-8">
					<div className="grid gap-4 lg:grid-cols-2">
						{Array.from({ length: 6 }).map((_, index) => (
							<div
								className="space-y-4 rounded-lg border border-border/60 p-4"
								key={`tools-loading-card-${index}`}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="space-y-2">
										<Skeleton className="h-5 w-32" />
										<Skeleton className="h-4 w-full max-w-80" />
									</div>
									<Skeleton className="h-6 w-10 rounded-full" />
								</div>
								<Skeleton className="h-4 w-2/3" />
								<div className="flex justify-end gap-2">
									<Skeleton className="h-8 w-16 rounded-md" />
									<Skeleton className="h-8 w-16 rounded-md" />
								</div>
							</div>
						))}
					</div>
				</div>
			</PageContent>
		</SettingsPage>
	);
}

export function WebSourcesLoading() {
	return (
		<SettingsPage>
			<SettingsHeader>
				Web Sources
				<div className="flex items-center gap-2 pr-1">
					<HeaderActionSkeleton />
				</div>
			</SettingsHeader>
			<PageContent className="py-6 pt-20">
				<div className="space-y-6">
					<div className="grid gap-4 md:grid-cols-3">
						{Array.from({ length: 3 }).map((_, index) => (
							<div
								className="space-y-3 rounded-lg border p-4"
								key={`web-stats-loading-${index}`}
							>
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-8 w-16" />
								<Skeleton className="h-3 w-full" />
							</div>
						))}
					</div>
					<div className="space-y-3">
						<Skeleton className="h-4 w-40" />
						<TrainingRowsSkeleton />
					</div>
				</div>
			</PageContent>
		</SettingsPage>
	);
}

export function FaqLoading() {
	return (
		<SettingsPage>
			<SettingsHeader>
				FAQ
				<div className="flex items-center gap-2 pr-1">
					<HeaderActionSkeleton />
				</div>
			</SettingsHeader>
			<PageContent className="py-6 pt-20">
				<div className="space-y-6">
					<div className="flex items-center justify-between">
						<Skeleton className="h-4 w-28" />
						<Skeleton className="h-4 w-44" />
					</div>
					<div className="space-y-3">
						<Skeleton className="h-5 w-32" />
						<Skeleton className="h-4 w-64" />
						<div className="space-y-2 rounded-lg border p-4">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-32" />
						</div>
						<div className="space-y-2">
							<Skeleton className="h-5 w-24" />
							<Skeleton className="h-4 w-72" />
						</div>
						<TrainingRowsSkeleton />
					</div>
				</div>
			</PageContent>
		</SettingsPage>
	);
}

export function FilesLoading() {
	return (
		<SettingsPage>
			<SettingsHeader>
				Files
				<div className="flex items-center gap-2 pr-1">
					<HeaderActionSkeleton />
				</div>
			</SettingsHeader>
			<PageContent className="py-6 pt-20">
				<div className="space-y-6">
					<div className="flex items-center justify-between">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-4 w-44" />
					</div>
					<div className="space-y-2">
						<Skeleton className="h-5 w-24" />
						<Skeleton className="h-4 w-72" />
					</div>
					<TrainingRowsSkeleton />
				</div>
			</PageContent>
		</SettingsPage>
	);
}
