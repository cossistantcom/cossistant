"use client";

import * as React from "react";
import type { SupportMode } from "../types";

const SupportModeContext = React.createContext<SupportMode>("floating");

export type SupportModeProviderProps = {
	mode?: SupportMode;
	children: React.ReactNode;
};

export const SupportModeProvider: React.FC<SupportModeProviderProps> = ({
	mode = "floating",
	children,
}) => (
	<SupportModeContext.Provider value={mode}>
		{children}
	</SupportModeContext.Provider>
);

export function useSupportMode(): SupportMode {
	return React.useContext(SupportModeContext);
}
