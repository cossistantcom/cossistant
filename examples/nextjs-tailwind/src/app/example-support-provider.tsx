"use client";

import { SupportProvider } from "@cossistant/next";
import * as React from "react";
import { createMockSupportController } from "@/lib/mock-support-controller";

type ExampleSupportProviderProps = {
	children: React.ReactNode;
	publicKey?: string;
};

export function ExampleSupportProvider({
	children,
	publicKey,
}: ExampleSupportProviderProps) {
	const controller = React.useMemo(
		() => (publicKey ? undefined : createMockSupportController()),
		[publicKey]
	);

	if (publicKey) {
		return <SupportProvider publicKey={publicKey}>{children}</SupportProvider>;
	}

	return (
		<SupportProvider autoConnect={false} controller={controller}>
			{children}
		</SupportProvider>
	);
}
