"use client";

import type { RouterOutputs } from "@plasma/api/types";
import { useQueryNormalizer } from "@normy/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ContactSheet } from "@/components/contact-sheet";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";

type ContactDetail = RouterOutputs["contact"]["get"];

type ContactSheetWrapperProps = {
	contactId: string;
	onClose: () => void;
};

/**
 * Self-contained ContactSheet wrapper that handles its own data fetching.
 * This wrapper is rendered by the global ModalsAndSheets orchestrator
 * when the `contact` URL param is set.
 */
export function ContactSheetWrapper({
	contactId,
	onClose,
}: ContactSheetWrapperProps) {
	const trpc = useTRPC();
	const website = useWebsite();
	const queryNormalizer = useQueryNormalizer();

	const contactPlaceholder = useMemo<ContactDetail | undefined>(
		() => queryNormalizer.getObjectById<ContactDetail>(contactId),
		[queryNormalizer, contactId]
	);

	const contactDetailQuery = useQuery({
		...trpc.contact.get.queryOptions({
			websiteSlug: website.slug,
			contactId,
		}),
		placeholderData: contactPlaceholder,
	});

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			onClose();
		}
	};

	return (
		<ContactSheet
			data={contactDetailQuery.data ?? null}
			isError={contactDetailQuery.isError}
			isLoading={contactDetailQuery.isFetching}
			isOpen
			onOpenChange={handleOpenChange}
		/>
	);
}
