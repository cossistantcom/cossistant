import { afterEach, describe, expect, it } from "bun:test";
import type * as React from "react";
import { Window } from "../../../../apps/web/node_modules/happy-dom";
import { type UseSoundEffectReturn, useSoundEffect } from "./use-sound-effect";

type RootHandle = {
	render(node: React.ReactNode): void;
	unmount(): void;
};

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
	"Node",
	"Text",
	"fetch",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;

let activeRoot: RootHandle | null = null;
let mountNode: HTMLElement | null = null;

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
	setGlobalValue("Node", window.Node);
	setGlobalValue("Text", window.Text);
	setGlobalValue("IS_REACT_ACT_ENVIRONMENT", true);
}

async function mount(node: React.ReactNode) {
	const { act } = await import("react");
	const { createRoot } = await import("react-dom/client");

	mountNode = document.createElement("div");
	document.body.appendChild(mountNode);
	activeRoot = createRoot(mountNode);

	await act(async () => {
		activeRoot?.render(node);
	});
}

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

	for (const key of installedGlobalKeys) {
		Reflect.deleteProperty(globalThis, key);
	}
});

describe("useSoundEffect", () => {
	it("loads on first play and shares one context and decoded buffer", async () => {
		const windowInstance = new Window({ url: "https://example.com" });
		installDomGlobals(windowInstance);

		let contextCount = 0;
		let decodeCount = 0;
		let fetchCount = 0;
		let loaderCount = 0;
		let startCount = 0;

		class MockSource {
			buffer: AudioBuffer | null = null;
			loop = false;
			onended: (() => void) | null = null;
			playbackRate = { value: 1 };

			connect() {}
			disconnect() {}
			start() {
				startCount += 1;
			}
			stop() {
				this.onended?.();
			}
		}

		class MockAudioContext {
			destination = {} as AudioDestinationNode;
			state: AudioContextState = "running";

			constructor() {
				contextCount += 1;
			}

			createBufferSource() {
				return new MockSource() as unknown as AudioBufferSourceNode;
			}

			createGain() {
				return {
					connect() {},
					disconnect() {},
					gain: { value: 1 },
				} as unknown as GainNode;
			}

			decodeAudioData() {
				decodeCount += 1;
				return Promise.resolve({} as AudioBuffer);
			}

			resume() {
				return Promise.resolve();
			}
		}

		Object.defineProperty(windowInstance, "AudioContext", {
			configurable: true,
			value: MockAudioContext,
		});
		setGlobalValue("fetch", async () => {
			fetchCount += 1;
			return {
				arrayBuffer: async () => new ArrayBuffer(8),
				ok: true,
				statusText: "OK",
			};
		});

		const loadSound = async () => {
			loaderCount += 1;
			return "data:audio/mp4;base64,dGVzdA==";
		};
		const hooks: UseSoundEffectReturn[] = [];

		function Harness() {
			hooks[0] = useSoundEffect(loadSound);
			hooks[1] = useSoundEffect(loadSound);
			return null;
		}

		await mount(<Harness />);

		expect(contextCount).toBe(0);
		expect(fetchCount).toBe(0);
		expect(loaderCount).toBe(0);
		expect(hooks.every(({ isLoading }) => !isLoading)).toBe(true);

		const { act } = await import("react");
		await act(async () => {
			hooks[0]?.play();
			hooks[1]?.play();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(contextCount).toBe(1);
		expect(loaderCount).toBe(1);
		expect(fetchCount).toBe(1);
		expect(decodeCount).toBe(1);
		expect(startCount).toBe(2);
		expect(hooks.every(({ isPlaying }) => isPlaying)).toBe(true);
	});
});
