"use client";

import * as React from "react";
import { useRenderElement } from "../../utils/use-render-element";

type AvatarState = {
	imageLoadingStatus: "idle" | "loading" | "loaded" | "error";
};

export type AvatarProps = Omit<
	React.HTMLAttributes<HTMLSpanElement>,
	"children"
> & {
	children?: React.ReactNode;
	asChild?: boolean;
	className?: string;
};

export interface AvatarContextValue extends AvatarState {
	onImageLoadingStatusChange: (
		status: AvatarState["imageLoadingStatus"]
	) => void;
}

const AvatarContext = React.createContext<AvatarContextValue | null>(null);

/**
 * Consumer hook for the `Avatar` compound components. Throws when components are
 * rendered outside of the `Avatar` tree to surface integration errors early.
 */
export const useAvatarContext = () => {
	const context = React.useContext(AvatarContext);
	if (!context) {
		throw new Error(
			"Avatar compound components cannot be rendered outside the Avatar component"
		);
	}
	return context;
};

/**
 * Root avatar wrapper that coordinates image loading state with fallback
 * children so consumers can compose initials, images and status rings.
 */
export const Avatar = (() => {
	const Component = React.forwardRef<HTMLSpanElement, AvatarProps>(
		({ children, className, asChild = false, ...props }, ref) => {
			const [imageLoadingStatus, setImageLoadingStatus] =
				React.useState<AvatarState["imageLoadingStatus"]>("idle");

			const contextValue: AvatarContextValue = React.useMemo(
				() => ({
					imageLoadingStatus,
					onImageLoadingStatusChange: setImageLoadingStatus,
				}),
				[imageLoadingStatus]
			);

			const state: AvatarState = {
				imageLoadingStatus,
			};

			return (
				<AvatarContext.Provider value={contextValue}>
					{useRenderElement(
						"div",
						{
							asChild,
							className,
						},
						{
							ref,
							state,
							props: {
								...props,
								children,
							},
						}
					)}
				</AvatarContext.Provider>
			);
		}
	);

	Component.displayName = "Avatar";
	return Component;
})();
