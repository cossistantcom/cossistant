import { isAdminUser } from "@api/lib/admin";
import { notFound } from "next/navigation";
import { ensureWebsiteAccess } from "@/lib/auth/website-access";
import { prefetch, trpc } from "@/lib/trpc/server";
import { AdminPageContent } from "./admin-page-content";

type AdminPageProps = {
	params: Promise<{
		websiteSlug: string;
	}>;
	searchParams: Promise<{
		search?: string;
	}>;
};

export default async function AdminPage({
	params,
	searchParams,
}: AdminPageProps) {
	const { websiteSlug } = await params;
	const { search } = await searchParams;
	const { user } = await ensureWebsiteAccess(websiteSlug);

	if (!isAdminUser(user)) {
		notFound();
	}

	await prefetch(
		trpc.admin.listUsers.queryOptions({
			search: search?.trim() || undefined,
		})
	);

	return <AdminPageContent websiteSlug={websiteSlug} />;
}
