import type { RealtimeEvent } from "@plasma/types/realtime-events";
import { toast } from "sonner";
import { showProgressToast } from "@/components/ui/sonner";
import type { DashboardRealtimeContext } from "../types";

type TrainingStartedEvent = RealtimeEvent<"trainingStarted">;
type TrainingProgressEvent = RealtimeEvent<"trainingProgress">;
type TrainingCompletedEvent = RealtimeEvent<"trainingCompleted">;
type TrainingFailedEvent = RealtimeEvent<"trainingFailed">;

/**
 * Generate a consistent toast ID for training operations
 */
function getTrainingToastId(aiAgentId: string): string {
	return `training-${aiAgentId}`;
}

function getTrainingProgressToastId(aiAgentId: string): string {
	return `${getTrainingToastId(aiAgentId)}-progress`;
}

function getTrainingResultToastId(aiAgentId: string): string {
	return `${getTrainingToastId(aiAgentId)}-result`;
}

/**
 * Handle training started event
 */
export function handleTrainingStarted({
	event,
	context,
}: {
	event: TrainingStartedEvent;
	context: DashboardRealtimeContext;
}) {
	const { queryClient, website } = context;
	const { payload } = event;

	// Invalidate AI agent query to update training status
	queryClient
		.invalidateQueries({
			queryKey: [["aiAgent", "get"], { input: { websiteSlug: website.slug } }],
			exact: false,
		})
		.catch((error) => {
			console.error("Failed to invalidate AI agent query:", error);
		});

	// Invalidate training status query
	queryClient
		.invalidateQueries({
			queryKey: [
				["aiAgent", "getTrainingStatus"],
				{ input: { websiteSlug: website.slug } },
			],
			exact: false,
		})
		.catch((error) => {
			console.error("Failed to invalidate training status query:", error);
		});

	// Show loading toast
	toast.dismiss(getTrainingResultToastId(payload.aiAgentId));
	showProgressToast({
		id: getTrainingProgressToastId(payload.aiAgentId),
		indeterminate: true,
		status: "Processing knowledge base",
		title: "Training AI agent...",
	});

	console.log(
		`[training-progress] Training started for AI agent ${payload.aiAgentId}`
	);
}

/**
 * Handle training progress event
 */
export function handleTrainingProgress({
	event,
	context,
}: {
	event: TrainingProgressEvent;
	context: DashboardRealtimeContext;
}) {
	const { queryClient, website } = context;
	const { payload } = event;

	// Update the AI agent training status in the cache
	queryClient.setQueriesData(
		{
			queryKey: [
				["aiAgent", "getTrainingStatus"],
				{ input: { websiteSlug: website.slug } },
			],
			exact: false,
		},
		(oldData: unknown) => {
			if (!oldData || typeof oldData !== "object") {
				return oldData;
			}

			return {
				...oldData,
				trainingStatus: "training",
				trainingProgress: payload.percentage,
			};
		}
	);

	// Update toast with progress (keep stable shape - no item details)
	toast.dismiss(getTrainingResultToastId(payload.aiAgentId));
	showProgressToast({
		id: getTrainingProgressToastId(payload.aiAgentId),
		status: `${payload.processedItems} of ${payload.totalItems} items processed`,
		title: "Training AI agent...",
		value: payload.percentage,
		valueLabel: `${payload.percentage}%`,
	});

	console.log(
		`[training-progress] Training progress: ${payload.processedItems}/${payload.totalItems} (${payload.percentage}%)`
	);
}

/**
 * Handle training completed event
 */
export function handleTrainingCompleted({
	event,
	context,
}: {
	event: TrainingCompletedEvent;
	context: DashboardRealtimeContext;
}) {
	const { queryClient, website } = context;
	const { payload } = event;

	// Invalidate AI agent query to get final status
	queryClient
		.invalidateQueries({
			queryKey: [["aiAgent", "get"], { input: { websiteSlug: website.slug } }],
			exact: false,
		})
		.catch((error) => {
			console.error("Failed to invalidate AI agent query:", error);
		});

	// Invalidate training status query
	queryClient
		.invalidateQueries({
			queryKey: [
				["aiAgent", "getTrainingStatus"],
				{ input: { websiteSlug: website.slug } },
			],
			exact: false,
		})
		.catch((error) => {
			console.error("Failed to invalidate training status query:", error);
		});

	// Format duration
	const durationSeconds = Math.round(payload.duration / 1000);
	const durationText =
		durationSeconds < 60
			? `${durationSeconds}s`
			: `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`;

	// Invalidate training readiness so sidebar shows "Nothing new to train"
	queryClient
		.invalidateQueries({
			queryKey: [
				["aiAgent", "getTrainingReadiness"],
				{ input: { websiteSlug: website.slug } },
			],
			exact: false,
		})
		.catch((error) => {
			console.error("Failed to invalidate training readiness:", error);
		});

	// Invalidate training stats
	queryClient
		.invalidateQueries({
			queryKey: [
				["linkSource", "getTrainingStats"],
				{ input: { websiteSlug: website.slug } },
			],
			exact: false,
		})
		.catch((error) => {
			console.error("Failed to invalidate training stats:", error);
		});

	// Show success toast
	toast.dismiss(getTrainingProgressToastId(payload.aiAgentId));
	toast.dismiss(getTrainingResultToastId(payload.aiAgentId));
	toast.success("Training complete!", {
		id: getTrainingResultToastId(payload.aiAgentId),
		description: `${payload.totalItems} items processed, ${payload.totalChunks} chunks created in ${durationText}`,
	});

	console.log(
		`[training-progress] Training completed: ${payload.totalItems} items, ${payload.totalChunks} chunks in ${payload.duration}ms`
	);
}

/**
 * Handle training failed event
 */
export function handleTrainingFailed({
	event,
	context,
}: {
	event: TrainingFailedEvent;
	context: DashboardRealtimeContext;
}) {
	const { queryClient, website } = context;
	const { payload } = event;

	// Invalidate queries to show failed status
	queryClient
		.invalidateQueries({
			queryKey: [["aiAgent", "get"], { input: { websiteSlug: website.slug } }],
			exact: false,
		})
		.catch((error) => {
			console.error("Failed to invalidate AI agent query:", error);
		});

	// Invalidate training status query
	queryClient
		.invalidateQueries({
			queryKey: [
				["aiAgent", "getTrainingStatus"],
				{ input: { websiteSlug: website.slug } },
			],
			exact: false,
		})
		.catch((error) => {
			console.error("Failed to invalidate training status query:", error);
		});

	// Show error toast
	toast.dismiss(getTrainingProgressToastId(payload.aiAgentId));
	toast.dismiss(getTrainingResultToastId(payload.aiAgentId));
	toast.error("Training failed", {
		id: getTrainingResultToastId(payload.aiAgentId),
		description: payload.error || "An unexpected error occurred",
	});

	console.error(
		`[training-progress] Training failed for AI agent ${payload.aiAgentId}: ${payload.error}`
	);
}
