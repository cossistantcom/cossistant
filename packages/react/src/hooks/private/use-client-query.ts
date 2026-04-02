import type { CossistantClient } from "@plasma/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type QueryFn<TData, TArgs> = (
	client: CossistantClient,
	args?: TArgs | undefined
) => Promise<TData>;

type UseClientQueryOptions<TData, TArgs> = {
	client: CossistantClient | null;
	queryFn: QueryFn<TData, TArgs>;
	/**
	 * Unique key to identify this query for deduplication.
	 * When provided, concurrent requests with the same key will share a single
	 * in-flight promise instead of making duplicate API calls.
	 */
	queryKey?: string;
	enabled?: boolean;
	refetchInterval?: number | false;
	refetchOnWindowFocus?: boolean;
	refetchOnMount?: boolean;
	initialData?: TData;
	initialArgs?: TArgs;
	dependencies?: readonly unknown[];
};

type UseClientQueryResult<TData, TArgs> = {
	data: TData | undefined;
	error: Error | null;
	isLoading: boolean;
	refetch: (args?: TArgs) => Promise<TData | undefined>;
};

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}

	return new Error(typeof error === "string" ? error : "Unknown error");
}

const EMPTY_DEPENDENCIES: readonly unknown[] = [];

/**
 * Module-level cache for in-flight requests.
 * Maps query keys to their pending promises for deduplication.
 */
const inFlightRequests = new Map<string, Promise<unknown>>();

/**
 * Execute a query with deduplication support.
 * If a query with the same key is already in flight, returns the existing promise.
 */
function executeWithDeduplication<TData>(
	queryKey: string | undefined,
	queryFn: () => Promise<TData>
): Promise<TData> {
	// No deduplication if no key provided
	if (!queryKey) {
		return queryFn();
	}

	// Check for existing in-flight request
	const existing = inFlightRequests.get(queryKey);
	if (existing) {
		return existing as Promise<TData>;
	}

	// Create new request and track it
	const promise = queryFn().finally(() => {
		// Clean up after request completes (success or error)
		inFlightRequests.delete(queryKey);
	});

	inFlightRequests.set(queryKey, promise);
	return promise;
}

/**
 * Lightweight data-fetching abstraction that plugs into the SDK client instead
 * of React Query. It tracks loading/error state, supports polling, window
 * focus refetching and exposes a typed refetch helper.
 */
export function useClientQuery<TData, TArgs = void>(
	options: UseClientQueryOptions<TData, TArgs>
): UseClientQueryResult<TData, TArgs> {
	const {
		client,
		queryFn,
		queryKey,
		enabled = true,
		refetchInterval = false,
		refetchOnWindowFocus = false,
		refetchOnMount = true,
		initialData,
		initialArgs,
		dependencies = EMPTY_DEPENDENCIES,
	} = options;

	const [data, setData] = useState<TData | undefined>(initialData);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState(
		initialData === undefined && Boolean(enabled)
	);

	const dataRef = useRef(data);
	dataRef.current = data;

	const argsRef = useRef<TArgs | undefined>(initialArgs);
	const fetchIdRef = useRef(0);
	const hasMountedRef = useRef(false);
	const hasFetchedRef = useRef(initialData !== undefined);
	const isMountedRef = useRef(true);
	const queryFnRef = useRef(queryFn);

	queryFnRef.current = queryFn;

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		argsRef.current = initialArgs;
	}, [initialArgs]);

	const execute = useCallback(
		async (args?: TArgs, ignoreEnabled = false): Promise<TData | undefined> => {
			// Handle null client (configuration error case)
			if (!client) {
				return dataRef.current;
			}

			if (!(enabled || ignoreEnabled)) {
				return dataRef.current;
			}

			const nextArgs = args ?? argsRef.current;
			argsRef.current = nextArgs;

			const fetchId = fetchIdRef.current + 1;
			fetchIdRef.current = fetchId;

			setIsLoading(true);
			setError(null);

			try {
				// Use deduplication to share in-flight requests with the same key
				const result = await executeWithDeduplication(queryKey, () =>
					queryFnRef.current(client, nextArgs)
				);

				if (!isMountedRef.current || fetchId !== fetchIdRef.current) {
					return dataRef.current;
				}

				dataRef.current = result;
				setData(result);
				setError(null);
				setIsLoading(false);
				hasFetchedRef.current = true;

				return result;
			} catch (raw: unknown) {
				if (!isMountedRef.current || fetchId !== fetchIdRef.current) {
					return dataRef.current;
				}

				const normalized = toError(raw);
				setError(normalized);
				setIsLoading(false);

				throw normalized;
			}
		},
		[client, enabled, queryKey]
	);

	useEffect(() => {
		if (!enabled) {
			setIsLoading(false);
			return;
		}

		const shouldFetchInitially = hasMountedRef.current
			? true
			: refetchOnMount || !hasFetchedRef.current;

		hasMountedRef.current = true;

		if (!shouldFetchInitially) {
			return;
		}

		void execute(argsRef.current);
	}, [enabled, execute, refetchOnMount, ...dependencies]);

	useEffect(() => {
		if (!enabled) {
			return;
		}

		if (
			refetchInterval === false ||
			refetchInterval === null ||
			refetchInterval <= 0 ||
			typeof window === "undefined"
		) {
			return;
		}

		const timer = window.setInterval(() => {
			void execute(argsRef.current);
		}, refetchInterval);

		return () => {
			window.clearInterval(timer);
		};
	}, [enabled, execute, refetchInterval]);

	useEffect(() => {
		if (
			!refetchOnWindowFocus ||
			typeof window === "undefined" ||
			typeof document === "undefined"
		) {
			return;
		}

		const handleRefetch = () => {
			if (!enabled) {
				return;
			}

			void execute(argsRef.current);
		};

		const onFocus = () => {
			void handleRefetch();
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				void handleRefetch();
			}
		};

		window.addEventListener("focus", onFocus);
		document.addEventListener("visibilitychange", onVisibilityChange);

		return () => {
			window.removeEventListener("focus", onFocus);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [enabled, execute, refetchOnWindowFocus]);

	const refetch = useCallback(
		async (args?: TArgs) => execute(args, true),
		[execute]
	);

	return useMemo(
		() => ({
			data,
			error,
			isLoading,
			refetch,
		}),
		[data, error, isLoading, refetch]
	);
}
