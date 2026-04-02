"use client";

import type { DefaultMessage } from "@plasma/types";
import * as React from "react";
import { useSupport } from "./provider";

export type SupportConfigProps = {
	/**
	 * Custom welcome messages shown before a conversation starts.
	 *
	 * @remarks `DefaultMessage[]`
	 * @fumadocsHref #defaultmessage
	 */
	defaultMessages?: DefaultMessage[];
	/**
	 * Quick reply options displayed to users.
	 */
	quickOptions?: string[];
};

/**
 * Component exposed by Cossistant allowing you to change the support widget default messages and quick response whenever rendered.
 */
export const SupportConfig = ({
	defaultMessages,
	quickOptions,
}: SupportConfigProps): React.ReactElement | null => {
	const { setDefaultMessages, setQuickOptions } = useSupport();

	React.useEffect(() => {
		if (defaultMessages !== undefined) {
			setDefaultMessages(defaultMessages);
		}
	}, [defaultMessages, setDefaultMessages]);

	React.useEffect(() => {
		if (quickOptions !== undefined) {
			setQuickOptions(quickOptions);
		}
	}, [quickOptions, setQuickOptions]);

	return null;
};

SupportConfig.displayName = "SupportConfig";
