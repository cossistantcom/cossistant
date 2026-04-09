import { prefetchAgentBehaviorPageData } from "../../_lib/prefetch";
import BehaviorPage from "./behavior-page";

import type { GetPromptStudioResponse } from "@plasma/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BaseSubmitButton } from "@/components/ui/base-submit-button";
import { Button } from "@/components/ui/button";
import { PageContent } from "@/components/ui/layout";
import {
	SettingsHeader,
	SettingsPage,
	SettingsRow,
	SettingsRowFooter,
} from "@/components/ui/layout/settings-layout";
import { PromptInput } from "@/components/ui/prompt-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsite } from "@/contexts/website";
import { useTRPC } from "@/lib/trpc/client";

export default async function Page({ params }: PageProps) {
	const { websiteSlug } = await params;

	await prefetchAgentBehaviorPageData(websiteSlug);

	return <BehaviorPage />;
}
