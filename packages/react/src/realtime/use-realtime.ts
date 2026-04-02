import type {
	AnyRealtimeEvent,
	RealtimeEvent,
	RealtimeEventData,
	RealtimeEventType,
} from "@plasma/types/realtime-events";
import { useEffect, useRef } from "react";
import { shouldDeliverEvent } from "./event-filter";
import { useRealtimeConnection } from "./provider";

export type RealtimeHandlerContext<TContext> = TContext;

export type RealtimeEventMeta<TType extends RealtimeEventType, TContext> = {
	event: RealtimeEvent<TType>;
	context: RealtimeHandlerContext<TContext>;
};

export type RealtimeEventHandler<TType extends RealtimeEventType, TContext> = (
	data: RealtimeEventData<TType>,
	meta: RealtimeEventMeta<TType, TContext>
) => void | Promise<void>;

export type RealtimeEventHandlerEntry<
	TType extends RealtimeEventType,
	TContext,
> =
	| RealtimeEventHandler<TType, TContext>
	| RealtimeEventHandler<TType, TContext>[];

export type RealtimeEventHandlersMap<TContext> = Partial<{
	[TType in RealtimeEventType]: RealtimeEventHandlerEntry<TType, TContext>;
}>;

type UseRealtimeOptions<
	TContext,
	THandlers extends RealtimeEventHandlersMap<TContext>,
> = {
	events: THandlers;
	websiteId?: string | null;
	visitorId?: string | null;
	context?: TContext;
	onEventError?: (
		error: unknown,
		event: RealtimeEvent<RealtimeEventType>
	) => void;
};

/**
 * Binds realtime connection events to typed handler maps with automatic
 * filtering by website/visitor ids.
 */
export function useRealtime<
	TContext = void,
	THandlers extends
		RealtimeEventHandlersMap<TContext> = RealtimeEventHandlersMap<TContext>,
>({
	events,
	websiteId,
	visitorId,
	context,
	onEventError,
}: UseRealtimeOptions<TContext, THandlers>) {
	const connection = useRealtimeConnection();
	const handlersRef = useRef<RealtimeEventHandlersMap<TContext>>(events);
	const contextRef = useRef<TContext | undefined>(context);
	const websiteIdRef = useRef<string | null>(websiteId ?? null);
	const visitorIdRef = useRef<string | null>(visitorId ?? null);
	const errorHandlerRef = useRef<
		| ((error: unknown, event: RealtimeEvent<RealtimeEventType>) => void)
		| undefined
	>(onEventError);

	useEffect(() => {
		handlersRef.current = events;
	}, [events]);

	useEffect(() => {
		contextRef.current = context;
	}, [context]);

	useEffect(() => {
		websiteIdRef.current = websiteId ?? null;
	}, [websiteId]);

	useEffect(() => {
		visitorIdRef.current = visitorId ?? null;
	}, [visitorId]);

	useEffect(() => {
		errorHandlerRef.current = onEventError;
	}, [onEventError]);

	useEffect(
		() =>
			connection.subscribe((event) => {
				const handlers = handlersRef.current[event.type];

				if (!handlers) {
					return;
				}

				if (
					!shouldDeliverEvent(event, websiteIdRef.current, visitorIdRef.current)
				) {
					return;
				}

				const payload = Array.isArray(handlers) ? handlers : [handlers];

				for (const handler of payload) {
					Promise.resolve(
						handler(event.payload as never, {
							event: event as never,
							context: contextRef.current as TContext,
						})
					).catch((error) => {
						const errorHandler = errorHandlerRef.current;
						if (errorHandler) {
							errorHandler(error, event);
						} else {
							console.error("[Realtime] Event handler threw an error", error);
						}
					});
				}
			}),
		[connection]
	);

	return connection;
}
