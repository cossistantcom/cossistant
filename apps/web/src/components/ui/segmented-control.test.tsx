import { describe, expect, it } from "bun:test";
import React, { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SegmentedControl } from "./segmented-control";

function getButtonMarkup(html: string, label: string) {
	const match = html.match(new RegExp(`<button[^>]*>${label}</button>`));

	if (!match) {
		throw new Error(`Button "${label}" not found`);
	}

	return match[0];
}

function renderControl(
	props: Partial<ComponentProps<typeof SegmentedControl>> = {}
) {
	return renderToStaticMarkup(
		<SegmentedControl
			aria-label="Example segmented control"
			onValueChange={() => {}}
			options={[
				{ value: "one", label: "One" },
				{ value: "two", label: "Two" },
				{ value: "three", label: "Three" },
			]}
			value="one"
			{...props}
		/>
	);
}

describe("SegmentedControl", () => {
	it("renders an active indicator for the selected option", () => {
		const html = renderControl({ value: "two" });

		expect(html).toContain('data-slot="segmented-control"');
		expect(html).toContain('data-slot="segmented-control-indicator"');
		expect(html).toContain("left:calc(1 * (100% / 3) - 1px)");
		expect(html).toContain("top:-2px");
		expect(html).toContain("bottom:-2px");
		expect(html).toContain("width:calc(100% / 3 + 4px)");
		expect(html).toContain("rounded-[2px]");
		expect(html).toContain("bg-background-100");
		expect(html).toContain("");
		expect(html).toContain("overflow-visible");
		expect(html).toContain("bg-background");
		expect(html).toContain('data-state="on"');
	});

	it("supports the small size variant", () => {
		const html = renderControl({ size: "sm" });

		expect(html).toContain("h-7");
		expect(html).toContain("px-2.5 text-xs");
	});

	it("disables item interaction when an option is disabled", () => {
		const html = renderControl({
			options: [
				{ value: "one", label: "One" },
				{ value: "two", label: "Two", disabled: true },
			],
		});

		expect(html).toContain(">Two<");
		expect(html).toContain('data-disabled=""');
		expect(html).toContain("disabled");
	});

	it("keeps default options on the neutral color scheme", () => {
		const html = renderControl({
			options: [
				{ value: "one", label: "One" },
				{ value: "two", label: "Two", colorVariant: "private" },
			],
			value: "one",
		});

		expect(html).not.toContain("bg-plasma-yellow-100");
		expect(getButtonMarkup(html, "One")).toContain('data-state="on"');
		expect(getButtonMarkup(html, "One")).not.toContain(
			"text-plasma-yellow-600"
		);
	});

	it("uses the private accent when a private option is selected", () => {
		const html = renderControl({
			options: [
				{ value: "one", label: "One" },
				{ value: "two", label: "Two", colorVariant: "private" },
			],
			value: "two",
		});

		expect(html).toContain("bg-background-100");
		expect(html).toContain("bg-plasma-yellow-100");
		expect(html).toContain("border-plasma-yellow-600/25");
		expect(html).toContain("dark:bg-plasma-yellow-100/25");
		expect(getButtonMarkup(html, "Two")).toContain('data-state="on"');
		expect(getButtonMarkup(html, "Two")).toContain(
			"data-[state=on]:text-plasma-yellow-600"
		);
	});

	it("supports per-option hover tooltips without changing toggle item rendering", () => {
		const html = renderControl({
			options: [
				{
					value: "one",
					label: "One",
					tooltipOnHover: { content: "First option tooltip" },
				},
				{
					value: "two",
					label: "Two",
					colorVariant: "private",
					tooltipOnHover: {
						content: "Second option tooltip",
						shortcuts: ["N"],
					},
				},
			],
		});

		expect(html.match(/data-slot="segmented-control-item"/g)?.length).toBe(2);
		expect(getButtonMarkup(html, "One")).toContain('data-state="on"');
		expect(getButtonMarkup(html, "One")).toContain('aria-checked="true"');
		expect(getButtonMarkup(html, "Two")).toContain('data-state="off"');
		expect(getButtonMarkup(html, "Two")).toContain('aria-checked="false"');
	});
});
