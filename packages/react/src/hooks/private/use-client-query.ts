import type { CossistantClient } from "@cossistant/core";
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
	const refetchOnMountRef = useRef(refetchOnMount);

	queryFnRef.current = queryFn;
	refetchOnMountRef.current = refetchOnMount;

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
		async (args?: TArgs, isManual = false): Promise<TData | undefined> => {
			// Handle null client (configuration error case)
			if (!client) {
				return dataRef.current;
			}

			if (!(enabled || isManual)) {
				return dataRef.current;
			}

			// Explicit args apply to this call only: persisting them would leak a
			// pagination cursor into interval/focus refetches and key changes.
			const nextArgs = args ?? argsRef.current;

			const fetchId = fetchIdRef.current + 1;
			fetchIdRef.current = fetchId;

			setIsLoading(true);
			setError(null);

			try {
				// Manual refetches bypass deduplication: their args (e.g. a
				// pagination cursor) can differ from the in-flight request that
				// shares this key.
				const result = isManual
					? await queryFnRef.current(client, nextArgs)
					: await executeWithDeduplication(queryKey, () =>
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

		// Read refetchOnMount through a ref: store-derived flags flip when the
		// first response lands, and re-running this effect would double-fetch.
		const shouldFetchInitially = hasMountedRef.current
			? true
			: refetchOnMountRef.current || !hasFetchedRef.current;

		hasMountedRef.current = true;

		if (!shouldFetchInitially) {
			return;
		}

		// Errors are captured in state; swallow the rejection so background
		// fetch failures never escape as unhandled rejections in the host app.
		execute(argsRef.current).catch(() => {});
	}, [enabled, execute, ...dependencies]);

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
			execute(argsRef.current).catch(() => {});
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

			execute(argsRef.current).catch(() => {});
		};

		const onFocus = () => {
			handleRefetch();
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				handleRefetch();
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
