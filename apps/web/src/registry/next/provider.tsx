"use client";

import { SupportProvider } from "@cossistant/next/provider";
import type { ReactNode } from "react";

export function CossistantProvider({ children }: { children: ReactNode }) {
	return <SupportProvider>{children}</SupportProvider>;
}
