import { beforeEach, describe, expect, it, mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const toastErrorMock = mock((_message: unknown) => {});
const toastSuccessMock = mock((_message: unknown, _options?: unknown) => {});

const queryClientMock = {
	cancelQueries: mock((async (_args: unknown) => {}) as (
		args: unknown
	) => Promise<void>),
	getQueryData: mock((_args: unknown) => {}),
	invalidateQueries: mock((async (_args: unknown) => {}) as (
		args: unknown
	) => Promise<void>),
	setQueryData: mock((_queryKey: unknown, _updater: unknown) => {}),
};

const queryNormalizerMock = {
	getObjectById: mock((_id: string) => {}),
	setNormalizedData: mock((_value: unknown) => {}),
};

mock.module("sonner", () => ({
	toast: {
		error: toastErrorMock,
		success: toastSuccessMock,
	},
}));

mock.module("@normy/react-query", () => ({
	useQueryNormalizer: () => queryNormalizerMock,
}));

mock.module("@tanstack/react-query", () => ({
	useMutation: (options: {
		onError?: (
			error: unknown,
			variables: unknown,
			context: unknown
		) => Promise<void> | void;
		onMutate?: (variables: unknown) => Promise<unknown> | unknown;
		onSettled?: (
			data: unknown,
			error: unknown,
			variables: unknown,
			context: unknown
		) => Promise<void> | void;
		onSuccess?: (
			data: unknown,
			variables: unknown,
			context: unknown
		) => Promise<void> | void;
	}) => ({
		isPending: false,
		mutateAsync: async (variables: Record<string, unknown>) => {
			const context = await options.onMutate?.(variables);

			try {
				await options.onSuccess?.({}, variables, context);
				await options.onSettled?.({}, null, variables, context);
				return {};
			} catch (error) {
				await options.onError?.(error, variables, context);
				await options.onSettled?.(undefined, error, variables, context);
				throw error;
			}
		},
	}),
	// Sibling page components reach the module graph through the barrel and
	// import useQuery. bun's mock.module replaces the whole module, so the
	// export has to exist even though these tests never render those pages.
	useQuery: () => ({ data: undefined, isLoading: false }),
	useQueryClient: () => queryClientMock,
}));

mock.module("@/lib/trpc/client", () => ({
	useTRPC: () => ({
		aiAgent: {
			getTrainingReadiness: {
				queryKey: (input: unknown) => ["aiAgent.getTrainingReadiness", input],
			},
		},
		knowledge: {
			create: { mutationOptions: (options: unknown) => options },
			delete: { mutationOptions: (options: unknown) => options },
			list: {
				queryKey: (input: unknown) => ["knowledge.list", input],
			},
			toggleIncluded: { mutationOptions: (options: unknown) => options },
			update: { mutationOptions: (options: unknown) => options },
		},
		linkSource: {
			getTrainingStats: {
				queryKey: (input: unknown) => ["linkSource.getTrainingStats", input],
			},
		},
	}),
}));

const useFaqMutationsModulePromise = import("./use-faq-mutations");
type FaqMutationsHook = {
	handleCreate: (params: {
		question: string;
		answer: string;
		categories?: string[];
	}) => Promise<unknown>;
};

async function renderHook(trainingControls?: {
	canAutoStartTraining: boolean;
	canRequestTraining: boolean;
	isTrainingActive: boolean;
	requestTraining: () => Promise<boolean>;
	startTrainingIfAllowed: () => Promise<boolean>;
}): Promise<FaqMutationsHook> {
	const { useFaqMutations } = await useFaqMutationsModulePromise;
	let hookValue: FaqMutationsHook | null = null;

	function Harness() {
		hookValue = useFaqMutations({
			aiAgentId: "agent-1",
			trainingControls,
			websiteSlug: "acme",
		}) as FaqMutationsHook;
		return null;
	}

	renderToStaticMarkup(<Harness />);

	if (!hookValue) {
		throw new Error("Hook did not render");
	}

	return hookValue;
}

describe("useFaqMutations", () => {
	beforeEach(() => {
		queryClientMock.cancelQueries.mockClear();
		queryClientMock.getQueryData.mockClear();
		queryClientMock.invalidateQueries.mockClear();
		queryClientMock.setQueryData.mockClear();
		queryNormalizerMock.getObjectById.mockClear();
		queryNormalizerMock.setNormalizedData.mockClear();
		toastErrorMock.mockClear();
		toastSuccessMock.mockClear();
	});

	it("auto-starts training after FAQ creation when allowed", async () => {
		const startTrainingIfAllowedMock = mock(
			(async () => true) as () => Promise<boolean>
		);
		const hookValue = await renderHook({
			canAutoStartTraining: true,
			canRequestTraining: true,
			isTrainingActive: false,
			requestTraining: mock((async () => true) as () => Promise<boolean>),
			startTrainingIfAllowed: startTrainingIfAllowedMock,
		});

		await hookValue.handleCreate({
			answer: "Use the dashboard.",
			question: "How do I get started?",
		});

		expect(startTrainingIfAllowedMock).toHaveBeenCalledTimes(1);
		expect(toastSuccessMock).toHaveBeenCalledTimes(0);
	});
});
