import { isAdminUser } from "@api/lib/admin";
import { redirect } from "next/navigation";
import { ensureWebsiteAccess } from "@/lib/auth/website-access";
import { prefetch, trpc } from "@/lib/trpc/server";
import { AdminPageContent } from "./admin-page-content";

type AdminPageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
	searchParams: Promise<{
		adminView?: string;
		search?: string;
	}>;
};

export default async function AdminPage({
	params,
	searchParams,
}: AdminPageProps) {
	const { websiteSlug } = await params;
	const { adminView, search } = await searchParams;
	const { user } = await ensureWebsiteAccess(websiteSlug);

	if (!isAdminUser(user)) {
		redirect(`/${websiteSlug}/inbox`);
	}

	const queryOptions =
		adminView === "websites"
			? trpc.admin.listWebsites.queryOptions({
					search: search?.trim() || undefined,
				})
			: trpc.admin.listUsers.queryOptions({
					search: search?.trim() || undefined,
				});

	await prefetch(queryOptions);

	return <AdminPageContent websiteSlug={websiteSlug} />;
}
