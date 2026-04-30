/** biome-ignore-all lint/suspicious/noExplicitAny: Ok here :) */
import * as React from "react";

export type RegistryItem = {
	name: string;
	component: React.LazyExoticComponent<React.ComponentType<any>>;
	demoComponent?: React.LazyExoticComponent<React.ComponentType<any>>;
	path: string;
	sourcePath?: string;
	code?: string;
};

export const Index: Record<string, RegistryItem> = {
	support: {
		name: "support",
		component: React.lazy(() => import("@/components/support")),
		demoComponent: React.lazy(
			() => import("@/components/support/demo-landing")
		),
		path: "src/components/support/index.tsx",
	},
	"support-doc": {
		name: "support-doc",
		component: React.lazy(() => import("@/components/support/demo-doc")),
		demoComponent: React.lazy(() => import("@/components/support/demo-doc")),
		path: "src/components/support/demo-doc/index.tsx",
		sourcePath: "src/components/support/examples/default-support.tsx",
	},
	"support-classic-bubble": {
		name: "support-classic-bubble",
		component: React.lazy(
			() => import("@/components/support/demo-classic-bubble")
		),
		demoComponent: React.lazy(
			() => import("@/components/support/demo-classic-bubble")
		),
		path: "src/components/support/demo-classic-bubble/index.tsx",
		sourcePath: "src/components/support/examples/classic-bubble.tsx",
	},
	"support-pill-bubble": {
		name: "support-pill-bubble",
		component: React.lazy(
			() => import("@/components/support/demo-pill-bubble")
		),
		demoComponent: React.lazy(
			() => import("@/components/support/demo-pill-bubble")
		),
		path: "src/components/support/demo-pill-bubble/index.tsx",
		sourcePath: "src/components/support/examples/pill-bubble.tsx",
	},
	"support-custom-home": {
		name: "support-custom-home",
		component: React.lazy(
			() => import("@/components/support/demo-custom-home")
		),
		demoComponent: React.lazy(
			() => import("@/components/support/demo-custom-home")
		),
		path: "src/components/support/demo-custom-home/index.tsx",
		sourcePath: "src/components/support/examples/custom-home.tsx",
	},
	"support-bubble-and-home": {
		name: "support-bubble-and-home",
		component: React.lazy(
			() => import("@/components/support/demo-bubble-and-home")
		),
		demoComponent: React.lazy(
			() => import("@/components/support/demo-bubble-and-home")
		),
		path: "src/components/support/demo-bubble-and-home/index.tsx",
		sourcePath: "src/components/support/examples/bubble-and-home.tsx",
	},
	"support-full-composition": {
		name: "support-full-composition",
		component: React.lazy(
			() => import("@/components/support/demo-full-composition")
		),
		demoComponent: React.lazy(
			() => import("@/components/support/demo-full-composition")
		),
		path: "src/components/support/demo-full-composition/index.tsx",
		sourcePath: "src/components/support/examples/full-composition.tsx",
	},
	"support-responsive-embed": {
		name: "support-responsive-embed",
		component: React.lazy(
			() => import("@/components/support/demo-responsive-embed")
		),
		demoComponent: React.lazy(
			() => import("@/components/support/demo-responsive-embed")
		),
		path: "src/components/support/demo-responsive-embed/index.tsx",
		sourcePath: "src/components/support/examples/responsive-embed.tsx",
	},
	"user-feedback-emoji": {
		name: "user-feedback-emoji",
		component: React.lazy(
			() => import("@/components/user-feedback/demo-emoji")
		),
		demoComponent: React.lazy(
			() => import("@/components/user-feedback/demo-emoji")
		),
		path: "src/components/user-feedback/demo-emoji/index.tsx",
		sourcePath: "src/components/user-feedback/examples/emoji-feedback.tsx",
	},
	"user-feedback-stars": {
		name: "user-feedback-stars",
		component: React.lazy(
			() => import("@/components/user-feedback/demo-stars")
		),
		demoComponent: React.lazy(
			() => import("@/components/user-feedback/demo-stars")
		),
		path: "src/components/user-feedback/demo-stars/index.tsx",
		sourcePath: "src/components/user-feedback/examples/star-feedback.tsx",
	},
};
