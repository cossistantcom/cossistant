import type { SupportController } from "@cossistant/core";
import * as React from "react";

export const SupportControllerContext =
	React.createContext<SupportController | null>(null);

export function useSupportController(): SupportController {
	const controller = React.useContext(SupportControllerContext);

	if (!controller) {
		throw new Error(
			"useSupportController must be used within a cossistant SupportProvider"
		);
	}

	return controller;
}
