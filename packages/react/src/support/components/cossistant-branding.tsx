import type { ReactElement } from "react";

import { cn } from "../utils";

export type CossistantLogoProps = {
	className?: string;
};

/**
 * Inline SVG of the Cossistant logomark.
 */
export function CossistantLogo({
	className,
}: CossistantLogoProps): ReactElement {
	return (
		<svg
			className={cn("h-5 w-5", className)}
			fill="none"
			viewBox="0 0 350 286"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Cossistant Logo</title>
			<path
				clipRule="evenodd"
				d="M349.071 60.9512V286H65.5293L.508789 225.719V60.9512L65.5293 0H284.051l65.02 60.9512Zm-267.9558 37.33c-3.8102.0002-7.4549 1.5574-10.0888 4.3108l-11.2569 11.767c-2.5097 2.624-3.8991 6.122-3.873 9.752l.1826 25.368H81.043l-.2237-13.446c0-9.826 2.3423-11.681 12.751-11.681h22.8487c10.409 0 11.96 1.855 11.96 12.457v12.67h25.218v-25.373c0-3.627-1.412-7.112-3.937-9.717l-11.497-11.863c-2.63-2.7131-6.247-4.2447-10.026-4.2448H81.1152Zm125.6658 0c-3.81 0-7.455 1.5571-10.09 4.3108l-11.256 11.767c-2.51 2.624-3.9 6.122-3.873 9.752l.182 25.368h24.965l-.224-13.446c0-9.826 2.343-11.681 12.751-11.681h22.849c10.408 0 11.959 1.855 11.959 12.457v12.67h25.219v-25.373c0-3.627-1.413-7.112-3.938-9.717l-11.497-11.863c-2.63-2.713-6.247-4.2448-10.026-4.2448h-47.021Z"
				fill="currentColor"
				fillRule="evenodd"
			/>
		</svg>
	);
}
