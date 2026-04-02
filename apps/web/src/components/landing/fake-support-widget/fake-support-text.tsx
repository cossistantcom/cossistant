"use client";

import { SupportTextProvider } from "@plasma/react/support/text";
import type React from "react";

/**
 * Fake text provider that uses the real SupportTextProvider.
 * Since FakeSupportProvider now provides the real SupportContext,
 * the real SupportTextProvider will work correctly.
 */
export function FakeSupportTextProvider({
	children,
}: {
	children: React.ReactNode;
}): React.ReactElement {
	// Use the real SupportTextProvider - it will use useSupport() which now
	// works because FakeSupportProvider provides the real SupportContext
	return <SupportTextProvider>{children}</SupportTextProvider>;
}

// Re-export the real hook so components can use it
export { useSupportText } from "@plasma/react/support/text";
