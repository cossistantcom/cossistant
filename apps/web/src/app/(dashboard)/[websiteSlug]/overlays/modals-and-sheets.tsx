"use client";

import { parseAsString, useQueryState } from "nuqs";
import { KnowledgePreviewModal } from "@/components/modals/knowledge-preview-modal";
import { useWebsite } from "@/contexts/website";
import { TeamInviteModalWrapper } from "./modals";
import { AdminUserWebsitesSheetWrapper } from "./sheets/admin-user-websites-sheet-wrapper";

/**
 * Global overlays orchestrator for the dashboard.
 *
 * This component listens to URL parameters via nuqs and renders
 * the appropriate modal overlay.
 */
export function ModalsAndSheets() {
	const website = useWebsite();
	const [knowledgeId, setKnowledgeId] = useQueryState(
		"knowledge",
		parseAsString
	);
	const [adminUserId, setAdminUserId] = useQueryState(
		"adminUserId",
		parseAsString
	);

	const handleKnowledgeModalClose = () => {
		void setKnowledgeId(null);
	};

	return (
		<>
			{/* Knowledge Preview Modal */}
			{knowledgeId && (
				<KnowledgePreviewModal
					knowledgeId={knowledgeId}
					onOpenChange={(open) => {
						if (!open) {
							handleKnowledgeModalClose();
						}
					}}
					open
					websiteSlug={website.slug}
				/>
			)}

			{adminUserId && (
				<AdminUserWebsitesSheetWrapper
					onClose={() => {
						void setAdminUserId(null);
					}}
					userId={adminUserId}
				/>
			)}

			<TeamInviteModalWrapper />
		</>
	);
}
