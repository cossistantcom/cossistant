import { describe, expect, it, mock } from "bun:test";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const supportModes: string[] = [];
const supportContentClasses: string[] = [];
const supportButtonHandlers: Array<() => void> = [];
let isSupportOverlayOpen = false;

mock.module("@cossistant/next/support", () => {
	function Support({
		mode,
		slotProps,
		slots,
	}: {
		mode: string;
		slotProps?: {
			content?: {
				className?: string;
			};
		};
		slots?: {
			header?: React.ComponentType<{
				children?: React.ReactNode;
				page?: string;
			}>;
		};
	}) {
		supportModes.push(mode);
		supportContentClasses.push(slotProps?.content?.className ?? "");
		const Header = slots?.header;

		return (
			<div data-support-mode={mode}>
				{Header ? <Header page="HOME">Support header</Header> : null}
				Support widget
			</div>
		);
	}

	function Button({
		children,
		onClick,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
		if (onClick) {
			supportButtonHandlers.push(() => {
				onClick({} as never);
			});
		}

		return (
			<button {...props} type={props.type ?? "button"}>
				{children}
			</button>
		);
	}

	return {
		Button,
		Support,
		useSupportNavigation: () => ({
			navigate: () => {},
		}),
	};
});

mock.module("@/hooks/use-support-overlay-state", () => ({
	useSupportOverlayState: () => ({
		isOpen: isSupportOverlayOpen,
	}),
}));

mock.module("@/components/ui/icons", () => ({
	__esModule: true,
	default: ({ name }: { name: string }) => <span data-slot={`icon-${name}`} />,
}));

function resetState() {
	supportModes.length = 0;
	supportContentClasses.length = 0;
	supportButtonHandlers.length = 0;
	isSupportOverlayOpen = false;
}

async function renderSupportOverlay() {
	const { SupportOverlay } = await import(`./support-overlay?${Math.random()}`);
	return renderToStaticMarkup(<SupportOverlay />);
}

describe("SupportOverlay", () => {
	it("renders nothing when closed", async () => {
		resetState();

		const html = await renderSupportOverlay();

		expect(html).toBe("");
	});

	it("renders the support component in responsive mode when open", async () => {
		resetState();
		isSupportOverlayOpen = true;

		const html = await renderSupportOverlay();

		expect(html).toContain('data-slot="support-overlay"');
		expect(html).toContain('data-slot="support-overlay-panel"');
		expect(html).toContain("Support widget");
		expect(supportModes).toEqual(["responsive"]);
		expect(supportContentClasses).toEqual(["border-0 shadow-none"]);
	});

	it("does not render the internal support close button", async () => {
		resetState();
		isSupportOverlayOpen = true;

		const html = await renderSupportOverlay();

		expect(html).not.toContain("Close support");
		expect(supportButtonHandlers).toEqual([]);
	});
});
