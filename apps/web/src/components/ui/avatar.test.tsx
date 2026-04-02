import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("./tooltip", () => ({
	TooltipOnHover: ({
		children,
		content,
	}: {
		children: React.ReactNode;
		content?: React.ReactNode;
	}) => (
		<div data-slot="mock-tooltip" data-tooltip-content={String(content ?? "")}>
			{children}
		</div>
	),
}));

const modulePromise = import("./avatar");

describe("Avatar facehash wrapper", () => {
	it("pins the fallback foreground to black", async () => {
		const { Facehash } = await modulePromise;
		const html = renderToStaticMarkup(
			<Facehash className="text-white dark:text-white" name="agent-47" />
		);

		expect(html).toContain("color:#000000");
		expect(html).toContain("display:block;overflow:visible;color:inherit");
	});

	it("uses a fit-content wrapper and supports overriding tooltip content", async () => {
		const { Avatar } = await modulePromise;
		const html = renderToStaticMarkup(
			<Avatar
				fallbackName="Gorgeous Wolf"
				lastOnlineAt="2026-03-10T11:00:00.000Z"
				tooltipContent="Click to get more details"
				url={null}
			/>
		);

		expect(html).toContain('data-slot="avatar-wrapper"');
		expect(html).toContain("inline-flex w-fit");
		expect(html).toContain("Click to get more details");
	});

	it("renders an explicit online status in server markup", async () => {
		const { Avatar } = await modulePromise;
		const html = renderToStaticMarkup(
			<Avatar
				fallbackName="Gorgeous Wolf"
				lastOnlineAt="2026-03-10T11:00:00.000Z"
				status="online"
				url={null}
			/>
		);

		expect(html).toContain('data-slot="avatar-presence"');
		expect(html).toContain("bg-plasma-green");
		expect(html).toContain("Gorgeous Wolf is online");
	});

	it("renders an explicit away status in server markup", async () => {
		const { Avatar } = await modulePromise;
		const html = renderToStaticMarkup(
			<Avatar
				fallbackName="Gorgeous Wolf"
				lastOnlineAt="2026-03-10T11:00:00.000Z"
				status="away"
				url={null}
			/>
		);

		expect(html).toContain('data-slot="avatar-presence"');
		expect(html).toContain("bg-plasma-orange");
		expect(html).toContain("Gorgeous Wolf last seen less than 30 minutes ago");
	});

	it("avoids inferring presence in server markup when only lastOnlineAt is provided", async () => {
		const { Avatar } = await modulePromise;
		const html = renderToStaticMarkup(
			<Avatar
				fallbackName="Gorgeous Wolf"
				lastOnlineAt="2026-03-10T11:00:00.000Z"
				url={null}
			/>
		);

		expect(html).not.toContain('data-slot="avatar-presence"');
		expect(html).toContain('data-tooltip-content=""');
	});

	it("supports disabling tooltip content entirely", async () => {
		const { Avatar } = await modulePromise;
		const html = renderToStaticMarkup(
			<Avatar
				fallbackName="Gorgeous Wolf"
				lastOnlineAt="2026-03-10T11:00:00.000Z"
				tooltipContent={null}
				url={null}
			/>
		);

		expect(html).toContain('data-slot="mock-tooltip"');
		expect(html).toContain('data-tooltip-content=""');
	});
});
