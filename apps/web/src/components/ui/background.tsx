"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { AsciiCharacterPalette } from "./ascii-image";
import {
	clampUnit,
	computeBackgroundGridDimensions,
	createAuroraEmitters,
	createPointerTrailPool,
	DEFAULT_BACKGROUND_DESKTOP_RESOLUTION,
	DEFAULT_BACKGROUND_MOBILE_FPS,
	DEFAULT_BACKGROUND_MOBILE_RESOLUTION,
	DEFAULT_BACKGROUND_POINTER_TRAIL_INTENSITY,
	DEFAULT_BACKGROUND_POINTER_TRAIL_LIFETIME_MS,
	DEFAULT_BACKGROUND_POINTER_TRAIL_RADIUS,
	getPointerTrailBlobState,
	normalizeFieldValue,
	resolveBackgroundConfig,
	shouldAnimateBackground,
	shouldAnimatePointerTrail,
	shouldSpawnPointerTrailBlob,
	shouldUseInteractivePointer,
	writePointerTrailBlob,
} from "./background.shared";

type BackgroundProps = {
	accentColorVar?: string;
	asciiOpacity?: number;
	characterPalette?: AsciiCharacterPalette;
	characters?: string;
	className?: string;
	desktopResolution?: number;
	fieldOpacity?: number;
	fps?: number;
	interactive?: boolean;
	mobileFps?: number;
	mobileResolution?: number;
	pointerTrail?: boolean;
	pointerTrailIntensity?: number;
	pointerTrailLifetimeMs?: number;
	pointerTrailRadius?: number;
	reactivity?: number;
	resolution?: number;
	reverse?: boolean;
	seed?: number;
	speed?: number;
	strength?: number;
};

type RgbaColor = {
	a: number;
	b: number;
	g: number;
	r: number;
};

type RenderPalette = {
	accent: RgbaColor;
	asciiBase: RgbaColor;
	background: RgbaColor;
	neutral: RgbaColor;
};

type ActivePointerTrailBlob = {
	alpha: number;
	radius: number;
	x: number;
	y: number;
};

const FALLBACK_LIGHT_BACKGROUND = "#ffffff";
const FALLBACK_DARK_BACKGROUND = "#171717";
const FALLBACK_LIGHT_FOREGROUND = "#111111";
const FALLBACK_DARK_FOREGROUND = "#f5f5f5";
const FALLBACK_ACCENT = "#f97316";
const MONO_FONT_STACK =
	'"Geist Mono", "SFMono-Regular", "SF Mono", "Fira Code", "Menlo", "Monaco", monospace';
const TAU = Math.PI * 2;

function mixColors(
	first: RgbaColor,
	second: RgbaColor,
	amount: number
): RgbaColor {
	const mixAmount = clampUnit(amount);
	const inverseAmount = 1 - mixAmount;

	return {
		a: first.a * inverseAmount + second.a * mixAmount,
		b: first.b * inverseAmount + second.b * mixAmount,
		g: first.g * inverseAmount + second.g * mixAmount,
		r: first.r * inverseAmount + second.r * mixAmount,
	};
}

function rgbaToCss(color: RgbaColor, alphaMultiplier = 1) {
	return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(
		color.b
	)}, ${clampUnit((color.a / 255) * alphaMultiplier)})`;
}

function getRelativeLuminance(color: RgbaColor) {
	return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

function generateRuntimeSeed() {
	if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
		const values = new Uint32Array(1);
		window.crypto.getRandomValues(values);
		return values[0] ?? 1;
	}

	return Math.floor(Math.random() * 2_147_483_647);
}

function createFallbackColor(cssColor: string): RgbaColor {
	if (cssColor.startsWith("#")) {
		const normalized =
			cssColor.length === 4
				? `#${cssColor[1]}${cssColor[1]}${cssColor[2]}${cssColor[2]}${cssColor[3]}${cssColor[3]}`
				: cssColor;
		const value = Number.parseInt(normalized.slice(1), 16);

		return {
			a: 255,
			b: value & 0xff,
			g: (value >> 8) & 0xff,
			r: (value >> 16) & 0xff,
		};
	}

	return {
		a: 255,
		b: 255,
		g: 255,
		r: 255,
	};
}

function updateCanvasElementSize(
	canvas: HTMLCanvasElement,
	width: number,
	height: number,
	devicePixelRatio: number
) {
	const nextWidth = Math.max(1, Math.floor(width * devicePixelRatio));
	const nextHeight = Math.max(1, Math.floor(height * devicePixelRatio));

	if (canvas.width !== nextWidth) {
		canvas.width = nextWidth;
	}

	if (canvas.height !== nextHeight) {
		canvas.height = nextHeight;
	}

	canvas.style.width = `${width}px`;
	canvas.style.height = `${height}px`;
}

function sampleFieldBilinear({
	values,
	cols,
	rows,
	u,
	v,
}: {
	values: Float32Array;
	cols: number;
	rows: number;
	u: number;
	v: number;
}) {
	if (cols <= 0 || rows <= 0 || values.length === 0) {
		return 0;
	}

	const x = clampUnit(u) * Math.max(cols - 1, 0);
	const y = clampUnit(v) * Math.max(rows - 1, 0);
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(cols - 1, x0 + 1);
	const y1 = Math.min(rows - 1, y0 + 1);
	const tx = x - x0;
	const ty = y - y0;
	const topLeft = values[y0 * cols + x0] ?? 0;
	const topRight = values[y0 * cols + x1] ?? 0;
	const bottomLeft = values[y1 * cols + x0] ?? 0;
	const bottomRight = values[y1 * cols + x1] ?? 0;
	const top = topLeft + (topRight - topLeft) * tx;
	const bottom = bottomLeft + (bottomRight - bottomLeft) * tx;

	return top + (bottom - top) * ty;
}

function createSeedOffsets(seed: number) {
	return {
		ribbonA: ((seed % 431) / 431) * TAU,
		ribbonB: ((seed % 613) / 613) * TAU,
		ribbonC: ((seed % 811) / 811) * TAU,
		waveA: ((seed % 271) / 271) * TAU,
		waveB: ((seed % 347) / 347) * TAU,
		waveC: ((seed % 503) / 503) * TAU,
		waveD: ((seed % 907) / 907) * TAU,
	};
}

function samplePointerTrailInfluence(
	blobs: ActivePointerTrailBlob[],
	u: number,
	v: number
) {
	if (blobs.length === 0) {
		return 0;
	}

	let totalInfluence = 0;
	for (const blob of blobs) {
		const deltaX = u - blob.x;
		const deltaY = v - blob.y;
		const radius = Math.max(0.01, blob.radius);
		const gaussian = Math.exp(
			-((deltaX * deltaX + deltaY * deltaY) / (2 * radius * radius))
		);
		totalInfluence += gaussian * blob.alpha;
	}

	return clampUnit(1 - Math.exp(-totalInfluence * 1.6));
}

export function Background({
	accentColorVar = "--plasma-orange",
	asciiOpacity = 1,
	characterPalette = "detailed",
	characters,
	className = "",
	desktopResolution = DEFAULT_BACKGROUND_DESKTOP_RESOLUTION,
	fieldOpacity = 0.16,
	fps,
	interactive = true,
	mobileFps = DEFAULT_BACKGROUND_MOBILE_FPS,
	mobileResolution = DEFAULT_BACKGROUND_MOBILE_RESOLUTION,
	pointerTrail = true,
	pointerTrailIntensity = DEFAULT_BACKGROUND_POINTER_TRAIL_INTENSITY,
	pointerTrailLifetimeMs = DEFAULT_BACKGROUND_POINTER_TRAIL_LIFETIME_MS,
	pointerTrailRadius = DEFAULT_BACKGROUND_POINTER_TRAIL_RADIUS,
	reactivity = 0.28,
	resolution = 0.15,
	reverse = false,
	seed,
	speed = 1,
	strength = 1.35,
}: BackgroundProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const fieldCanvasRef = useRef<HTMLCanvasElement>(null);
	const asciiCanvasRef = useRef<HTMLCanvasElement>(null);
	const runtimeSeedRef = useRef(seed ?? 0);

	if (typeof seed === "number" && runtimeSeedRef.current !== seed) {
		runtimeSeedRef.current = seed;
	}

	useEffect(() => {
		const container = containerRef.current;
		const fieldCanvas = fieldCanvasRef.current;
		const asciiCanvas = asciiCanvasRef.current;
		if (
			!(container && fieldCanvas && asciiCanvas) ||
			typeof window === "undefined"
		) {
			return;
		}

		if (runtimeSeedRef.current === 0) {
			runtimeSeedRef.current = generateRuntimeSeed();
		}

		let grid = null as ReturnType<typeof computeBackgroundGridDimensions>;
		let fieldValues = new Float32Array(0);
		let fieldImageData: ImageData | null = null;
		let rafId: number | null = null;
		let resizeFrameId: number | null = null;
		let isVisible = false;
		let isDocumentVisible = document.visibilityState !== "hidden";
		let prefersReducedMotion = false;
		let isMobileViewport = false;
		let hasFinePointer = false;
		let width = 0;
		let height = 0;
		let devicePixelRatio = 1;
		let lastFrameAt = 0;
		let lastElapsedMs = 0;
		let startMs = performance.now();
		let pointerActive = false;
		let pointerTargetX = 0.5;
		let pointerTargetY = 0.5;
		let pointerCurrentX = 0.5;
		let pointerCurrentY = 0.5;
		let lastPointerSampleX = 0;
		let lastPointerSampleY = 0;
		let lastPointerSampleMs = 0;
		let hasLastPointerSample = false;
		let lastTrailSpawnX = 0;
		let lastTrailSpawnY = 0;
		let lastTrailSpawnMs = 0;
		let hasLastTrailSpawn = false;
		let resolvedConfig = resolveBackgroundConfig({
			accentColorVar,
			characterPalette,
			characters,
			desktopResolution,
			fieldOpacity,
			fps,
			interactive,
			isMobile: false,
			mobileFps,
			mobileResolution,
			pointerTrail,
			pointerTrailIntensity,
			pointerTrailLifetimeMs,
			pointerTrailRadius,
			reactivity,
			resolution,
			reverse,
			seed: runtimeSeedRef.current,
			speed,
			strength,
		});
		let emitters = createAuroraEmitters(resolvedConfig.seed);
		let seedOffsets = createSeedOffsets(resolvedConfig.seed);
		const pointerTrailPool = createPointerTrailPool();
		let palette: RenderPalette = {
			accent: createFallbackColor(FALLBACK_ACCENT),
			asciiBase: createFallbackColor(FALLBACK_LIGHT_FOREGROUND),
			background: createFallbackColor(FALLBACK_LIGHT_BACKGROUND),
			neutral: createFallbackColor("#d8d8d8"),
		};

		const offscreenCanvas = document.createElement("canvas");
		const offscreenContext = offscreenCanvas.getContext("2d");
		const fieldContext = fieldCanvas.getContext("2d");
		const asciiContext = asciiCanvas.getContext("2d");
		const scratchCanvas = document.createElement("canvas");
		scratchCanvas.width = 1;
		scratchCanvas.height = 1;
		const scratchContext = scratchCanvas.getContext("2d", {
			willReadFrequently: true,
		});

		const readCssColor = (colorValue: string, fallbackValue: string) => {
			const fallbackColor = createFallbackColor(fallbackValue);
			if (!scratchContext) {
				return fallbackColor;
			}

			try {
				scratchContext.clearRect(0, 0, 1, 1);
				scratchContext.fillStyle = colorValue || fallbackValue;
				scratchContext.fillRect(0, 0, 1, 1);
				const data = scratchContext.getImageData(0, 0, 1, 1).data;

				return {
					a: data[3] ?? fallbackColor.a,
					b: data[2] ?? fallbackColor.b,
					g: data[1] ?? fallbackColor.g,
					r: data[0] ?? fallbackColor.r,
				};
			} catch {
				return fallbackColor;
			}
		};

		const updateResolvedConfig = () => {
			resolvedConfig = resolveBackgroundConfig({
				accentColorVar,
				characterPalette,
				characters,
				desktopResolution,
				fieldOpacity,
				fps,
				interactive,
				isMobile: isMobileViewport,
				mobileFps,
				mobileResolution,
				pointerTrail,
				pointerTrailIntensity,
				pointerTrailLifetimeMs,
				pointerTrailRadius,
				reactivity,
				resolution,
				reverse,
				seed: runtimeSeedRef.current,
				speed,
				strength,
			});
			emitters = createAuroraEmitters(resolvedConfig.seed);
			seedOffsets = createSeedOffsets(resolvedConfig.seed);
		};

		const updatePalette = () => {
			const rootStyle = window.getComputedStyle(document.documentElement);
			const defaultBackground = rootStyle
				.getPropertyValue("--background")
				.trim();
			const isDarkFallback =
				document.documentElement.classList.contains("dark") &&
				!defaultBackground;
			const backgroundColor = readCssColor(
				defaultBackground,
				isDarkFallback ? FALLBACK_DARK_BACKGROUND : FALLBACK_LIGHT_BACKGROUND
			);
			const foregroundColor = readCssColor(
				rootStyle.getPropertyValue("--foreground").trim(),
				getRelativeLuminance(backgroundColor) < 0.5
					? FALLBACK_DARK_FOREGROUND
					: FALLBACK_LIGHT_FOREGROUND
			);
			const accentColor = readCssColor(
				rootStyle.getPropertyValue(resolvedConfig.accentColorVar).trim() ||
					rootStyle.getPropertyValue("--plasma-orange").trim(),
				FALLBACK_ACCENT
			);
			const isDarkTheme = getRelativeLuminance(backgroundColor) < 0.5;
			const neutralColor = mixColors(
				backgroundColor,
				foregroundColor,
				isDarkTheme ? 0.2 : 0.08
			);

			palette = {
				accent: accentColor,
				asciiBase: mixColors(
					foregroundColor,
					accentColor,
					isDarkTheme ? 0.14 : 0.1
				),
				background: backgroundColor,
				neutral: neutralColor,
			};
		};

		const allocateBuffers = () => {
			if (!(grid && offscreenContext)) {
				return;
			}

			const fieldCellCount = grid.fieldCols * grid.fieldRows;
			if (fieldValues.length !== fieldCellCount) {
				fieldValues = new Float32Array(fieldCellCount);
			}

			if (
				offscreenCanvas.width !== grid.fieldCols ||
				offscreenCanvas.height !== grid.fieldRows
			) {
				offscreenCanvas.width = grid.fieldCols;
				offscreenCanvas.height = grid.fieldRows;
			}

			fieldImageData = offscreenContext.createImageData(
				grid.fieldCols,
				grid.fieldRows
			);
		};

		const getCurrentElapsedMs = () => performance.now() - startMs;

		const renderFrame = (elapsedMs: number) => {
			if (
				!(
					grid &&
					offscreenContext &&
					fieldContext &&
					asciiContext &&
					fieldImageData
				) ||
				width === 0 ||
				height === 0
			) {
				return;
			}

			const safeTime =
				elapsedMs * 0.000_085 * Math.max(0.25, resolvedConfig.speed);
			const pointerEnabled = shouldUseInteractivePointer({
				hasFinePointer,
				interactive: resolvedConfig.interactive,
			});
			const pointerTrailEnabled = shouldAnimatePointerTrail({
				hasFinePointer,
				interactive: resolvedConfig.interactive,
				pointerTrail: resolvedConfig.pointerTrail,
				prefersReducedMotion,
			});
			const pointerTargetCenterX =
				pointerActive && pointerEnabled ? pointerTargetX : 0.5;
			const pointerTargetCenterY =
				pointerActive && pointerEnabled ? pointerTargetY : 0.5;
			const pointerFollow = pointerActive && pointerEnabled ? 0.085 : 0.028;
			pointerCurrentX +=
				(pointerTargetCenterX - pointerCurrentX) * pointerFollow;
			pointerCurrentY +=
				(pointerTargetCenterY - pointerCurrentY) * pointerFollow;
			const activePointerTrailBlobs: ActivePointerTrailBlob[] = [];

			if (pointerTrailEnabled) {
				for (let index = 0; index < pointerTrailPool.maxBlobs; index += 1) {
					if (pointerTrailPool.active[index] !== 1) {
						continue;
					}

					const blobState = getPointerTrailBlobState({
						currentTimeMs: elapsedMs,
						intensity: pointerTrailPool.intensity[index] ?? 0,
						lifetimeMs: resolvedConfig.pointerTrailLifetimeMs,
						radius:
							pointerTrailPool.radius[index] ??
							resolvedConfig.pointerTrailRadius,
						spawnedAtMs: pointerTrailPool.spawnedAtMs[index] ?? 0,
						velocityX: pointerTrailPool.velocityX[index] ?? 0,
						velocityY: pointerTrailPool.velocityY[index] ?? 0,
						x: pointerTrailPool.x[index] ?? 0.5,
						y: pointerTrailPool.y[index] ?? 0.5,
					});

					if (!blobState) {
						pointerTrailPool.active[index] = 0;
						continue;
					}

					activePointerTrailBlobs.push(blobState);
				}
			}

			let minimumValue = Number.POSITIVE_INFINITY;
			let maximumValue = Number.NEGATIVE_INFINITY;

			for (let y = 0; y < grid.fieldRows; y += 1) {
				const v = grid.fieldRows === 1 ? 0.5 : y / (grid.fieldRows - 1);

				for (let x = 0; x < grid.fieldCols; x += 1) {
					const u = grid.fieldCols === 1 ? 0.5 : x / (grid.fieldCols - 1);
					const firstWarp =
						Math.sin(
							(u * 2.6 + v * 0.8 + safeTime * 0.95 + seedOffsets.waveA) * TAU
						) *
							0.045 +
						Math.cos((v * 3.1 - safeTime * 0.62 + seedOffsets.waveB) * TAU) *
							0.018;
					const secondWarp =
						Math.cos(
							(v * 2.3 - u * 0.65 + safeTime * 0.82 + seedOffsets.waveC) * TAU
						) *
							0.04 +
						Math.sin((u * 3.4 - safeTime * 0.44 + seedOffsets.waveD) * TAU) *
							0.024;

					let sampleU = u + firstWarp;
					let sampleV = v + secondWarp;

					if (pointerEnabled) {
						const pointerDx = sampleU - pointerCurrentX;
						const pointerDy = sampleV - pointerCurrentY;
						const pointerDistance =
							pointerDx * pointerDx + pointerDy * pointerDy;
						const pointerPull =
							Math.exp(-pointerDistance * 18) *
							resolvedConfig.reactivity *
							(pointerActive ? 1 : 0.58);

						sampleU -= pointerDx * pointerPull * 0.24;
						sampleV -= pointerDy * pointerPull * 0.24;
					}

					let combinedField = 0;
					for (const emitter of emitters) {
						const centerX =
							emitter.centerX +
							Math.sin(safeTime * emitter.speed + emitter.phase) *
								emitter.orbitRadiusX;
						const centerY =
							emitter.centerY +
							Math.cos(safeTime * emitter.speed * 0.86 + emitter.phase * 1.17) *
								emitter.orbitRadiusY;
						const deltaX = sampleU - centerX;
						const deltaY = sampleV - centerY;

						combinedField +=
							emitter.weight *
							Math.exp(-(deltaX * deltaX + deltaY * deltaY) / emitter.spread);
					}

					const ribbon =
						0.5 +
						0.5 *
							Math.sin(
								(sampleU * 4.8 +
									sampleV * 1.35 +
									safeTime * 1.08 +
									seedOffsets.ribbonA) *
									TAU
							);
					const veil =
						0.5 +
						0.5 *
							Math.cos(
								(sampleV * 3.7 -
									sampleU * 1.72 -
									safeTime * 0.9 +
									seedOffsets.ribbonB) *
									TAU
							);
					const turbulence =
						0.5 +
						0.5 *
							Math.sin(
								(sampleU + sampleV + safeTime * 0.42 + seedOffsets.ribbonC) *
									TAU
							);
					const finalValue =
						combinedField * (0.72 + ribbon * 0.22) +
						veil * 0.16 +
						turbulence * 0.08;
					const cellIndex = y * grid.fieldCols + x;
					const trailInfluence =
						activePointerTrailBlobs.length > 0
							? samplePointerTrailInfluence(activePointerTrailBlobs, u, v)
							: 0;
					const shapedValue =
						finalValue +
						trailInfluence * resolvedConfig.pointerTrailIntensity * 0.12;
					fieldValues[cellIndex] = shapedValue;
					minimumValue = Math.min(minimumValue, shapedValue);
					maximumValue = Math.max(maximumValue, shapedValue);
				}
			}

			const pixels = fieldImageData.data;
			for (let index = 0; index < fieldValues.length; index += 1) {
				const density = normalizeFieldValue(
					fieldValues[index] ?? 0,
					minimumValue,
					maximumValue
				);
				fieldValues[index] = density;
				const fieldX = index % grid.fieldCols;
				const fieldY = Math.floor(index / grid.fieldCols);
				const trailInfluence =
					activePointerTrailBlobs.length > 0
						? samplePointerTrailInfluence(
								activePointerTrailBlobs,
								grid.fieldCols === 1 ? 0.5 : fieldX / (grid.fieldCols - 1),
								grid.fieldRows === 1 ? 0.5 : fieldY / (grid.fieldRows - 1)
							)
						: 0;

				const neutralMix = 0.04 + density * 0.3;
				const accentMix =
					density ** 1.8 * 0.42 +
					trailInfluence * resolvedConfig.pointerTrailIntensity * 0.14;
				const baseColor = mixColors(
					palette.background,
					palette.neutral,
					neutralMix
				);
				const finalColor = mixColors(baseColor, palette.accent, accentMix);
				const alpha = clampUnit(
					resolvedConfig.fieldOpacity *
						(0.12 + density * 0.88 + trailInfluence * 0.18)
				);
				const pixelOffset = index * 4;

				pixels[pixelOffset] = Math.round(finalColor.r);
				pixels[pixelOffset + 1] = Math.round(finalColor.g);
				pixels[pixelOffset + 2] = Math.round(finalColor.b);
				pixels[pixelOffset + 3] = Math.round(alpha * 255);
			}

			offscreenContext.putImageData(fieldImageData, 0, 0);

			fieldContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
			fieldContext.clearRect(0, 0, width, height);
			fieldContext.imageSmoothingEnabled = true;
			fieldContext.globalAlpha = 1;
			fieldContext.drawImage(offscreenCanvas, 0, 0, width, height);

			asciiContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
			asciiContext.clearRect(0, 0, width, height);
			asciiContext.globalAlpha = clampUnit(asciiOpacity);
			const baseAsciiCssColor = rgbaToCss(palette.asciiBase);
			asciiContext.fillStyle = baseAsciiCssColor;
			asciiContext.textAlign = "center";
			asciiContext.textBaseline = "middle";
			asciiContext.font = `${Math.max(
				6,
				Math.min(grid.asciiCellWidth * 0.96, grid.asciiCellHeight * 0.66)
			)}px ${MONO_FONT_STACK}`;

			const characterCount = resolvedConfig.characters.length;
			if (characterCount === 0) {
				return;
			}

			for (let y = 0; y < grid.asciiRows; y += 1) {
				const sampleY = grid.asciiRows === 1 ? 0.5 : y / (grid.asciiRows - 1);
				const positionY = y * grid.asciiCellHeight + grid.asciiCellHeight * 0.5;

				for (let x = 0; x < grid.asciiCols; x += 1) {
					const sampleX = grid.asciiCols === 1 ? 0.5 : x / (grid.asciiCols - 1);
					const ambientDensity = sampleFieldBilinear({
						values: fieldValues,
						cols: grid.fieldCols,
						rows: grid.fieldRows,
						u: sampleX,
						v: sampleY,
					});
					const trailInfluence =
						activePointerTrailBlobs.length > 0
							? samplePointerTrailInfluence(
									activePointerTrailBlobs,
									sampleX,
									sampleY
								)
							: 0;
					const density = clampUnit(
						ambientDensity +
							trailInfluence *
								(0.62 + resolvedConfig.pointerTrailIntensity * 0.28)
					);
					const contrastedDensity = clampUnit(
						(density - 0.5) *
							(resolvedConfig.strength * (1 + trailInfluence * 1.25)) +
							0.5
					);
					if (
						contrastedDensity < Math.max(0.02, 0.06 - trailInfluence * 0.035)
					) {
						continue;
					}

					const mappedDensity = resolvedConfig.reverse
						? contrastedDensity
						: 1 - contrastedDensity;
					const characterIndex = Math.min(
						characterCount - 1,
						Math.max(0, Math.floor(mappedDensity * characterCount))
					);
					const character = resolvedConfig.characters[characterIndex] ?? " ";
					if (character === " ") {
						continue;
					}

					const positionX = x * grid.asciiCellWidth + grid.asciiCellWidth * 0.5;
					const glyphAlpha = clampUnit(
						0.34 +
							density * 0.58 +
							trailInfluence * resolvedConfig.pointerTrailIntensity * 0.55
					);
					const glyphAccentMix = clampUnit(
						density * 0.12 +
							trailInfluence *
								(0.92 + resolvedConfig.pointerTrailIntensity * 0.18)
					);
					const glyphColor = mixColors(
						palette.asciiBase,
						palette.accent,
						glyphAccentMix
					);
					asciiContext.globalAlpha = clampUnit(asciiOpacity * glyphAlpha);
					asciiContext.fillStyle = rgbaToCss(glyphColor);
					asciiContext.fillText(character, positionX, positionY);
				}
			}

			asciiContext.globalAlpha = 1;
			asciiContext.fillStyle = baseAsciiCssColor;
		};

		const stopLoop = () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
				rafId = null;
			}
		};

		const syncLoop = () => {
			if (!grid || width === 0 || height === 0) {
				stopLoop();
				return;
			}

			if (!isVisible) {
				stopLoop();
				return;
			}

			const animate = shouldAnimateBackground({
				documentVisible: isDocumentVisible,
				isVisible,
				prefersReducedMotion,
				speed: resolvedConfig.speed,
			});
			if (!animate) {
				stopLoop();
				renderFrame(prefersReducedMotion ? 0 : lastElapsedMs);
				return;
			}

			if (rafId !== null) {
				return;
			}

			startMs = performance.now() - lastElapsedMs;
			lastFrameAt = 0;
			const tick = (timestamp: number) => {
				const minimumInterval = 1000 / resolvedConfig.targetFps;
				if (lastFrameAt === 0 || timestamp - lastFrameAt >= minimumInterval) {
					lastFrameAt = timestamp;
					lastElapsedMs = timestamp - startMs;
					renderFrame(lastElapsedMs);
				}

				if (
					shouldAnimateBackground({
						documentVisible: isDocumentVisible,
						isVisible,
						prefersReducedMotion,
						speed: resolvedConfig.speed,
					})
				) {
					rafId = window.requestAnimationFrame(tick);
				} else {
					rafId = null;
				}
			};

			rafId = window.requestAnimationFrame(tick);
		};

		const updateSize = () => {
			const nextRect = container.getBoundingClientRect();
			const nextWidth = Math.max(0, Math.floor(nextRect.width));
			const nextHeight = Math.max(0, Math.floor(nextRect.height));
			width = nextWidth;
			height = nextHeight;
			devicePixelRatio = Math.min(
				2,
				Math.max(1, Math.round(window.devicePixelRatio || 1))
			);
			grid = computeBackgroundGridDimensions({
				height: nextHeight,
				resolution: resolvedConfig.asciiResolution,
				width: nextWidth,
			});

			if (!grid || nextWidth === 0 || nextHeight === 0) {
				stopLoop();
				return;
			}

			updateCanvasElementSize(
				fieldCanvas,
				nextWidth,
				nextHeight,
				devicePixelRatio
			);
			updateCanvasElementSize(
				asciiCanvas,
				nextWidth,
				nextHeight,
				devicePixelRatio
			);
			allocateBuffers();
			if (isVisible) {
				renderFrame(lastElapsedMs);
			}
			syncLoop();
		};

		const scheduleSizeUpdate = () => {
			if (resizeFrameId !== null) {
				window.cancelAnimationFrame(resizeFrameId);
			}

			resizeFrameId = window.requestAnimationFrame(() => {
				resizeFrameId = null;
				updateSize();
			});
		};

		const handleDocumentVisibility = () => {
			isDocumentVisible = document.visibilityState !== "hidden";
			syncLoop();
		};

		const handlePointerEnter = () => {
			pointerActive = shouldUseInteractivePointer({
				hasFinePointer,
				interactive: resolvedConfig.interactive,
			});
			hasLastPointerSample = false;
			hasLastTrailSpawn = false;
		};

		const handlePointerMove = (event: PointerEvent) => {
			const pointerInteractionEnabled = shouldUseInteractivePointer({
				hasFinePointer,
				interactive: resolvedConfig.interactive,
			});
			if (!pointerInteractionEnabled) {
				return;
			}

			const rect = container.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) {
				return;
			}

			pointerActive = true;
			const pointerLocalX = event.clientX - rect.left;
			const pointerLocalY = event.clientY - rect.top;
			pointerTargetX = clampUnit(pointerLocalX / rect.width);
			pointerTargetY = clampUnit(pointerLocalY / rect.height);

			const now = getCurrentElapsedMs();
			const deltaX = hasLastPointerSample
				? pointerLocalX - lastPointerSampleX
				: 0;
			const deltaY = hasLastPointerSample
				? pointerLocalY - lastPointerSampleY
				: 0;
			const deltaTime = hasLastPointerSample
				? Math.max(16, now - lastPointerSampleMs)
				: 16;
			const velocityMagnitude = Math.hypot(deltaX, deltaY);
			const distanceSinceSpawn = hasLastTrailSpawn
				? Math.hypot(
						pointerLocalX - lastTrailSpawnX,
						pointerLocalY - lastTrailSpawnY
					)
				: 0;
			const elapsedSinceSpawn = hasLastTrailSpawn ? now - lastTrailSpawnMs : 0;
			const trailAnimationEnabled = shouldAnimatePointerTrail({
				hasFinePointer,
				interactive: resolvedConfig.interactive,
				pointerTrail: resolvedConfig.pointerTrail,
				prefersReducedMotion,
			});

			if (
				trailAnimationEnabled &&
				shouldSpawnPointerTrailBlob({
					distancePx: distanceSinceSpawn,
					elapsedMs: elapsedSinceSpawn,
					hasPreviousSpawn: hasLastTrailSpawn,
				})
			) {
				const speedFactor = clampUnit(velocityMagnitude / (deltaTime * 1.75));
				const normalizedVelocityX =
					rect.width > 0
						? (deltaX / rect.width) *
							(16 / deltaTime) *
							(0.42 + speedFactor * 0.64)
						: 0;
				const normalizedVelocityY =
					rect.height > 0
						? (deltaY / rect.height) *
							(16 / deltaTime) *
							(0.42 + speedFactor * 0.64)
						: 0;

				writePointerTrailBlob(pointerTrailPool, {
					intensity:
						resolvedConfig.pointerTrailIntensity * (0.78 + speedFactor * 0.22),
					radius:
						resolvedConfig.pointerTrailRadius * (0.92 + speedFactor * 0.16),
					spawnedAtMs: now,
					velocityX: normalizedVelocityX,
					velocityY: normalizedVelocityY,
					x: pointerTargetX,
					y: pointerTargetY,
				});
				lastTrailSpawnX = pointerLocalX;
				lastTrailSpawnY = pointerLocalY;
				lastTrailSpawnMs = now;
				hasLastTrailSpawn = true;
			}

			lastPointerSampleX = pointerLocalX;
			lastPointerSampleY = pointerLocalY;
			lastPointerSampleMs = now;
			hasLastPointerSample = true;

			if (rafId === null && width > 0 && height > 0) {
				lastElapsedMs = now;
				renderFrame(lastElapsedMs);
			}
		};

		const handlePointerLeave = () => {
			pointerActive = false;
			hasLastPointerSample = false;
			hasLastTrailSpawn = false;
		};

		const mobileQuery = window.matchMedia("(max-width: 767px)");
		const reducedMotionQuery = window.matchMedia(
			"(prefers-reduced-motion: reduce)"
		);
		const finePointerQuery = window.matchMedia(
			"(hover: hover) and (pointer: fine)"
		);

		const handleMediaChange = () => {
			isMobileViewport = mobileQuery.matches;
			prefersReducedMotion = reducedMotionQuery.matches;
			hasFinePointer = finePointerQuery.matches;
			if (!shouldUseInteractivePointer({ hasFinePointer, interactive })) {
				pointerActive = false;
				hasLastPointerSample = false;
				hasLastTrailSpawn = false;
			}
			updateResolvedConfig();
			updatePalette();
			updateSize();
		};

		handleMediaChange();

		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			resizeObserver = new ResizeObserver(scheduleSizeUpdate);
			resizeObserver.observe(container);
		} else {
			window.addEventListener("resize", scheduleSizeUpdate);
		}

		let intersectionObserver: IntersectionObserver | null = null;
		if (typeof IntersectionObserver !== "undefined") {
			intersectionObserver = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.target === container) {
							isVisible = entry.isIntersecting;
						}
					}

					syncLoop();
				},
				{ threshold: 0.05 }
			);
			intersectionObserver.observe(container);
		} else {
			isVisible = true;
			syncLoop();
		}

		const rootObserver = new MutationObserver(() => {
			updatePalette();
			if (isVisible) {
				renderFrame(lastElapsedMs);
			}
		});
		rootObserver.observe(document.documentElement, {
			attributeFilter: ["class", "style"],
			attributes: true,
		});

		mobileQuery.addEventListener("change", handleMediaChange);
		reducedMotionQuery.addEventListener("change", handleMediaChange);
		finePointerQuery.addEventListener("change", handleMediaChange);

		container.addEventListener("pointerenter", handlePointerEnter);
		container.addEventListener("pointermove", handlePointerMove, {
			passive: true,
		});
		container.addEventListener("pointerleave", handlePointerLeave);
		document.addEventListener("visibilitychange", handleDocumentVisibility);

		updateSize();
		syncLoop();

		return () => {
			stopLoop();

			if (resizeFrameId !== null) {
				window.cancelAnimationFrame(resizeFrameId);
			}

			if (resizeObserver) {
				resizeObserver.disconnect();
			} else {
				window.removeEventListener("resize", scheduleSizeUpdate);
			}

			intersectionObserver?.disconnect();
			rootObserver.disconnect();
			container.removeEventListener("pointerenter", handlePointerEnter);
			container.removeEventListener("pointermove", handlePointerMove);
			container.removeEventListener("pointerleave", handlePointerLeave);
			document.removeEventListener(
				"visibilitychange",
				handleDocumentVisibility
			);

			mobileQuery.removeEventListener("change", handleMediaChange);
			reducedMotionQuery.removeEventListener("change", handleMediaChange);
			finePointerQuery.removeEventListener("change", handleMediaChange);
		};
	}, [
		accentColorVar,
		asciiOpacity,
		characterPalette,
		characters,
		desktopResolution,
		fieldOpacity,
		fps,
		interactive,
		mobileFps,
		mobileResolution,
		pointerTrail,
		pointerTrailIntensity,
		pointerTrailLifetimeMs,
		pointerTrailRadius,
		reactivity,
		resolution,
		reverse,
		seed,
		speed,
		strength,
	]);

	return (
		<div
			aria-hidden="true"
			className={cn("absolute inset-0 z-0 overflow-hidden", className)}
			data-background="aurora-ascii"
			ref={containerRef}
		>
			<canvas
				className="pointer-events-none absolute inset-0 size-full"
				data-background-layer="field"
				ref={fieldCanvasRef}
			/>
			<canvas
				className="pointer-events-none absolute inset-0 size-full"
				data-background-layer="ascii"
				ref={asciiCanvasRef}
			/>
		</div>
	);
}
