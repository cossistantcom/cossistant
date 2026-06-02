"use client";

import { SupportProvider } from "@cossistant/react";
import type { ReactNode } from "react";

export function CossistantProvider({ children }: { children: ReactNode }) {
	return <SupportProvider>{children}</SupportProvider>;
}
