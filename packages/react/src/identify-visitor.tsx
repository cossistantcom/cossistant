"use client";

import type { VisitorMetadata } from "@cossistant/types";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useVisitor } from "./hooks";
import { useIdentificationState } from "./support/context/identification";
import { computeMetadataHash } from "./utils/metadata-hash";

export type IdentifySupportVisitorProps = {
	/**
	 * Your internal user ID used to uniquely identify this visitor.
	 */
	externalId?: string;
	/**
	 * The visitor's email address. Required when `externalId` is not provided.
	 */
	email?: string;
	/**
	 * Display name shown to agents in the support widget.
	 */
	name?: string | null;
	/**
	 * URL to the visitor's avatar image.
	 */
	image?: string | null;
	/**
	 * Additional contact metadata such as plan, company, or MRR.
	 *
	 * @remarks `VisitorMetadata | null`
	 * @fumadocsHref #visitormetadata
	 */
	metadata?: VisitorMetadata | null;
};

/**
 * Component exposed by Cossistant allowing you to identify a visitor whenever rendered with either an `externalId` or `email`. Once identified, the visitor will be associated with a contact and any subsequent metadata updates will be attached to this contact.
 */
export const IdentifySupportVisitor = ({
	externalId,
	email,
	name,
	image,
	metadata: _newMetadata,
}: IdentifySupportVisitorProps): ReactElement | null => {
	const { visitor, identify, setVisitorMetadata } = useVisitor();
	const identificationState = useIdentificationState();
	// Key of the payload that last identified successfully. Latching the key
	// (instead of a boolean) re-identifies when the payload meaningfully
	// changes and never latches on failed or skipped attempts.
	const [identifiedKey, setIdentifiedKey] = useState<string | null>(null);
	const identifyInFlightRef = useRef(false);
	const [lastMetadataHash, setLastMetadataHash] = useState<string | null>(null);

	const identityKey = `${externalId ?? ""}|${email ?? ""}|${name ?? ""}|${image ?? ""}`;
	const hasIdentified = identifiedKey === identityKey;

	// Signal that identification is pending when we have identification data but no contact yet
	useEffect(() => {
		const hasIdentificationData = Boolean(externalId || email);
		const needsIdentification = hasIdentificationData && !visitor?.contact;

		if (identificationState?.setIsIdentifying) {
			identificationState.setIsIdentifying(
				needsIdentification && !hasIdentified
			);
		}
	}, [externalId, email, visitor?.contact, hasIdentified, identificationState]);

	// Only call identify if:
	// 1. Visitor hasn't been identified yet (no contact)
	// 2. Name, email, or image changed compared to current contact
	useEffect(() => {
		const shouldIdentify = async () => {
			const hasIdentificationData = Boolean(externalId || email);

			// Need at least externalId or email to identify
			if (!hasIdentificationData) {
				return;
			}

			// Wait for the visitor session to load; identifying earlier would
			// silently no-op inside identify(). The effect re-runs once the
			// website/visitor becomes available.
			if (!visitor) {
				return;
			}

			// Guard concurrent runs (e.g. StrictMode effect replay)
			if (identifyInFlightRef.current) {
				return;
			}

			// Case 1: No contact exists yet
			if (!visitor.contact) {
				if (hasIdentified) {
					return;
				}

				identifyInFlightRef.current = true;
				try {
					const result = await identify({
						externalId,
						email,
						name: name ?? undefined,
						image: image ?? undefined,
					});

					// Only latch on success so transient failures can retry
					if (result) {
						setIdentifiedKey(identityKey);
					}
				} finally {
					identifyInFlightRef.current = false;
					// Clear identifying state after identification completes
					if (identificationState?.setIsIdentifying) {
						identificationState.setIsIdentifying(false);
					}
				}
				return;
			}

			// Case 2: Contact exists but name/email/image changed
			const contact = visitor.contact;
			const nameChanged = name !== undefined && name !== contact.name;
			const emailChanged = email !== undefined && email !== contact.email;
			const imageChanged = image !== undefined && image !== contact.image;
			const hasChanges = nameChanged || emailChanged || imageChanged;

			if (hasChanges) {
				identifyInFlightRef.current = true;
				try {
					await identify({
						externalId,
						email,
						name: name ?? undefined,
						image: image ?? undefined,
					});
				} finally {
					identifyInFlightRef.current = false;
				}
			}
		};

		void shouldIdentify();
	}, [
		visitor,
		externalId,
		email,
		name,
		image,
		identify,
		hasIdentified,
		identityKey,
		identificationState,
	]);

	// Compute metadata hash, compare to previous hash and only update if it has changed
	useEffect(() => {
		const updateMetadata = async () => {
			// Skip if no metadata provided or visitor doesn't have a contact
			if (!_newMetadata) {
				return;
			}

			if (!visitor?.contact) {
				return;
			}

			// Compute new metadata hash
			const newMetadataHash = await computeMetadataHash(_newMetadata);

			// Get the existing hash from the contact
			const existingHash = visitor.contact.metadataHash || "";

			// Only update if hashes don't match and we haven't already updated with this hash
			const hashChanged = newMetadataHash !== existingHash;
			const notAlreadyUpdated = newMetadataHash !== lastMetadataHash;
			const shouldUpdate = Boolean(
				newMetadataHash && hashChanged && notAlreadyUpdated
			);

			if (shouldUpdate) {
				await setVisitorMetadata(_newMetadata);
				setLastMetadataHash(newMetadataHash);
			}
		};

		updateMetadata();
	}, [
		_newMetadata,
		visitor?.contact?.metadataHash,
		visitor?.contact,
		setVisitorMetadata,
		lastMetadataHash,
	]);

	return null;
};

IdentifySupportVisitor.displayName = "IdentifySupportVisitor";
