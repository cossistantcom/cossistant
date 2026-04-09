import { beforeEach, describe, expect, it, mock } from "bun:test";

type MockStyle = {
	properties: Record<string, string>;
	removeProperty: ReturnType<typeof mock>;
	setProperty: ReturnType<typeof mock>;
};

type MockParent = MockElement | MockShadowRoot;

type MockElement = {
	async?: boolean;
	appendChild: ReturnType<typeof mock>;
	attachShadow: ReturnType<typeof mock>;
	children: Array<MockElement | MockShadowRoot>;
	className: string;
	crossOrigin?: string | null;
	dataset: Record<string, string>;
	getAttribute: ReturnType<typeof mock>;
	href?: string;
	id: string;
	parentNode: MockParent | null;
	rel?: string;
	remove: ReturnType<typeof mock>;
	removeChild: ReturnType<typeof mock>;
	setAttribute: ReturnType<typeof mock>;
	shadowRoot: MockShadowRoot | null;
	src?: string;
	style: MockStyle;
	tagName: string;
};

type MockShadowRoot = {
	appendChild: ReturnType<typeof mock>;
	children: MockElement[];
	host: MockElement;
	nodeType: 11;
	parentNode: null;
	removeChild: ReturnType<typeof mock>;
};

function createMockStyle(): MockStyle {
	const properties: Record<string, string> = {};

	return {
		properties,
		removeProperty: mock((key: string) => {
			delete properties[key];
		}),
		setProperty: mock((key: string, value: string) => {
			properties[key] = value;
		}),
	};
}

function attachChild(parent: MockParent, child: MockElement | MockShadowRoot) {
	child.parentNode = parent as never;
	parent.children.push(child as never);
	return child;
}

function detachChild(parent: MockParent, child: MockElement | MockShadowRoot) {
	const index = parent.children.indexOf(child as never);
	if (index >= 0) {
		parent.children.splice(index, 1);
	}
	child.parentNode = null as never;
	return child;
}

function createMockShadowRoot(host: MockElement): MockShadowRoot {
	const shadowRoot: MockShadowRoot = {
		appendChild: mock((child: MockElement) => attachChild(shadowRoot, child)),
		children: [],
		host,
		nodeType: 11,
		parentNode: null,
		removeChild: mock((child: MockElement) => detachChild(shadowRoot, child)),
	};

	return shadowRoot;
}

function createMockElement(tagName = "div"): MockElement {
	const element: MockElement = {
		appendChild: mock((child: MockElement | MockShadowRoot) =>
			attachChild(element, child)
		),
		attachShadow: mock(() => {
			const shadowRoot = createMockShadowRoot(element);
			element.shadowRoot = shadowRoot;
			return shadowRoot;
		}),
		children: [],
		className: "",
		crossOrigin: null,
		dataset: {},
		getAttribute: mock(() => null),
		href: "",
		id: "",
		parentNode: null,
		rel: "",
		remove: mock(() => {
			element.parentNode?.removeChild(element as never);
		}),
		removeChild: mock((child: MockElement | MockShadowRoot) =>
			detachChild(element, child)
		),
		setAttribute: mock(() => {}),
		shadowRoot: null,
		src: "",
		style: createMockStyle(),
		tagName: tagName.toUpperCase(),
	};

	return element;
}

function createMockController() {
	return {
		destroy: mock(() => {}),
		emit: mock(() => {}),
		getSnapshot: mock(() => null),
		getState: mock(() => null),
		goBack: mock(() => {}),
		goHome: mock(() => {}),
		identify: mock(async () => null),
		navigate: mock(() => {}),
		off: mock(() => {}),
		on: mock(() => () => {}),
		open: mock(() => {}),
		openConversation: mock(() => {}),
		refresh: mock(async () => null),
		replace: mock(() => {}),
		setDefaultMessages: mock(() => {}),
		setQuickOptions: mock(() => {}),
		setUnreadCount: mock(() => {}),
		startConversation: mock(() => {}),
		subscribe: mock(() => () => {}),
		toggle: mock(() => {}),
		updateSupportConfig: mock(() => {}),
		updateVisitorMetadata: mock(async () => null),
		close: mock(() => {}),
	};
}

const renderMock = mock(() => {});
const unmountMock = mock(() => {});
const createRootMock = mock(() => ({
	render: renderMock,
	unmount: unmountMock,
}));
const createSupportControllerMock = mock(() => createMockController());
const createElementMock = mock(
	(
		type: unknown,
		props: Record<string, unknown> | null,
		...children: unknown[]
	) => ({
		type,
		props: {
			...(props ?? {}),
			...(children.length > 0
				? {
						children: children.length <= 1 ? children[0] : children,
					}
				: {}),
		},
	})
);

function SupportProviderMock() {
	return null;
}

function SupportMock() {
	return null;
}

mock.module("react", () => ({
	default: {
		createElement: createElementMock,
	},
}));

mock.module("react-dom/client", () => ({
	createRoot: createRootMock,
}));

mock.module("@cossistant/core/support-controller", () => ({
	createSupportController: createSupportControllerMock,
}));

mock.module("@cossistant/react/support", () => ({
	Support: SupportMock,
}));

mock.module("@cossistant/react/provider", () => ({
	SupportProvider: SupportProviderMock,
}));

const mountSupportWidgetModulePromise = import("./mount-support-widget");

describe("mountSupportWidget", () => {
	let head: MockElement;
	let body: MockElement;
	let rootElement: {
		classList: {
			contains: ReturnType<typeof mock>;
		};
		getAttribute: ReturnType<typeof mock>;
	};

	beforeEach(() => {
		head = createMockElement("head");
		body = createMockElement("body");
		rootElement = {
			classList: {
				contains: mock((value: string) => value === "dark"),
			},
			getAttribute: mock(() => null),
		};

		renderMock.mockClear();
		unmountMock.mockClear();
		createElementMock.mockClear();
		createRootMock.mockClear();
		createSupportControllerMock.mockClear();

		Object.defineProperty(globalThis, "window", {
			value: {
				getComputedStyle: () => ({
					colorScheme: "dark",
				}),
				matchMedia: () => ({
					addEventListener: () => {},
					matches: true,
					removeEventListener: () => {},
				}),
			},
			configurable: true,
		});

		Object.defineProperty(globalThis, "document", {
			value: {
				body,
				createElement: mock((tagName: string) => createMockElement(tagName)),
				documentElement: rootElement,
				head,
				querySelector: mock((selector: string) =>
					selector === "#widget-root" ? body : null
				),
			},
			configurable: true,
		});

		Object.defineProperty(globalThis, "MutationObserver", {
			value: class {
				disconnect = mock(() => {});
				observe = mock(() => {});
			},
			configurable: true,
		});
	});

	it("mounts inside a shadow root, injects widget css, and resolves dark mode from the host document", async () => {
		const { mountSupportWidget } = await mountSupportWidgetModulePromise;
		const widget = mountSupportWidget({
			container: "#widget-root",
			host: {
				id: "cossistant-browser-widget",
				className: "cossistant-host",
			},
			provider: {
				publicKey: "pk_test_browser",
			},
			style: {
				stylesheetUrl: "https://cdn.cossistant.com/widget.css",
			},
			widget: {
				side: "bottom",
			},
		});

		expect(createSupportControllerMock).toHaveBeenCalledTimes(1);
		expect(createRootMock).toHaveBeenCalledTimes(1);

		const mountElement = createRootMock.mock.calls[0]?.[0] as MockElement;
		const hostElement = body.children[0] as MockElement;
		const shadowRoot = hostElement.shadowRoot;

		expect(hostElement.id).toBe("cossistant-browser-widget");
		expect(hostElement.className).toBe("cossistant-host");
		expect(hostElement.dataset.cossistantBrowserWidget).toBe("true");
		expect(shadowRoot).not.toBeNull();
		expect(shadowRoot?.children[0]).toBe(mountElement);
		expect(shadowRoot?.children[1]?.tagName).toBe("LINK");
		expect((shadowRoot?.children[1] as MockElement).href).toBe(
			"https://cdn.cossistant.com/widget.css"
		);

		const tree = renderMock.mock.calls[0]?.[0];
		expect(tree.type).toBe(SupportProviderMock);
		expect(tree.props.controller).toBe(widget.controller);
		expect(tree.props.children.type).toBe(SupportMock);
		expect(tree.props.children.props.theme).toBe("dark");
		expect(tree.props.children.props.side).toBe("bottom");

		widget.destroy();

		expect(unmountMock).toHaveBeenCalledTimes(1);
		expect(widget.controller.destroy).toHaveBeenCalledTimes(1);
		expect(body.removeChild).toHaveBeenCalledWith(hostElement);
	});

	it("applies theme variables and controller-backed config updates", async () => {
		const { mountSupportWidget } = await mountSupportWidgetModulePromise;
		const widget = mountSupportWidget({
			provider: {
				publicKey: "pk_test_browser",
			},
			theme: {
				variables: {
					"--co-theme-primary": "#111111",
				},
			},
		});

		expect(widget.hostElement.style.properties["--co-theme-primary"]).toBe(
			"#111111"
		);

		widget.updateConfig({
			defaultMessages: [
				{
					content: "Hello from browser",
					senderType: "teamMember" as never,
				},
			],
			open: true,
			quickOptions: ["Pricing"],
			size: "larger",
			theme: {
				variables: {
					"--co-theme-primary": "#222222",
					"--co-theme-secondary": "#333333",
				},
			},
			widget: {
				side: "left",
			},
		});

		expect(widget.controller.setDefaultMessages).toHaveBeenCalledTimes(1);
		expect(widget.controller.setQuickOptions).toHaveBeenCalledWith(["Pricing"]);
		expect(widget.controller.updateSupportConfig).toHaveBeenCalledWith({
			size: "larger",
		});
		expect(widget.controller.updateSupportConfig).toHaveBeenCalledWith({
			isOpen: true,
		});
		expect(widget.hostElement.style.properties["--co-theme-primary"]).toBe(
			"#222222"
		);
		expect(widget.hostElement.style.properties["--co-theme-secondary"]).toBe(
			"#333333"
		);

		const rerenderedTree = renderMock.mock.calls.at(-1)?.[0];
		expect(rerenderedTree.props.children.props.side).toBe("left");
	});

	it("reuses an injected controller without taking ownership of its lifecycle", async () => {
		const { mountSupportWidget } = await mountSupportWidgetModulePromise;
		const externalController = createMockController();

		const widget = mountSupportWidget({
			controller: externalController as never,
			provider: {
				publicKey: "pk_test_browser",
			},
		});

		expect(createSupportControllerMock).not.toHaveBeenCalled();
		expect(widget.controller).toBe(externalController);

		widget.destroy();

		expect(unmountMock).toHaveBeenCalledTimes(1);
		expect(externalController.destroy).not.toHaveBeenCalled();
	});

	it("throws when a selector-based container cannot be resolved", async () => {
		const { mountSupportWidget } = await mountSupportWidgetModulePromise;

		expect(() =>
			mountSupportWidget({
				container: "#missing-widget-root",
			})
		).toThrow(
			'mountSupportWidget could not find a container matching "#missing-widget-root"'
		);
	});
});
