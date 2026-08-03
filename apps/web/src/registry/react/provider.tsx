"use client";

import { SupportProvider } from "@cossistant/react/provider";
import type { ReactNode } from "react";

export function CossistantProvider({ children }: { children: ReactNode }) {
	return <SupportProvider>{children}</SupportProvider>;
}
