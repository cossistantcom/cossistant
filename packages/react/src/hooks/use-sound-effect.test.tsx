import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { type UseSoundEffectReturn, useSoundEffect } from "./use-sound-effect";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;
let windowInstance: Window | null = null;
let originalFetch: typeof fetch;

const installedGlobalKeys = [
	"window",
	"self",
	"document",
	"navigator",
	"Document",
	"DocumentFragment",
	"Element",
	"Event",
	"EventTarget",
	"HTMLElement",
	"MutationObserver",
	"Node",
	"Text",
	"getComputedStyle",
	"requestAnimationFrame",
	"cancelAnimationFrame",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

class MockSourceNode {
	buffer: unknown = null;
	loop = false;
	playbackRate = { value: 1 };
	onended: (() => void) | null = null;
	connect() {
		return this;
	}
	start() {}
	stop() {}
	disconnect() {}
}

class MockGainNode {
	gain = { value: 1 };
	connect() {
		return this;
	}
}

class MockAudioContext {
	static instances: MockAudioContext[] = [];
	state: "suspended" | "running" | "closed" = "suspended";
	resumeCalls = 0;
	closeCalls = 0;
	destination = {};

	constructor() {
		MockAudioContext.instances.push(this);
	}

	resume() {
		this.resumeCalls += 1;
		this.state = "running";
		return Promise.resolve();
	}

	close() {
		this.closeCalls += 1;
		this.state = "closed";
		return Promise.resolve();
	}

	decodeAudioData(_buffer: ArrayBuffer) {
		return Promise.resolve({} as AudioBuffer);
	}

	createBufferSource() {
		return new MockSourceNode();
	}

	createGain() {
		return new MockGainNode();
	}
}

function setGlobalValue(key: string, value: unknown) {
	Object.defineProperty(globalThis, key, {
		configurable: true,
		value,
		writable: true,
	});
}

function installDomGlobals(window: Window) {
	setGlobalValue("window", window);
	setGlobalValue("self", window);
	setGlobalValue("document", window.document);
	setGlobalValue("navigator", window.navigator);
	setGlobalValue("Document", window.Document);
	setGlobalValue("DocumentFragment", window.DocumentFragment);
	setGlobalValue("Element", window.Element);
	setGlobalValue("Event", window.Event);
	setGlobalValue("EventTarget", window.EventTarget);
	setGlobalValue("HTMLElement", window.HTMLElement);
	setGlobalValue("MutationObserver", window.MutationObserver);
	setGlobalValue("Node", window.Node);
	setGlobalValue("Text", window.Text);
	setGlobalValue("getComputedStyle", window.getComputedStyle.bind(window));
	setGlobalValue("requestAnimationFrame", (callback: FrameRequestCallback) =>
		window.setTimeout(() => callback(Date.now()), 0)
	);
	setGlobalValue("cancelAnimationFrame", (id: number) =>
		window.clearTimeout(id)
	);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

describe("useSoundEffect", () => {
	beforeEach(() => {
		windowInstance = new Window({ url: "https://example.com" });
		installDomGlobals(windowInstance);
		MockAudioContext.instances = [];
		(globalThis.window as unknown as { AudioContext: unknown }).AudioContext =
			MockAudioContext;
		originalFetch = globalThis.fetch;
		setGlobalValue("fetch", () =>
			Promise.resolve({
				ok: true,
				arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
			})
		);
	});

	afterEach(async () => {
		const { act } = await import("react");

		if (activeRoot) {
			await act(async () => {
				activeRoot?.unmount();
			});
		}

		mountNode?.remove();
		activeRoot = null;
		mountNode = null;
		windowInstance = null;
		setGlobalValue("fetch", originalFetch);

		for (const key of installedGlobalKeys) {
			Reflect.deleteProperty(globalThis, key);
		}
	});

	async function renderSound() {
		const { act } = await import("react");
		const { createRoot } = await import("react-dom/client");

		let result: UseSoundEffectReturn | null = null;

		function Harness() {
			result = useSoundEffect("/sounds/notification.wav");
			return null;
		}

		mountNode = document.createElement("div");
		document.body.appendChild(mountNode);
		activeRoot = createRoot(mountNode);

		await act(async () => {
			activeRoot?.render(<Harness />);
		});

		// Let the fetch/decode promises settle
		await act(async () => {
			await Promise.resolve();
		});

		return {
			act,
			getResult: () => {
				if (!result) {
					throw new Error("Hook did not render");
				}
				return result;
			},
		};
	}

	it("resumes a suspended AudioContext before playing", async () => {
		const { act, getResult } = await renderSound();

		expect(getResult().isLoading).toBe(false);
		const [context] = MockAudioContext.instances;
		expect(context?.state).toBe("suspended");

		await act(async () => {
			getResult().play();
		});

		expect(context?.resumeCalls).toBe(1);
		expect(context?.state).toBe("running");
		expect(getResult().isPlaying).toBe(true);
	});

	it("closes the AudioContext on unmount", async () => {
		const { act } = await renderSound();
		const [context] = MockAudioContext.instances;

		await act(async () => {
			activeRoot?.unmount();
		});
		activeRoot = null;

		expect(context?.closeCalls).toBe(1);
		expect(context?.state).toBe("closed");
	});
});
