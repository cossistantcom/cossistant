"use client";

import {
	type AiAgentResponse,
	DEFAULT_AGENT_BASE_PROMPT,
} from "@plasma/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Step, Steps } from "@/components/ui/steps";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";
import { StepBasics } from "./step-basics";
import { StepBasicsSummary } from "./step-basics-summary";
import { StepPersonality } from "./step-personality";

type OnboardingStep = "basics" | "personality";
type AnalysisStep = "crawling" | "analyzing" | "crafting" | "complete";

type AgentOnboardingFlowProps = {
	existingAgent?: AiAgentResponse | null;
};

export function AgentOnboardingFlow({
	existingAgent,
}: AgentOnboardingFlowProps) {
	const website = useWebsite();
	const router = useRouter();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	// Fetch plan info for model restrictions and crawl limits
	const { data: planInfo } = useQuery(
		trpc.plan.getPlanInfo.queryOptions({ websiteSlug: website.slug })
	);

	// Fetch training stats to get crawl limit
	const { data: trainingStats } = useQuery(
		trpc.linkSource.getTrainingStats.queryOptions({
			websiteSlug: website.slug,
		})
	);

	const isFreePlan = planInfo?.plan.name === "free";
	const crawlPagesLimit = trainingStats?.crawlPagesPerSourceLimit ?? null;

	// If we have an existing agent (onboarding in progress), start at step 2
	const [currentStep, setCurrentStep] = useState<OnboardingStep>(
		existingAgent ? "personality" : "basics"
	);

	// Use existing agent ID if resuming onboarding
	const [agentId, setAgentId] = useState<string | null>(
		existingAgent?.id ?? null
	);

	// Form state - pre-fill from existing agent if resuming
	const [name, setName] = useState(existingAgent?.name ?? `${website.name} AI`);
	const [sourceUrl, setSourceUrl] = useState(`https://${website.domain}`);
	const [selectedGoals, setSelectedGoals] = useState<string[]>(
		existingAgent?.goals ?? []
	);
	const [basePrompt, setBasePrompt] = useState(
		existingAgent?.basePrompt ?? DEFAULT_AGENT_BASE_PROMPT
	);

	// Crawl toggle - whether to crawl the website or skip
	const [crawlEnabled, setCrawlEnabled] = useState(true);

	// Description state - tracks if we need manual input
	const [manualDescription, setManualDescription] = useState("");
	// If resuming onboarding, assume URL was provided (we'll use the sourceUrl)
	const [urlWasProvided, setUrlWasProvided] = useState(!!existingAgent);
	// Track if prompt was generated
	// If resuming with existing agent that has a NON-default prompt, mark as generated
	// Otherwise we'll auto-trigger generation on resume
	const hasCustomPrompt =
		existingAgent?.basePrompt &&
		existingAgent.basePrompt !== DEFAULT_AGENT_BASE_PROMPT;
	const [promptWasGenerated, setPromptWasGenerated] = useState(
		!!hasCustomPrompt
	);

	// Analysis progress state
	// If resuming with custom prompt, start at complete; otherwise start at crawling
	const [analysisStep, setAnalysisStep] = useState<AnalysisStep>(
		hasCustomPrompt ? "complete" : "crawling"
	);

	// Track if we're about to regenerate on resume (before the mutation actually starts)
	// This is needed because useEffect runs after first render
	const needsRegeneration =
		existingAgent && !hasCustomPrompt && !promptWasGenerated;

	const [model, setModel] = useState<string>(existingAgent?.model ?? "");

	useEffect(() => {
		if (existingAgent) {
			return;
		}

		const nextDefaultModel = planInfo?.aiModels.defaultModelId;
		const knownModels = planInfo?.aiModels.items;
		if (!(nextDefaultModel && knownModels)) {
			return;
		}

		setModel((currentModel) => {
			const isKnownCurrent = knownModels.some(
				(modelItem) => modelItem.id === currentModel
			);
			return isKnownCurrent ? currentModel : nextDefaultModel;
		});
	}, [
		existingAgent,
		planInfo?.aiModels.defaultModelId,
		planInfo?.aiModels.items,
	]);

	// Create AI agent mutation with optimistic update
	const { mutateAsync: createAgent, isPending: isCreatingAgent } = useMutation(
		trpc.aiAgent.create.mutationOptions({
			onMutate: async (newAgent) => {
				// Cancel outgoing refetches
				await queryClient.cancelQueries({
					queryKey: trpc.aiAgent.get.queryKey({ websiteSlug: website.slug }),
				});

				// Snapshot previous value
				const previousAgent = queryClient.getQueryData<AiAgentResponse | null>(
					trpc.aiAgent.get.queryKey({ websiteSlug: website.slug })
				);

				// Optimistically set the new agent (with onboardingCompletedAt: null)
				const optimisticAgent: AiAgentResponse = {
					id: `optimistic-${Date.now()}`,
					name: newAgent.name,
					image: newAgent.image ?? null,
					description: newAgent.description ?? null,
					basePrompt: newAgent.basePrompt,
					model: newAgent.model,
					temperature: newAgent.temperature ?? null,
					maxOutputTokens: newAgent.maxOutputTokens ?? null,
					isActive: true,
					lastUsedAt: null,
					usageCount: 0,
					goals: newAgent.goals ?? null,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					onboardingCompletedAt: null, // NOT completed yet
				};

				queryClient.setQueryData(
					trpc.aiAgent.get.queryKey({ websiteSlug: website.slug }),
					optimisticAgent
				);

				return { previousAgent };
			},
			onError: (_error, _variables, context) => {
				// Rollback on error
				if (context?.previousAgent !== undefined) {
					queryClient.setQueryData(
						trpc.aiAgent.get.queryKey({ websiteSlug: website.slug }),
						context.previousAgent
					);
				}
				toast.error(_error.message || "Failed to create AI agent.");
			},
			onSettled: () => {
				// Always refetch after mutation settles
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.get.queryKey({ websiteSlug: website.slug }),
				});
			},
		})
	);

	// Update AI agent mutation with optimistic update
	const { mutateAsync: updateAgent, isPending: isUpdatingAgent } = useMutation(
		trpc.aiAgent.update.mutationOptions({
			onMutate: async (updatedData) => {
				await queryClient.cancelQueries({
					queryKey: trpc.aiAgent.get.queryKey({ websiteSlug: website.slug }),
				});

				const previousAgent = queryClient.getQueryData<AiAgentResponse | null>(
					trpc.aiAgent.get.queryKey({ websiteSlug: website.slug })
				);

				if (previousAgent) {
					const optimisticOnboardingCompletedAt =
						typeof updatedData.onboardingCompletedAt === "string" ||
						updatedData.onboardingCompletedAt === null
							? updatedData.onboardingCompletedAt
							: previousAgent.onboardingCompletedAt;

					// Optimistically update the agent
					const optimisticAgent: AiAgentResponse = {
						...previousAgent,
						name: updatedData.name,
						image: updatedData.image ?? previousAgent.image,
						description: updatedData.description ?? previousAgent.description,
						basePrompt: updatedData.basePrompt,
						model: updatedData.model,
						temperature: updatedData.temperature ?? previousAgent.temperature,
						maxOutputTokens:
							updatedData.maxOutputTokens ?? previousAgent.maxOutputTokens,
						goals: updatedData.goals ?? previousAgent.goals,
						onboardingCompletedAt: optimisticOnboardingCompletedAt,
						updatedAt: new Date().toISOString(),
					};

					queryClient.setQueryData(
						trpc.aiAgent.get.queryKey({ websiteSlug: website.slug }),
						optimisticAgent
					);
				}

				return { previousAgent };
			},
			onError: (_error, _variables, context) => {
				if (context?.previousAgent !== undefined) {
					queryClient.setQueryData(
						trpc.aiAgent.get.queryKey({ websiteSlug: website.slug }),
						context.previousAgent
					);
				}
				toast.error(_error.message || "Failed to update AI agent.");
			},
			onSettled: () => {
				void queryClient.invalidateQueries({
					queryKey: trpc.aiAgent.get.queryKey({ websiteSlug: website.slug }),
				});
			},
		})
	);

	// Create link source mutation for training
	const { mutateAsync: createLinkSource, isPending: isCreatingLink } =
		useMutation(
			trpc.linkSource.create.mutationOptions({
				onError: (error) => {
					toast.error(error.message || "Failed to start training.");
				},
			})
		);

	// Generate base prompt mutation
	const {
		mutateAsync: generateBasePrompt,
		isPending: isGeneratingPrompt,
		data: generatedPromptData,
		reset: resetGeneratedPrompt,
	} = useMutation(
		trpc.aiAgent.generateBasePrompt.mutationOptions({
			onError: (error) => {
				console.error("Failed to generate prompt:", error);
				// Don't show error toast - we'll fall back to default prompt
			},
		})
	);

	const isSubmitting = isCreatingAgent || isUpdatingAgent || isCreatingLink;
	// Show analyzing state when generating prompt OR when about to regenerate on resume
	const isAnalyzing = isGeneratingPrompt || needsRegeneration;

	// Validation
	const isStep1Valid = name.trim().length >= 1;
	const isUrlValid = (() => {
		try {
			if (sourceUrl.trim()) {
				new URL(sourceUrl);
				return true;
			}
			return false;
		} catch {
			return false;
		}
	})();

	// Check if we have a description (from scrape or manual input)
	const hasDescription =
		(generatedPromptData?.websiteDescription ?? "").length > 0 ||
		manualDescription.trim().length > 0;

	// Determine if we need manual description input
	// Show if:
	// - Crawl was disabled (need manual input immediately)
	// - OR crawl was enabled but no description was found
	// - But NOT if resuming (existingAgent is set)
	const hasRequiredDescription = crawlEnabled && hasDescription;
	const needsManualDescription =
		currentStep === "personality" &&
		!isAnalyzing &&
		!promptWasGenerated &&
		!hasRequiredDescription &&
		!existingAgent;

	// Should show the model selector and prompt editor?
	// Only show after prompt has been generated
	const shouldShowPromptEditor = promptWasGenerated;

	const handleContinue = async () => {
		if (!isStep1Valid) {
			return;
		}

		const modelCatalog = planInfo?.aiModels.items;
		const defaultModelId = planInfo?.aiModels.defaultModelId;
		const modelForCreate =
			modelCatalog?.some((modelItem) => modelItem.id === model) === true
				? model
				: (defaultModelId ?? null);

		if (!modelForCreate) {
			toast.error("AI models are still loading. Please try again in a moment.");
			return;
		}

		if (modelForCreate !== model) {
			setModel(modelForCreate);
		}

		const willCrawl = crawlEnabled && isUrlValid && sourceUrl.trim().length > 0;
		setUrlWasProvided(willCrawl);

		try {
			// Create the agent first with minimal data
			const agent = await createAgent({
				websiteSlug: website.slug,
				name: name.trim(),
				basePrompt: DEFAULT_AGENT_BASE_PROMPT,
				model: modelForCreate,
				goals: selectedGoals.length > 0 ? selectedGoals : undefined,
			});

			// Store the agent ID for later use
			setAgentId(agent.id);
			setCurrentStep("personality");

			// Only generate prompt if crawl is enabled and URL is provided and valid
			if (willCrawl) {
				try {
					const result = await generateBasePrompt({
						websiteSlug: website.slug,
						sourceUrl: sourceUrl.trim(),
						agentName: name.trim(),
						goals: selectedGoals,
					});

					if (result.basePrompt) {
						setBasePrompt(result.basePrompt);
						setPromptWasGenerated(true);
					}
				} catch {
					// Fall back to default prompt - already set
					setPromptWasGenerated(true);
				}
			}
		} catch {
			// Error already handled in mutation - don't transition to step 2
		}
	};

	// Generate prompt with manual description
	const handleGenerateWithDescription = async () => {
		if (!manualDescription.trim()) {
			return;
		}

		try {
			const result = await generateBasePrompt({
				websiteSlug: website.slug,
				sourceUrl: crawlEnabled && isUrlValid ? sourceUrl.trim() : undefined,
				agentName: name.trim(),
				goals: selectedGoals,
				manualDescription: manualDescription.trim(),
			});

			if (result.basePrompt) {
				setBasePrompt(result.basePrompt);
				setPromptWasGenerated(true);
			}
		} catch {
			// Fall back to default prompt
			setPromptWasGenerated(true);
		}
	};

	// Update base prompt when generated data comes in
	useEffect(() => {
		if (generatedPromptData?.basePrompt) {
			setBasePrompt(generatedPromptData.basePrompt);
		}
	}, [generatedPromptData]);

	// Progress through analysis steps with timers during analysis
	useEffect(() => {
		// Only run timers when actively analyzing
		if (!isAnalyzing) {
			return;
		}

		// Start fresh at crawling when analysis begins
		setAnalysisStep("crawling");

		// Progress through steps with delays to simulate the backend work
		// Step 1: Crawling (0-1.5s) - Fetching website content
		// Step 2: Analyzing (1.5-3.5s) - Extracting brand info & mapping pages
		// Step 3: Crafting (3.5s+) - AI generating the prompt
		const timer1 = setTimeout(() => setAnalysisStep("analyzing"), 1500);
		const timer2 = setTimeout(() => setAnalysisStep("crafting"), 3500);

		return () => {
			clearTimeout(timer1);
			clearTimeout(timer2);
		};
	}, [isAnalyzing]);

	// Mark analysis as complete when prompt generation finishes successfully
	// Check !isGeneratingPrompt directly instead of isAnalyzing to avoid circular dependency
	useEffect(() => {
		if (!isGeneratingPrompt && promptWasGenerated) {
			setAnalysisStep("complete");
		}
	}, [isGeneratingPrompt, promptWasGenerated]);

	// Auto-trigger prompt generation when resuming onboarding with default prompt
	// This handles the case where user refreshed during step 2 before prompt was generated
	// Uses Firecrawl caching (maxAge) to avoid re-paying for API calls
	useEffect(() => {
		// Only run once on mount when:
		// - We have an existing agent (resuming)
		// - Prompt was NOT already generated (still has default)
		// - We're on step 2 (personality)
		// - Not already analyzing
		if (
			existingAgent &&
			!hasCustomPrompt &&
			currentStep === "personality" &&
			!isGeneratingPrompt &&
			!promptWasGenerated
		) {
			const regeneratePrompt = async () => {
				try {
					const result = await generateBasePrompt({
						websiteSlug: website.slug,
						sourceUrl: sourceUrl.trim(),
						agentName: name.trim(),
						goals: selectedGoals,
					});

					if (result.basePrompt) {
						setBasePrompt(result.basePrompt);
						setPromptWasGenerated(true);
					}
				} catch {
					// Fall back to showing the prompt editor with default prompt
					setPromptWasGenerated(true);
				}
			};

			void regeneratePrompt();
		}
		// Only run on mount - don't re-run when dependencies change
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Handle editing step 1 - reset relevant state
	const handleEditStep1 = () => {
		setCurrentStep("basics");
		setPromptWasGenerated(false);
		setAnalysisStep("crawling");
		setManualDescription("");
		resetGeneratedPrompt();
	};

	const handleFinish = async () => {
		if (!agentId) {
			toast.error("Agent not found. Please try again.");
			return;
		}

		try {
			// Update the agent with final model, prompt, and mark onboarding complete
			await updateAgent({
				websiteSlug: website.slug,
				aiAgentId: agentId,
				name: name.trim(),
				basePrompt,
				model,
				goals: selectedGoals.length > 0 ? selectedGoals : undefined,
				onboardingCompletedAt: new Date().toISOString(), // Mark complete!
			});

			// If URL was provided and valid, create link source for knowledge base
			// The realtime handler will show a toast for the crawl progress
			if (urlWasProvided && isUrlValid) {
				try {
					await createLinkSource({
						websiteSlug: website.slug,
						aiAgentId: agentId,
						url: sourceUrl.trim(),
					});
					// Don't show toast here - realtime handler shows crawl progress toast
				} catch {
					// Agent was created but link source failed - still redirect
					toast.success(
						"AI Agent created! You can add knowledge sources later."
					);
				}
			} else {
				toast.success("AI Agent created successfully!");
			}

			// Redirect to agents page
			router.push(`/${website.slug}/agent`);
		} catch {
			// Error already handled in mutation
		}
	};

	return (
		<div className="mx-auto w-full max-w-2xl px-6 py-10">
			<div className="mb-8">
				<h1 className="font-semibold text-xl tracking-tight">
					Create your AI Agent
				</h1>
				<p className="mt-2 text-muted-foreground">
					Set up an AI assistant to help your visitors 24/7
				</p>
			</div>

			<Steps>
				{/* Step 1: Basic Info & Knowledge */}
				<Step completed={currentStep === "personality"}>
					<div className="font-semibold text-md">Basic Information</div>
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="mt-4 space-y-6"
						initial={{ opacity: 0, y: 10 }}
						transition={{ duration: 0.3 }}
					>
						{currentStep === "basics" ? (
							<StepBasics
								crawlEnabled={crawlEnabled}
								crawlPagesLimit={crawlPagesLimit}
								isFreePlan={isFreePlan}
								isStep1Valid={isStep1Valid}
								isSubmitting={isSubmitting}
								name={name}
								onContinue={handleContinue}
								planInfo={planInfo}
								selectedGoals={selectedGoals}
								setCrawlEnabled={setCrawlEnabled}
								setName={setName}
								setSelectedGoals={setSelectedGoals}
								setSourceUrl={setSourceUrl}
								sourceUrl={sourceUrl}
								websiteName={website.name}
								websiteSlug={website.slug}
							/>
						) : (
							<StepBasicsSummary
								companyName={generatedPromptData?.companyName ?? undefined}
								crawlEnabled={crawlEnabled}
								discoveredLinksCount={generatedPromptData?.discoveredLinksCount}
								isUrlValid={isUrlValid}
								manualDescription={manualDescription}
								name={name}
								onEdit={existingAgent ? undefined : handleEditStep1}
								promptGenerated={promptWasGenerated}
								selectedGoals={selectedGoals}
								sourceUrl={sourceUrl}
								urlWasProvided={urlWasProvided}
								websiteDescription={generatedPromptData?.websiteDescription}
							/>
						)}
					</motion.div>
				</Step>

				{/* Step 2: Agent Personality */}
				<Step enabled={currentStep === "personality"}>
					<div className="font-semibold text-md">Agent Personality</div>
					{currentStep === "personality" && (
						<StepPersonality
							analysisStep={analysisStep}
							basePrompt={basePrompt}
							crawlEnabled={crawlEnabled}
							crawlPagesLimit={crawlPagesLimit}
							generatedPromptData={generatedPromptData}
							isAnalyzing={isAnalyzing ?? false}
							isFreePlan={isFreePlan}
							isSubmitting={isSubmitting}
							manualDescription={manualDescription}
							model={model}
							needsManualDescription={needsManualDescription}
							onFinish={handleFinish}
							onGenerateWithDescription={handleGenerateWithDescription}
							planInfo={planInfo}
							promptWasGenerated={promptWasGenerated}
							setBasePrompt={setBasePrompt}
							setManualDescription={setManualDescription}
							setModel={setModel}
							shouldShowPromptEditor={shouldShowPromptEditor}
							urlWasProvided={urlWasProvided}
							websiteSlug={website.slug}
						/>
					)}
				</Step>
			</Steps>
		</div>
	);
}
