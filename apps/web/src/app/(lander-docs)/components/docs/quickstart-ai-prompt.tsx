"use client";

import { WebsiteInstallationTarget } from "@plasma/types";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { copyToClipboardWithMeta } from "@/components/copy-button";
import { DashboardCodeBlock } from "@/components/dashboard-code-block";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	buildSupportAiSetupPrompt,
	getSupportInstallCommand,
	type SupportIntegrationFramework,
} from "@/lib/support-integration-guide";

type QuickstartAIPromptProps = {
	framework: SupportIntegrationFramework;
	publicKey?: string;
};

function mapFrameworkToTarget(framework: SupportIntegrationFramework) {
	return framework === "react"
		? WebsiteInstallationTarget.REACT
		: WebsiteInstallationTarget.NEXTJS;
}

export function QuickstartAIPrompt({
	framework,
	publicKey,
}: QuickstartAIPromptProps) {
	const [publicKeyInput, setPublicKeyInput] = useState(publicKey ?? "");
	const installationTarget = mapFrameworkToTarget(framework);
	const inputId = `quickstart-public-key-${framework}`;

	const aiPrompt = useMemo(
		() =>
			buildSupportAiSetupPrompt({
				installationTarget,
				installCommand: getSupportInstallCommand({
					installationTarget,
					packageManager: "npm",
				}),
				publicApiKey: publicKeyInput.trim() || null,
				websiteDomain: "your-domain.com",
				websiteName: "Your Website",
			}),
		[installationTarget, publicKeyInput]
	);

	const handleCopyPrompt = async () => {
		try {
			await copyToClipboardWithMeta(aiPrompt);
			toast.success("Setup prompt copied. Paste it into your AI assistant.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to copy setup prompt."
			);
		}
	};

	return (
		<div className="mt-8 space-y-4">
			<p className="m-0 text-muted-foreground text-sm leading-relaxed">
				Paste your public key to prefill the prompt, then copy it and run it in
				ChatGPT, Claude, or Cursor.
			</p>
			<div className="grid gap-2">
				<label className="font-medium text-sm" htmlFor={inputId}>
					Public API key (optional)
				</label>
				<Input
					id={inputId}
					onChange={(event) => setPublicKeyInput(event.target.value)}
					placeholder="pk_test_xxxx"
					value={publicKeyInput}
				/>
			</div>
			<Button onClick={handleCopyPrompt} type="button">
				Copy AI prompt
			</Button>
			<DashboardCodeBlock
				code={aiPrompt}
				fileName={"plasma-prompt.md"}
				language="md"
			/>
		</div>
	);
}
