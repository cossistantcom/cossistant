import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Background } from "./background";
import {
	computeBackgroundGridDimensions,
	createAuroraEmitters,
	createPointerTrailPool,
	DEFAULT_BACKGROUND_DESKTOP_FPS,
	DEFAULT_BACKGROUND_POINTER_TRAIL_INTENSITY,
	DEFAULT_BACKGROUND_POINTER_TRAIL_LIFETIME_MS,
	DEFAULT_BACKGROUND_POINTER_TRAIL_RADIUS,
	getPointerTrailBlobState,
	getPointerTrailFade,
	normalizeFieldValue,
	resolveBackgroundConfig,
	shouldAnimateBackground,
	shouldAnimatePointerTrail,
	shouldSpawnPointerTrailBlob,
	shouldUseInteractivePointer,
	writePointerTrailBlob,
} from "./background.shared";

describe("background helpers", () => {
	it("keeps emitter generation deterministic for the same seed", () => {
		const first = createAuroraEmitters(42);
		const second = createAuroraEmitters(42);

		expect(first).toEqual(second);
		expect(first).toHaveLength(4);
	});

	it("clamps normalized field values into the visible density range", () => {
		expect(normalizeFieldValue(-2, 0, 1)).toBe(0);
		expect(normalizeFieldValue(2, 0, 1)).toBe(1);
		expect(normalizeFieldValue(10, 10, 10)).toBe(0.5);
	});

	it("disables animation when the background cannot be seen", () => {
		expect(
			shouldAnimateBackground({
				documentVisible: true,
				isVisible: false,
				prefersReducedMotion: false,
				speed: 1,
			})
		).toBe(false);
		expect(
			shouldAnimateBackground({
				documentVisible: false,
				isVisible: true,
				prefersReducedMotion: false,
				speed: 1,
			})
		).toBe(false);
		expect(
			shouldAnimateBackground({
				documentVisible: true,
				isVisible: true,
				prefersReducedMotion: true,
				speed: 1,
			})
		).toBe(false);
		expect(
			shouldAnimateBackground({
				documentVisible: true,
				isVisible: true,
				prefersReducedMotion: false,
				speed: 1,
			})
		).toBe(true);
	});

	it("resolves adaptive defaults for desktop, mobile, and explicit overrides", () => {
		const desktopConfig = resolveBackgroundConfig({
			accentColorVar: "--cossistant-orange",
			desktopResolution: 0.06,
			fieldOpacity: 0.16,
			interactive: true,
			isMobile: false,
			mobileFps: 8,
			mobileResolution: 0.08,
			reactivity: 0.28,
			reverse: false,
			speed: 1,
			strength: 1.35,
		});
		const mobileConfig = resolveBackgroundConfig({
			accentColorVar: "--cossistant-orange",
			desktopResolution: 0.06,
			fieldOpacity: 0.16,
			interactive: true,
			isMobile: true,
			mobileFps: 8,
			mobileResolution: 0.08,
			reactivity: 0.28,
			reverse: false,
			speed: 1,
			strength: 1.35,
		});
		const overrideConfig = resolveBackgroundConfig({
			accentColorVar: "--test-accent",
			characters: "XO.",
			desktopResolution: 0.06,
			fieldOpacity: 0.24,
			fps: 14,
			interactive: false,
			isMobile: true,
			mobileFps: 8,
			mobileResolution: 0.08,
			reactivity: 0.4,
			resolution: 0.22,
			reverse: true,
			seed: 99,
			speed: 1.8,
			strength: 1.7,
		});

		expect(desktopConfig.asciiResolution).toBe(0.06);
		// Bound to the constant so tuning the desktop frame rate does not silently
		// break this test again.
		expect(desktopConfig.targetFps).toBe(DEFAULT_BACKGROUND_DESKTOP_FPS);
		expect(desktopConfig.pointerTrail).toBe(true);
		expect(desktopConfig.pointerTrailIntensity).toBe(
			DEFAULT_BACKGROUND_POINTER_TRAIL_INTENSITY
		);
		expect(desktopConfig.pointerTrailLifetimeMs).toBe(
			DEFAULT_BACKGROUND_POINTER_TRAIL_LIFETIME_MS
		);
		expect(desktopConfig.pointerTrailRadius).toBe(
			DEFAULT_BACKGROUND_POINTER_TRAIL_RADIUS
		);
		expect(mobileConfig.asciiResolution).toBe(0.08);
		expect(mobileConfig.targetFps).toBe(8);
		expect(overrideConfig.asciiResolution).toBe(0.22);
		expect(overrideConfig.targetFps).toBe(14);
		expect(overrideConfig.characters).toBe("XO.");
		expect(overrideConfig.fieldOpacity).toBe(0.24);
		expect(overrideConfig.interactive).toBe(false);
		expect(overrideConfig.reactivity).toBe(0.4);
		expect(overrideConfig.reverse).toBe(true);
		expect(overrideConfig.speed).toBe(1.8);
		expect(overrideConfig.strength).toBe(1.7);
		expect(overrideConfig.accentColorVar).toBe("--test-accent");
	});

	it("forwards pointer trail tuning into the resolved config", () => {
		const config = resolveBackgroundConfig({
			accentColorVar: "--trail-accent",
			desktopResolution: 0.06,
			fieldOpacity: 0.2,
			interactive: true,
			isMobile: false,
			mobileFps: 8,
			mobileResolution: 0.08,
			pointerTrail: false,
			pointerTrailIntensity: 0.9,
			pointerTrailLifetimeMs: 1250,
			pointerTrailRadius: 0.2,
			reactivity: 0.35,
			reverse: false,
			speed: 1,
			strength: 1.2,
		});

		expect(config.pointerTrail).toBe(false);
		expect(config.pointerTrailIntensity).toBe(0.9);
		expect(config.pointerTrailLifetimeMs).toBe(1250);
		expect(config.pointerTrailRadius).toBe(0.2);
	});

	it("spawns pointer blobs only when distance or time thresholds are met", () => {
		expect(
			shouldSpawnPointerTrailBlob({
				distancePx: 0,
				elapsedMs: 0,
				hasPreviousSpawn: false,
			})
		).toBe(true);
		expect(
			shouldSpawnPointerTrailBlob({
				distancePx: 12,
				elapsedMs: 20,
				hasPreviousSpawn: true,
			})
		).toBe(false);
		expect(
			shouldSpawnPointerTrailBlob({
				distancePx: 30,
				elapsedMs: 20,
				hasPreviousSpawn: true,
			})
		).toBe(true);
		expect(
			shouldSpawnPointerTrailBlob({
				distancePx: 8,
				elapsedMs: 45,
				hasPreviousSpawn: true,
			})
		).toBe(true);
	});

	it("keeps blob fade and drift deterministic at a fixed timestamp", () => {
		expect(
			getPointerTrailFade({
				currentTimeMs: 400,
				lifetimeMs: 900,
				spawnedAtMs: 100,
			})
		).toBe(
			getPointerTrailFade({
				currentTimeMs: 400,
				lifetimeMs: 900,
				spawnedAtMs: 100,
			})
		);

		const blobState = getPointerTrailBlobState({
			currentTimeMs: 450,
			intensity: 0.8,
			lifetimeMs: 900,
			radius: 0.16,
			spawnedAtMs: 100,
			velocityX: 0.05,
			velocityY: -0.02,
			x: 0.4,
			y: 0.6,
		});

		expect(blobState).not.toBeNull();
		expect(blobState?.alpha ?? 0).toBeGreaterThan(0);
		expect(blobState?.radius ?? 0).toBeGreaterThan(0.16);
		expect(blobState?.x ?? 0).toBeGreaterThan(0.4);
		expect(blobState?.y ?? 1).toBeLessThan(0.6);
	});

	it("keeps trail blobs alive a bit longer before they drop off", () => {
		const fade = getPointerTrailFade({
			currentTimeMs: 1000,
			lifetimeMs: 1350,
			spawnedAtMs: 100,
		});

		expect(fade).toBeGreaterThan(0.15);
	});

	it("caps the pointer trail pool at the configured maximum", () => {
		const pool = createPointerTrailPool(2);

		writePointerTrailBlob(pool, {
			intensity: 0.4,
			radius: 0.1,
			spawnedAtMs: 10,
			velocityX: 0.01,
			velocityY: 0,
			x: 0.1,
			y: 0.2,
		});
		writePointerTrailBlob(pool, {
			intensity: 0.5,
			radius: 0.12,
			spawnedAtMs: 20,
			velocityX: 0.02,
			velocityY: 0.01,
			x: 0.2,
			y: 0.3,
		});
		writePointerTrailBlob(pool, {
			intensity: 0.8,
			radius: 0.18,
			spawnedAtMs: 30,
			velocityX: 0.03,
			velocityY: 0.02,
			x: 0.7,
			y: 0.8,
		});

		expect(pool.size).toBe(2);
		expect(pool.nextIndex).toBe(1);
		expect(pool.x[0]).toBeCloseTo(0.7);
		expect(pool.y[0]).toBeCloseTo(0.8);
	});

	it("keeps hover reactivity disabled on coarse pointers", () => {
		expect(
			shouldUseInteractivePointer({
				hasFinePointer: false,
				interactive: true,
			})
		).toBe(false);
		expect(
			shouldUseInteractivePointer({
				hasFinePointer: true,
				interactive: true,
			})
		).toBe(true);
	});

	it("disables live trail animation for reduced motion", () => {
		expect(
			shouldAnimatePointerTrail({
				hasFinePointer: true,
				interactive: true,
				pointerTrail: true,
				prefersReducedMotion: true,
			})
		).toBe(false);
		expect(
			shouldAnimatePointerTrail({
				hasFinePointer: true,
				interactive: true,
				pointerTrail: true,
				prefersReducedMotion: false,
			})
		).toBe(true);
	});

	it("caps field and ascii cell counts for very large backgrounds", () => {
		const grid = computeBackgroundGridDimensions({
			height: 2600,
			resolution: 0.04,
			width: 4800,
		});

		expect(grid).not.toBeNull();
		expect((grid?.fieldCols ?? 0) * (grid?.fieldRows ?? 0)).toBeLessThanOrEqual(
			9000
		);
		expect((grid?.asciiCols ?? 0) * (grid?.asciiRows ?? 0)).toBeLessThanOrEqual(
			20_000
		);
	});
});

describe("Background", () => {
	it("renders layered canvases with no image markup", () => {
		const html = renderToStaticMarkup(
			React.createElement(Background, {
				asciiOpacity: 0.5,
				className: "custom-background",
				fieldOpacity: 0.2,
			})
		);

		expect(html).toContain('data-background="aurora-ascii"');
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain('data-background-layer="field"');
		expect(html).toContain('data-background-layer="ascii"');
		expect(html).not.toContain("<img");
	});
});
