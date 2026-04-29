/** biome-ignore-all lint/style/noNonNullAssertion: ok here */
"use client";

import type { RouterOutputs } from "@cossistant/api/types";
import { IdentifySupportVisitor } from "@cossistant/react/identify-visitor";
import { useQuery } from "@tanstack/react-query";
import type { TRPCClientErrorBase } from "@trpc/client";
import type { DefaultErrorShape } from "@trpc/server/unstable-core-do-not-import";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect } from "react";
import { authClient, type Session } from "@/lib/auth/client";
import {
	buildSessionExpiredLoginPath,
	getCurrentSafeCallbackPath,
} from "@/lib/auth/redirect";
import { useTRPC } from "@/lib/trpc/client";

type WebsiteContextValue = {
	session: Session["session"];
	user: Session["user"];
	website: RouterOutputs["website"]["getBySlug"];
	members: RouterOutputs["user"]["getWebsiteMembers"];
	organizationWebsites: RouterOutputs["website"]["listByOrganization"];
	isLoading: boolean;
	views: RouterOutputs["view"]["list"];
	error: TRPCClientErrorBase<DefaultErrorShape> | null;
};

const WebsiteContext = createContext<WebsiteContextValue | null>(null);

type WebsiteProviderProps = {
	children: React.ReactNode;
	websiteSlug: string;
};

export function WebsiteProvider({
	children,
	websiteSlug,
}: WebsiteProviderProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const redirectToLogin = useCallback(() => {
		router.replace(buildSessionExpiredLoginPath(getCurrentSafeCallbackPath()));
	}, [router]);

	const { data: sessionData, isPending: isLoadingSession } =
		authClient.useSession();

	const {
		data: website,
		isFetching: isLoadingWebsite,
		error: errorWebsite,
	} = useQuery({
		...trpc.website.getBySlug.queryOptions({
			slug: websiteSlug,
		}),
		enabled: !!sessionData,
	});

	const {
		data: members,
		isFetching: isLoadingMembers,
		error: errorMembers,
	} = useQuery({
		...trpc.user.getWebsiteMembers.queryOptions({
			websiteSlug,
		}),
		enabled: !!sessionData,
	});

	const {
		data: views,
		isFetching: isLoadingViews,
		error: errorViews,
	} = useQuery({
		...trpc.view.list.queryOptions({
			slug: websiteSlug,
		}),
		enabled: !!sessionData,
	});

	const {
		data: organizationWebsites,
		isFetching: isLoadingOrgWebsites,
		error: errorOrgWebsites,
	} = useQuery({
		...trpc.website.listByOrganization.queryOptions({
			organizationId: website?.organizationId ?? "",
		}),
		enabled: !!sessionData && !!website?.organizationId,
	});

	useEffect(() => {
		if (sessionData === null && !isLoadingSession) {
			redirectToLogin();
		}
	}, [redirectToLogin, sessionData, isLoadingSession]);

	useEffect(() => {
		const authError =
			errorWebsite ?? errorMembers ?? errorViews ?? errorOrgWebsites;

		if (!authError?.data?.code) {
			return;
		}

		if (authError.data.code === "UNAUTHORIZED") {
			redirectToLogin();
			return;
		}

		if (authError.data.code === "FORBIDDEN") {
			router.replace("/select");
		}
	}, [
		errorMembers,
		errorViews,
		errorWebsite,
		errorOrgWebsites,
		redirectToLogin,
		router,
	]);

	if (!sessionData) {
		return null;
	}

	return (
		<WebsiteContext.Provider
			value={{
				session: sessionData.session,
				user: sessionData.user,
				website: website!,
				members: members!,
				organizationWebsites: organizationWebsites ?? [],
				views: views!,
				isLoading:
					isLoadingWebsite ||
					isLoadingViews ||
					isLoadingMembers ||
					isLoadingOrgWebsites ||
					!website ||
					!members ||
					!views,
				error: errorViews || errorWebsite || errorMembers || errorOrgWebsites,
			}}
		>
			{children}
			<IdentifySupportVisitor
				email={sessionData?.user?.email}
				externalId={sessionData?.user?.id}
				image={sessionData?.user?.image}
				name={sessionData?.user?.name}
			/>
		</WebsiteContext.Provider>
	);
}

export function useWebsite() {
	const context = useContext(WebsiteContext);

	if (!context) {
		throw new Error("useWebsite must be used within a WebsiteProvider");
	}

	if (!(context.website || context.isLoading)) {
		throw new Error("Website not found");
	}

	return context.website;
}

export function useOptionalWebsite() {
	const context = useContext(WebsiteContext);

	if (!context) {
		return null;
	}

	return context.website ?? null;
}

export function useUserSession() {
	const context = useContext(WebsiteContext);

	if (!context) {
		throw new Error("useUserSession must be used within a WebsiteProvider");
	}

	return { user: context.user, session: context.session };
}

export function useWebsiteViews() {
	const context = useContext(WebsiteContext);
	if (!context) {
		throw new Error("useWebsiteViews must be used within a WebsiteProvider");
	}

	if (!(context.views || context.isLoading)) {
		throw new Error("Views not found");
	}

	return context.views;
}

export function useWebsiteMembers() {
	const context = useContext(WebsiteContext);
	if (!context) {
		throw new Error("useWebsiteMembers must be used within a WebsiteProvider");
	}

	return context.members;
}

export function useOrganizationWebsites() {
	const context = useContext(WebsiteContext);
	if (!context) {
		throw new Error(
			"useOrganizationWebsites must be used within a WebsiteProvider"
		);
	}

	return context.organizationWebsites;
}
