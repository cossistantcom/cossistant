"use client";

import { SupportProvider } from "@plasma/next";

export function CossistantProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	return <SupportProvider>{children}</SupportProvider>;
}
