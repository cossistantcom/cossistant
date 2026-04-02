/** biome-ignore-all lint/performance/useTopLevelRegex: ok */
"use client";

import type React from "react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useId,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { ImageIcon, XIcon } from "lucide-react";

import {
	AvatarContainer,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const DEFAULT_ACCEPT = "image/png,image/jpeg,image/webp,image/avif,image/gif";
const SVG_MIME_TYPE = "image/svg+xml";

export type AvatarInputValue = {
	/** Object URL or remote URL used for previewing the avatar. */
	previewUrl: string;
	/** Remote URL after uploading to storage (optional). */
	url?: string;
	/** The underlying file that was selected (optional). */
	file?: File;
	/** MIME type of the avatar. */
	mimeType: string;
	/** Original filename (best effort). */
	name?: string;
	/** File size in bytes. */
	size?: number;
};

export type AvatarInputOnUpload = (
	file: File
) => Promise<
	string | Partial<Omit<AvatarInputValue, "file" | "previewUrl">> | undefined
>;

export interface AvatarInputProps
	extends Omit<React.ComponentPropsWithoutRef<"div">, "onChange" | "onError"> {
	value?: AvatarInputValue | string | null;
	onChange?: (value: AvatarInputValue | null) => void;
	/** Whether the component is disabled. */
	disabled?: boolean;
	/** Optional description rendered under the controls. */
	description?: React.ReactNode;
	/** Aspect ratio used for the cropper (default: 1 / 1). */
	aspectRatio?: number;
	/** Accept attribute for the underlying file input. */
	accept?: string;
	/** Callback fired before starting an upload (useful for analytics). */
	onUploadStart?: (file: File) => void;
	/** Callback fired after upload successfully completed. */
	onUploadComplete?: (payload: AvatarInputValue) => void;
	/** Error handler invoked when selecting, cropping or uploading fails. */
	onError?: (error: Error) => void;
	/** Optional helper to automatically upload to S3 using a pre-signed URL. */
	presignedUrl?: string;
	/** Custom headers used when uploading to the pre-signed URL. */
	uploadHeaders?: HeadersInit;
	/** Custom upload handler, useful for integrating with mutations or APIs. */
	onUpload?: AvatarInputOnUpload;
	/** Whether removing the avatar is allowed (default true). */
	allowRemove?: boolean;
	/** Whether SVG uploads are permitted. Disabled by default for security. */
	allowSvgUploads?: boolean;
	/** Text shown on the upload button (default: "Upload"/"Change"). */
	uploadLabel?: string;
	/** Placeholder text shown next to the preview. */
	placeholder?: React.ReactNode;
	/** Display initials in the fallback avatar. */
	fallbackInitials?: string;
	/** Optional className applied to the preview container. */
	previewClassName?: string;
	/** Name passed down to the hidden input for React Hook Form compatibility. */
	name?: string;
	/** Blur handler forwarded to the hidden input for React Hook Form. */
	onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

type CropState = {
	file: File;
	objectUrl: string;
	name?: string;
};

type CommitFileOptions = {
	skipUpload?: boolean;
	objectUrlOverride?: string;
};

function getFileExtension(name?: string) {
	if (!name) {
		return "";
	}
	const lastDot = name.lastIndexOf(".");
	if (lastDot === -1) {
		return "";
	}
	return name.slice(lastDot);
}

async function readFileAsObjectUrl(file: File) {
	return URL.createObjectURL(file);
}

function isBlobUrl(url: string | null | undefined): url is string {
	return Boolean(url?.startsWith("blob:"));
}

function revokeObjectUrlSafely(url: string | null | undefined) {
	if (!isBlobUrl(url)) {
		return;
	}

	URL.revokeObjectURL(url);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Failed to load image"));
		image.src = src;
	});
}

type CanvasImageSourceLike = ImageBitmap | HTMLImageElement;

function getImageDimensions(image: CanvasImageSourceLike) {
	if ("naturalWidth" in image && image.naturalWidth) {
		return {
			width: image.naturalWidth,
			height: image.naturalHeight,
		};
	}

	return {
		width: image.width,
		height: image.height,
	};
}

async function loadImageWithOrientation(
	file: File,
	source: string
): Promise<CanvasImageSourceLike> {
	if (typeof createImageBitmap === "function") {
		try {
			return await createImageBitmap(file, {
				imageOrientation: "from-image",
			} as ImageBitmapOptions & { imageOrientation?: "from-image" });
		} catch (error) {
			console.warn(
				"AvatarInput: falling back to Image() for orientation handling",
				error
			);
		}
	}

	return loadImage(source);
}

async function cropImage({
	file,
	cropArea,
	source,
}: {
	file: File;
	cropArea: Area;
	source: string;
}): Promise<File> {
	const image = await loadImageWithOrientation(file, source);
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	if (!ctx) {
		throw new Error("Failed to acquire 2D context for cropping");
	}

	const { width: imageWidth, height: imageHeight } = getImageDimensions(image);
	const sourceX = Math.min(
		Math.max(0, Math.round(cropArea.x)),
		Math.max(0, imageWidth - 1)
	);
	const sourceY = Math.min(
		Math.max(0, Math.round(cropArea.y)),
		Math.max(0, imageHeight - 1)
	);
	const maxWidth = Math.max(1, imageWidth - sourceX);
	const maxHeight = Math.max(1, imageHeight - sourceY);
	const sourceWidth = Math.min(
		Math.max(1, Math.round(cropArea.width)),
		maxWidth
	);
	const sourceHeight = Math.min(
		Math.max(1, Math.round(cropArea.height)),
		maxHeight
	);
	const targetWidth = sourceWidth;
	const targetHeight = sourceHeight;
	const pixelRatio =
		typeof window !== "undefined" ? (window.devicePixelRatio ?? 1) : 1;

	canvas.width = Math.max(1, Math.round(targetWidth * pixelRatio));
	canvas.height = Math.max(1, Math.round(targetHeight * pixelRatio));

	ctx.scale(pixelRatio, pixelRatio);
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(
		image,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		0,
		0,
		targetWidth,
		targetHeight
	);

	if ("close" in image && typeof image.close === "function") {
		image.close();
	}

	const outputType =
		file.type && file.type !== "image/svg+xml" ? file.type : "image/png";
	const extension =
		outputType === "image/png" ? ".png" : getFileExtension(file.name) || ".jpg";

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((generated) => {
			if (!generated) {
				reject(new Error("Failed to generate cropped image"));
				return;
			}
			resolve(generated);
		}, outputType);
	});

	return new File(
		[blob],
		`${file.name.replace(/\.[^/.]+$/, "") || "avatar"}-cropped${extension}`,
		{
			type: outputType,
			lastModified: Date.now(),
		}
	);
}

export type UploadToPresignedUrlOptions = {
	file: Blob;
	url: string;
	method?: string;
	headers?: HeadersInit;
	onProgress?: (progress: number) => void;
};

export async function uploadToPresignedUrl({
	file,
	url,
	method = "PUT",
	headers,
	onProgress,
}: UploadToPresignedUrlOptions): Promise<Response> {
	if (
		typeof window !== "undefined" &&
		typeof XMLHttpRequest !== "undefined" &&
		onProgress
	) {
		return new Promise<Response>((resolve, reject) => {
			const request = new XMLHttpRequest();
			request.open(method, url);

			if (headers) {
				const entries =
					headers instanceof Headers
						? headers.entries()
						: Object.entries(headers);
				for (const [key, value] of entries) {
					if (value !== undefined) {
						request.setRequestHeader(
							key,
							Array.isArray(value) ? value.join(",") : value
						);
					}
				}
			}

			request.upload.onprogress = (event) => {
				if (event.lengthComputable) {
					onProgress(event.loaded / event.total);
				}
			};

			request.responseType = "blob";

			request.onerror = () => {
				reject(new Error("Failed to upload file to pre-signed URL"));
			};

			request.onload = () => {
				const response = new Response(request.response, {
					status: request.status,
					statusText: request.statusText,
				});
				if (!response.ok) {
					reject(new Error(`Upload failed with status ${request.status}`));
					return;
				}
				resolve(response);
			};

			request.send(file);
		});
	}

	const response = await fetch(url, {
		method,
		headers,
		body: file,
	});

	if (!response.ok) {
		throw new Error(`Upload failed with status ${response.status}`);
	}

	onProgress?.(1);

	return response;
}

export const AvatarInput =
	/*#__PURE__*/
	forwardRef<HTMLInputElement, AvatarInputProps>(function AvatarInputComponent(
		{
			value,
			onChange,
			description,
			aspectRatio = 1,
			accept = DEFAULT_ACCEPT,
			onUploadStart,
			onUploadComplete,
			onUpload,
			onError,
			presignedUrl,
			uploadHeaders,
			allowRemove = true,
			allowSvgUploads = false,
			uploadLabel,
			placeholder,
			fallbackInitials,
			previewClassName,
			disabled,
			name,
			onBlur,
			id,
			className,
			...rest
		},
		forwardedRef
	) {
		const hiddenInputRef = useRef<HTMLInputElement | null>(null);
		const fileInputRef = useRef<HTMLInputElement | null>(null);
		useImperativeHandle(
			forwardedRef,
			() => hiddenInputRef.current as HTMLInputElement,
			[]
		);

		const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
		const [isUploading, setIsUploading] = useState(false);
		const [cropState, setCropState] = useState<CropState | null>(null);
		const [crop, setCrop] = useState({ x: 0, y: 0 });
		const [zoom, setZoom] = useState(1.2);
		const [croppedArea, setCroppedArea] = useState<Area | null>(null);
		const lastPreviewUrlRef = useRef<string | null>(null);

		const resolvedValue: AvatarInputValue | null = useMemo(() => {
			if (!value) {
				return null;
			}

			if (typeof value === "string") {
				return {
					previewUrl: value,
					url: value,
					mimeType: "",
				};
			}

			return value;
		}, [value]);

		const resolvedPreviewUrl =
			localPreviewUrl ?? resolvedValue?.previewUrl ?? resolvedValue?.url;

		useEffect(() => {
			const previous = lastPreviewUrlRef.current;
			if (previous && previous !== localPreviewUrl) {
				revokeObjectUrlSafely(previous);
			}

			lastPreviewUrlRef.current = localPreviewUrl;

			return () => {
				if (lastPreviewUrlRef.current) {
					revokeObjectUrlSafely(lastPreviewUrlRef.current);
					lastPreviewUrlRef.current = null;
				}
			};
		}, [localPreviewUrl]);

		useEffect(() => {
			const controlledPreviewUrl =
				resolvedValue?.previewUrl ?? resolvedValue?.url ?? null;

			if (!controlledPreviewUrl) {
				setLocalPreviewUrl((previous) => {
					revokeObjectUrlSafely(previous);
					return null;
				});
				return;
			}

			setLocalPreviewUrl((previous) => {
				if (!previous || previous === controlledPreviewUrl) {
					return previous;
				}

				// Keep local blob preview until parent state catches up, then defer to controlled value.
				if (isBlobUrl(previous) || !isBlobUrl(controlledPreviewUrl)) {
					revokeObjectUrlSafely(previous);
					return null;
				}

				return previous;
			});
		}, [resolvedValue?.previewUrl, resolvedValue?.url]);

		const sanitizedAccept = useMemo(() => {
			if (!accept) {
				return;
			}

			if (allowSvgUploads) {
				return accept;
			}

			const filtered = accept
				.split(",")
				.map((entry) => entry.trim())
				.filter((entry) => entry && entry.toLowerCase() !== SVG_MIME_TYPE);

			return filtered.length > 0 ? filtered.join(",") : undefined;
		}, [accept, allowSvgUploads]);

		const emitInputEvents = useCallback(() => {
			const target = hiddenInputRef.current;
			if (!target) {
				return;
			}

			target.dispatchEvent(new Event("input", { bubbles: true }));
			target.dispatchEvent(new Event("change", { bubbles: true }));
		}, []);

		const commitFile = useCallback(
			async (
				file: File,
				{ skipUpload, objectUrlOverride }: CommitFileOptions = {}
			) => {
				const nextPreviewUrl =
					objectUrlOverride ?? (await readFileAsObjectUrl(file));

				setLocalPreviewUrl((previous) => {
					if (previous && previous !== nextPreviewUrl) {
						revokeObjectUrlSafely(previous);
					}
					return nextPreviewUrl;
				});

				const payload: AvatarInputValue = {
					previewUrl: nextPreviewUrl,
					file,
					mimeType: file.type,
					name: file.name,
					size: file.size,
				};

				try {
					const shouldUpload = !skipUpload && (onUpload || presignedUrl);
					const shouldUseOnUpload = Boolean(onUpload) && shouldUpload;
					const shouldUsePresigned =
						Boolean(presignedUrl) && shouldUpload && !shouldUseOnUpload;

					if (shouldUseOnUpload && presignedUrl) {
						console.warn(
							"AvatarInput: presignedUrl is ignored because onUpload is provided."
						);
					}

					if (shouldUseOnUpload || shouldUsePresigned) {
						onUploadStart?.(file);
						setIsUploading(true);
						try {
							if (shouldUseOnUpload && onUpload) {
								const result = await onUpload(file);

								if (typeof result === "string") {
									payload.url = result;
								} else if (result && typeof result === "object") {
									Object.assign(payload, result);
								}
							} else if (shouldUsePresigned && presignedUrl) {
								await uploadToPresignedUrl({
									file,
									url: presignedUrl,
									headers: uploadHeaders,
								});
								payload.url = presignedUrl.split("?")[0] ?? presignedUrl;
							}
						} finally {
							setIsUploading(false);
						}
					}

					onChange?.(payload);
					onUploadComplete?.(payload);
					emitInputEvents();
				} catch (error) {
					const message =
						error instanceof Error
							? error
							: new Error("Unexpected error while uploading avatar");
					onError?.(message);
					setLocalPreviewUrl((previous) => {
						revokeObjectUrlSafely(previous);
						return resolvedValue?.previewUrl ?? resolvedValue?.url ?? null;
					});
					throw message;
				}
			},
			[
				onUploadStart,
				onUpload,
				presignedUrl,
				uploadHeaders,
				onChange,
				onUploadComplete,
				onError,
				resolvedValue?.previewUrl,
				resolvedValue?.url,
				emitInputEvents,
			]
		);

		const handleFileSelection = useCallback(
			async (event: React.ChangeEvent<HTMLInputElement>) => {
				const file = event.target.files?.[0];
				event.target.value = "";

				if (!file) {
					return;
				}

				const mimeType = file.type.toLowerCase();
				const isSvg = mimeType === SVG_MIME_TYPE;

				try {
					if (isSvg && !allowSvgUploads) {
						const error = new Error(
							"SVG uploads are disabled. Enable them explicitly to proceed."
						);
						onError?.(error);
						return;
					}

					if (isSvg) {
						const objectUrl = await readFileAsObjectUrl(file);
						await commitFile(file, { objectUrlOverride: objectUrl });
						return;
					}

					const objectUrl = await readFileAsObjectUrl(file);
					setCropState({
						file,
						objectUrl,
						name: file.name,
					});
					setZoom(1.2);
					setCrop({ x: 0, y: 0 });
				} catch (error) {
					const message =
						error instanceof Error
							? error
							: new Error("Failed to prepare selected image");
					onError?.(message);
				}
			},
			[allowSvgUploads, commitFile, onError]
		);

		const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
			setCroppedArea(croppedAreaPixels);
		}, []);

		const closeCropper = useCallback(() => {
			setCropState((current) => {
				if (current) {
					revokeObjectUrlSafely(current.objectUrl);
				}
				return null;
			});
			setCroppedArea(null);
		}, []);

		const applyCrop = useCallback(async () => {
			if (!(cropState && croppedArea)) {
				closeCropper();
				return;
			}

			try {
				const croppedFile = await cropImage({
					file: cropState.file,
					cropArea: croppedArea,
					source: cropState.objectUrl,
				});
				closeCropper();
				await commitFile(croppedFile);
			} catch (error) {
				closeCropper();
				const message =
					error instanceof Error
						? error
						: new Error("Unable to crop selected image");
				onError?.(message);
			}
		}, [commitFile, cropState, croppedArea, closeCropper, onError]);

		const removeAvatar = useCallback(() => {
			setLocalPreviewUrl((previous) => {
				revokeObjectUrlSafely(previous);
				return null;
			});
			onChange?.(null);
			emitInputEvents();
		}, [emitInputEvents, onChange]);

		const instructionsId = useId();

		const uploadAriaLabel =
			uploadLabel ?? (resolvedPreviewUrl ? "Change image" : "Upload image");

		const openFileDialog = useCallback(() => {
			if (disabled || isUploading) {
				return;
			}

			fileInputRef.current?.click();
		}, [disabled, isUploading]);

		return (
			<div className={cn("flex flex-col gap-3", className)} {...rest}>
				<input
					id={id}
					name={name}
					onBlur={onBlur}
					ref={(node) => {
						hiddenInputRef.current = node;
						if (typeof forwardedRef === "function") {
							forwardedRef(node);
						} else if (forwardedRef) {
							(
								forwardedRef as React.MutableRefObject<HTMLInputElement | null>
							).current = node;
						}
					}}
					type="hidden"
					value={typeof value === "string" ? value : (value?.url ?? "")}
				/>
				<input
					accept={sanitizedAccept}
					className="sr-only"
					disabled={disabled || isUploading}
					onChange={handleFileSelection}
					ref={fileInputRef}
					type="file"
				/>
				<div className="flex flex-col items-start gap-1">
					<div className={cn("relative", previewClassName)}>
						<button
							aria-describedby={instructionsId}
							aria-label={uploadAriaLabel}
							className={cn(
								"relative block size-20 rounded border border-border/50 border-dashed bg-plasma-300 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
								(disabled || isUploading) && "cursor-not-allowed opacity-70",
								!(disabled || isUploading) && "cursor-pointer"
							)}
							disabled={disabled || isUploading}
							onClick={openFileDialog}
							type="button"
						>
							<AvatarContainer className="size-full">
								{resolvedPreviewUrl ? (
									<>
										<AvatarImage
											alt="Avatar preview"
											src={resolvedPreviewUrl}
										/>
										<AvatarFallback className="text-base">
											{fallbackInitials ??
												(resolvedValue?.name ? resolvedValue.name[0] : "")}
										</AvatarFallback>
									</>
								) : (
									<div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
										<ImageIcon aria-hidden="true" className="size-5" />
										<span className="text-xs">Preview</span>
									</div>
								)}
							</AvatarContainer>
							{isUploading && (
								<div className="absolute inset-0 flex items-center justify-center rounded bg-background/70">
									<Spinner className="text-primary" />
								</div>
							)}
						</button>
					</div>
					{allowRemove && (resolvedPreviewUrl || resolvedValue) && (
						<Button
							disabled={disabled || isUploading}
							onClick={removeAvatar}
							size="xs"
							type="button"
							variant="ghost"
						>
							<XIcon aria-hidden="true" className="size-4" />
							Remove
						</Button>
					)}
				</div>
				<Dialog
					onOpenChange={(open) => !open && closeCropper()}
					open={Boolean(cropState)}
				>
					<DialogContent className="sm:max-w-[480px]">
						<DialogHeader>
							<DialogTitle>Crop image</DialogTitle>
							<DialogDescription>
								Adjust the crop to choose the portion you want to keep as your
								avatar.
							</DialogDescription>
						</DialogHeader>
						<div className="mt-2 flex flex-col gap-4">
							<div className="relative aspect-square w-full overflow-hidden rounded bg-muted">
								{cropState && (
									<Cropper
										aspect={aspectRatio}
										crop={crop}
										image={cropState.objectUrl}
										onCropChange={setCrop}
										onCropComplete={onCropComplete}
										onZoomChange={setZoom}
										showGrid={false}
										zoom={zoom}
										zoomSpeed={0.5}
									/>
								)}
							</div>
							<div className="flex items-center gap-3">
								<span className="text-muted-foreground text-xs">Zoom</span>
								<input
									className="w-full"
									max={3}
									min={1}
									onChange={(event) =>
										setZoom(Number.parseFloat(event.target.value))
									}
									step={0.1}
									type="range"
									value={zoom}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button onClick={closeCropper} type="button" variant="ghost">
								Cancel
							</Button>
							<Button onClick={applyCrop} type="button">
								Apply
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		);
	});
