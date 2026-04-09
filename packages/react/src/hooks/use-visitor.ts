import type {
	PublicVisitor,
	VisitorMetadata,
	VisitorResponse,
} from "@plasma/types";
import { useCallback } from "react";
import { useSupportController } from "../controller-context";
import { useSupport } from "../provider";

export type IdentifyParams = {
	/**
	 * Your internal user ID. Required when `email` is not provided.
	 */
	externalId?: string;
	/**
	 * The visitor's email address. Required when `externalId` is not provided.
	 */
	email?: string;
	/**
	 * Display name for the identified contact.
	 */
	name?: string;
	/**
	 * URL to the visitor's avatar image.
	 */
	image?: string;
	/**
	 * Initial metadata to attach to the contact.
	 *
	 * @remarks `VisitorMetadata`
	 * @fumadocsType `VisitorMetadata`
	 * @fumadocsHref #visitormetadata
	 */
	metadata?: VisitorMetadata;
};

export type UseVisitorReturn = {
	/**
	 * Current visitor object, including contact data when identified.
	 *
	 * @remarks `PublicVisitor | null`
	 * @fumadocsType `PublicVisitor | null`
	 * @fumadocsHref #publicvisitor
	 */
	visitor: PublicVisitor | null;
	/**
	 * Update metadata for the identified contact.
	 *
	 * @param metadata - Metadata object to merge into the contact's existing metadata.
	 * @returns Promise<VisitorResponse | null>
	 */
	setVisitorMetadata: (
		metadata: VisitorMetadata
	) => Promise<VisitorResponse | null>;
	/**
	 * Convert an anonymous visitor into an identified contact.
	 *
	 * @param params - Identification parameters including externalId, email, name, image, and metadata.
	 * @returns Promise<{ contactId: string; visitorId: string } | null>
	 */
	identify: (
		params: IdentifyParams
	) => Promise<{ contactId: string; visitorId: string } | null>;
};

function safeWarn(message: string): void {
	if (typeof console !== "undefined" && typeof console.warn === "function") {
		console.warn(message);
	}
}

function safeError(message: string, error: unknown): void {
	if (typeof console !== "undefined" && typeof console.error === "function") {
		console.error(message, error);
	}
}

/**
 * Exposes the current visitor plus helpers to identify and update metadata.
 *
 * Note: Metadata is stored on contacts, not visitors. When you call
 * setVisitorMetadata, it will update the contact metadata if the visitor
 * has been identified. If not, you must call identify() first.
 */
export function useVisitor(): UseVisitorReturn {
	const controller = useSupportController();
	const { website } = useSupport();
	const visitor = website?.visitor || null;
	const visitorId = visitor?.id ?? null;

	const setVisitorMetadata = useCallback<
		(metadata: VisitorMetadata) => Promise<VisitorResponse | null>
	>(
		async (metadata) => {
			if (!visitorId) {
				safeWarn(
					"No visitor is associated with this session; metadata update skipped"
				);
				return null;
			}

			try {
				return await controller.updateVisitorMetadata(metadata);
			} catch (error) {
				safeError("Failed to update visitor metadata", error);
				return null;
			}
		},
		[controller, visitorId]
	);

	const identify = useCallback<
		(
			params: IdentifyParams
		) => Promise<{ contactId: string; visitorId: string } | null>
	>(
		async (params) => {
			if (!visitorId) {
				safeWarn(
					"No visitor is associated with this session; identify skipped"
				);
				return null;
			}

			try {
				const result = await controller.identify(params);

				if (!result) {
					return null;
				}

				return {
					contactId: result.contact.id,
					visitorId: result.visitorId,
				};
			} catch (error) {
				safeError("Failed to identify visitor", error);
				return null;
			}
		},
		[controller, visitorId]
	);

	return {
		visitor,
		setVisitorMetadata,
		identify,
	};
}
