import { describe, expect, it } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
	getScreenshotFrameWidthClassName,
	getScreenshotMediaStyle,
	ScreenshotFrame,
} from "./screenshot-frame";

function renderScreenshotFrame(
	props: Partial<React.ComponentProps<typeof ScreenshotFrame>> = {}
) {
	return renderToStaticMarkup(
		<ScreenshotFrame
			items={[
				{
					alt: "Inbox overview",
					browserUrl: "https://docs.plasma-pandora.com/inbox",
					legend: "Inbox",
					src: "https://cdn.plasma-pandora.com/landing/main-large.jpg",
				},
			]}
			type="browser"
			{...props}
		/>
	);
}

describe("ScreenshotFrame", () => {
	it("computes crop styles from slide presets and ratios", () => {
		const style = getScreenshotMediaStyle({
			alt: "Widget close-up",
			position: "bottom",
			src: "/widget.png",
			xOffsetRatio: 0.4,
			yOffsetRatio: -0.5,
			zoomLevel: 1.35,
		});

		expect(style.objectPosition).toBe("70% 75%");
		expect(style.transform).toBe("scale(1.35)");
		expect(style.transformOrigin).toBe("center");
	});

	it("breaks out on 2xl by default and stays strict when requested", () => {
		expect(getScreenshotFrameWidthClassName()).toContain(
			"2xl:w-[min(calc(100%+360px),calc(100vw-2rem))]"
		);
		expect(getScreenshotFrameWidthClassName(true)).toBe("w-full");
	});

	it("renders the browser variant with configured background layers and legends", () => {
		const html = renderScreenshotFrame({
			backgroundColor: "#e7e4de",
			backgroundImageSrc:
				"https://cdn.plasma-pandora.com/landing/secondary-large.jpg",
			items: [
				{
					alt: "Inbox overview",
					browserUrl: "https://docs.plasma-pandora.com/inbox",
					legend: "Inbox",
					src: "https://cdn.plasma-pandora.com/landing/main-large.jpg",
				},
				{
					alt: "Assignment screen",
					browserUrl: "https://docs.plasma-pandora.com/assignments",
					legend: "Assignments",
					position: "bottom",
					src: "https://cdn.plasma-pandora.com/landing/main-medium.jpg",
				},
			],
		});

		expect(html).toContain('data-slot="screenshot-frame"');
		expect(html).toContain('data-slot="screenshot-frame-stage"');
		expect(html).toContain("aspect-[16/10]");
		expect(html).toContain('data-breakout="true"');
		expect(html).toContain("background-color:#e7e4de");
		expect(html).toContain(
			"background-image:url(&quot;https://cdn.plasma-pandora.com/landing/secondary-large.jpg&quot;)"
		);
		expect(html).toContain("https://docs.plasma-pandora.com/inbox");
		expect(html).toContain("Inbox");
		expect(html).toContain("Assignments");
		expect(html).toContain('data-slot="screenshot-frame-navigation"');
		expect(html).toContain('data-has-legends="true"');
	});

	it("renders dot navigation when no legends are provided", () => {
		const html = renderScreenshotFrame({
			items: [
				{
					alt: "Inbox overview",
					src: "https://cdn.plasma-pandora.com/landing/main-large.jpg",
				},
				{
					alt: "Conversation view",
					src: "https://cdn.plasma-pandora.com/landing/main-medium.jpg",
				},
			],
		});

		expect(html).toContain('data-has-legends="false"');
		expect(html).not.toContain(">Inbox<");
		expect(html).not.toContain(">Conversation view<");
	});

	it("renders the widget shell in strict container mode", () => {
		const html = renderScreenshotFrame({
			items: [
				{
					alt: "Support widget home",
					position: "bottom",
					src: "https://cdn.plasma-pandora.com/landing/secondary-large.jpg",
					xOffsetRatio: -0.2,
					zoomLevel: 1.1,
				},
			],
			strictContainerWidth: true,
			type: "widget",
		});

		expect(html).toContain('data-type="widget"');
		expect(html).toContain('data-breakout="false"');
		expect(html).toContain('data-slot="screenshot-frame-stage"');
		expect(html).toContain('data-slot="widget-shell"');
		expect(html).toContain('data-slot="screenshot-frame-widget-slide"');
		expect(html).toContain('data-slot="screenshot-frame-widget-viewport"');
		expect(html).not.toContain('data-slot="screenshot-frame-navigation"');
	});

	it("allows a slide to override the frame-level type", () => {
		const html = renderScreenshotFrame({
			items: [
				{
					alt: "Support widget home",
					src: "https://cdn.plasma-pandora.com/landing/secondary-large.jpg",
					type: "widget",
				},
			],
			type: "browser",
		});

		expect(html).toContain('data-type="widget"');
		expect(html).toContain('data-slot="screenshot-frame-stage"');
		expect(html).toContain('data-slot="widget-shell"');
	});

	it("keeps the shared stage wrapper for mixed browser and widget galleries", () => {
		const html = renderScreenshotFrame({
			items: [
				{
					alt: "Dashboard overview",
					src: "https://cdn.plasma-pandora.com/landing/main-large.jpg",
					type: "browser",
				},
				{
					alt: "Support widget home",
					src: "https://cdn.plasma-pandora.com/landing/secondary-large.jpg",
					type: "widget",
				},
			],
			type: "browser",
		});

		expect(html).toContain('data-slot="screenshot-frame-stage"');
		expect(html).toContain("aspect-[16/10]");
		expect(html).toContain('data-slot="screenshot-frame-browser-slide"');
	});

	it("renders a placeholder when a slide has an empty src", () => {
		const html = renderScreenshotFrame({
			items: [
				{
					alt: "",
					src: "",
				},
			],
		});

		expect(html).toContain('data-slot="screenshot-frame-media-placeholder"');
		expect(html).toContain("Replace screenshot");
	});
});
