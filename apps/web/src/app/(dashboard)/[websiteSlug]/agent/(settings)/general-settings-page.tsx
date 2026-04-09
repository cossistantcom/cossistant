"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
} from "@/components/ui/layout/settings-layout";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { AIAgentForm } from "../ai-agent-form";
import { DeleteAgentDialog } from "../delete-agent-dialog";
import { ToolInvocationBudgetForm } from "./behavior/tool-invocation-budget-form";

export default function GeneralSettingsPage() {
	const website = useWebsite();
	const trpc = useTRPC();
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);

	const { data: aiAgent } = useQuery(
		trpc.aiAgent.get.queryOptions({
			websiteSlug: website.slug,
		})
	);
	const { data: behaviorSettings, isError: isBehaviorSettingsError } = useQuery(
		{
			...trpc.aiAgent.getBehaviorSettings.queryOptions({
				websiteSlug: website.slug,
			}),
			enabled: Boolean(aiAgent?.onboardingCompletedAt),
		}
	);

	if (!aiAgent) {
		return null;
	}

	return (
		<SettingsPage>
			<SettingsHeader>General Settings</SettingsHeader>
			<PageContent className="py-30">
				<SettingsRow
					description="Configure your AI assistant that automatically responds to visitor messages. When enabled, the agent will help visitors with common questions."
					title="AI Agent Configuration"
				>
					<AIAgentForm
						initialData={aiAgent}
						organizationId={website.organizationId}
						websiteId={website.id}
						websiteName={website.name}
						websiteSlug={website.slug}
					/>
				</SettingsRow>

				{isBehaviorSettingsError || !behaviorSettings ? (
					<SettingsRow
						description="Control how many non-finish tool invocations the AI can use per run."
						title="Tool Invocation Budget"
					>
						<div className="p-4">
							<p className="text-destructive text-sm">
								Failed to load behavior settings.
							</p>
						</div>
					</SettingsRow>
				) : (
					<SettingsRow
						description="Control how many non-finish tool invocations the AI can use per run."
						title="Tool Invocation Budget"
					>
						<ToolInvocationBudgetForm
							aiAgentId={aiAgent.id}
							initialData={behaviorSettings}
							websiteSlug={website.slug}
						/>
					</SettingsRow>
				)}

				<SettingsRow
					description="Permanently delete this AI agent and all associated data. This action cannot be undone."
					title="Danger Zone"
					variant="danger"
				>
					<div className="flex items-center justify-between p-4">
						<div className="space-y-1">
							<p className="font-medium text-sm">Delete AI Agent</p>
							<p className="text-muted-foreground text-xs">
								All knowledge base entries, web sources, and settings will be
								permanently deleted.
							</p>
						</div>
						<Button
							onClick={() => setShowDeleteDialog(true)}
							type="button"
							variant="destructive"
						>
							Delete Agent
						</Button>
					</div>
				</SettingsRow>
			</PageContent>

			<DeleteAgentDialog
				agentId={aiAgent.id}
				agentName={aiAgent.name}
				onOpenChange={setShowDeleteDialog}
				open={showDeleteDialog}
				websiteSlug={website.slug}
			/>
		</SettingsPage>
	);
}
