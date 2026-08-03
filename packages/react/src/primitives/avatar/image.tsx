"use client";

import * as React from "react";
import { useRenderElement } from "../../utils/use-render-element";
import { useAvatarContext } from "./avatar";

type ImageState = {
	imageLoadingStatus: "idle" | "loading" | "loaded" | "error";
};

export type AvatarImageProps = Omit<
	React.ImgHTMLAttributes<HTMLImageElement>,
	"src" | "alt"
> & {
	src: string;
	alt?: string;
	asChild?: boolean;
	className?: string;
	onLoadingStatusChange?: (status: ImageState["imageLoadingStatus"]) => void;
};

/**
 * Controlled `<img>` that syncs its loading status back to the avatar context
 * so fallbacks know when to display.
 */
export const AvatarImage = (() => {
	const Component = React.forwardRef<HTMLImageElement, AvatarImageProps>(
		(
			{
				src,
				alt = "",
				className,
				asChild = false,
				onLoadingStatusChange,
				...props
			},
			ref
		) => {
			const { imageLoadingStatus, onImageLoadingStatusChange } =
				useAvatarContext();

			const imageRef = React.useRef<HTMLImageElement>(null);
			// biome-ignore lint/style/noNonNullAssertion: ok
			React.useImperativeHandle(ref, () => imageRef.current!);

			const updateImageLoadingStatus = React.useCallback(
				(status: ImageState["imageLoadingStatus"]) => {
					onImageLoadingStatusChange(status);
					onLoadingStatusChange?.(status);
				},
				[onImageLoadingStatusChange, onLoadingStatusChange]
			);

			React.useLayoutEffect(() => {
				if (!src) {
					updateImageLoadingStatus("error");
					return;
				}

				let isMounted = true;
				const image = new Image();

				const updateStatus = (status: ImageState["imageLoadingStatus"]) => {
					if (!isMounted) {
						return;
					}
					updateImageLoadingStatus(status);
				};

				updateStatus("loading");

				image.onload = () => updateStatus("loaded");
				image.onerror = () => updateStatus("error");
				image.src = src;

				return () => {
					isMounted = false;
				};
			}, [src, updateImageLoadingStatus]);

			const state: ImageState = {
				imageLoadingStatus,
			};

			return useRenderElement(
				"img",
				{
					asChild,
					className,
				},
				{
					ref: imageRef,
					state,
					enabled: imageLoadingStatus === "loaded",
					props: {
						...props,
						src,
						alt,
					},
				}
			);
		}
	);

	Component.displayName = "AvatarImage";
	return Component;
})();
