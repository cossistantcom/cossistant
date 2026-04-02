import { SupportConfig } from "@plasma/react/support-config";
import { SenderType } from "@plasma/types";
import Link from "next/link";
import { FakeDashboard } from "@/components/landing/fake-dashboard";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import { Logos } from "@/components/ui/logos";
import { TooltipOnHover } from "@/components/ui/tooltip";
import {
	buildOrganizationJsonLd,
	buildSoftwareApplicationJsonLd,
	marketing,
} from "@/lib/metadata";
import { AnimationControls } from "./components/animation-controls";
import { Benefits } from "./components/benefits";
import { BrowserWithBackground } from "./components/browser-with-background";
import PlasmaIs from "./components/plasma-is";
import { FullWidthBorder } from "./components/full-width-border";
import { Install } from "./components/install";
import { PrecisionFlowSection } from "./components/precision-flow-section";

export const metadata = marketing({
	title: "AI agent customer support for your SaaS in under 10 lines of code",
	description:
		"Cossistant is the open-source AI and human support framework for React and Next.js apps, with programmable actions, custom UI, and code-first workflows.",
	path: "/",
	keywords: [
		"React support widget",
		"Next.js support widget",
		"AI support framework",
		"customer support infrastructure",
		"saas customer support",
	],
});

export default function Landing() {
	return (
		<>
			<JsonLdScripts
				data={[
					buildOrganizationJsonLd(),
					buildSoftwareApplicationJsonLd({
						description:
							"Cossistant is the open-source AI and human support framework for React and Next.js apps, with programmable actions and custom UI.",
					}),
				]}
				idPrefix="landing-jsonld"
			/>
			<SupportConfig
				defaultMessages={[
					{
						content: "Hi, liking Cossistant so far? How can I help you today?",
						senderType: SenderType.AI,
					},
				]}
			/>
			<div className="flex flex-col gap-8 pt-32 md:flex-row lg:min-h-screen">
				<div className="flex flex-1 flex-col gap-6">
					<div className="flex flex-col items-start gap-4 px-4 pb-8">
						<p className="font-medium font-mono text-plasma-orange text-xs">
							[AI agent team member that learns from you, not a chatbot]
						</p>
						<h1 className="max-w-4xl text-balance text-left font-f37-stout text-[42px] leading-tight md:text-3xl xl:text-5xl">
							AI Agent Customer Support for Your SaaS in Under 10 Lines of Code
						</h1>
						<div className="mt-6 flex w-full flex-col gap-3 md:max-w-[75%] lg:max-w-full lg:flex-row lg:items-center">
							<Button
								asChild
								className="h-12 border border-transparent font-medium text-md has-[>svg]:px-4 lg:w-[250px]"
							>
								<Link href="/sign-up">Install Cossistant now</Link>
							</Button>
							<Button
								asChild
								className="h-12 justify-between px-4 font-medium text-md"
								variant="ghost"
							>
								<Link href="/docs">Explore the docs</Link>
							</Button>
						</div>
					</div>
					<div className="relative hidden w-full lg:block">
						<FullWidthBorder className="top-0" />
						<BrowserWithBackground containerClassName="w-full">
							<div className="fake-dashboard-container">
								<FakeDashboard />
							</div>
						</BrowserWithBackground>
						<FullWidthBorder className="bottom-0" />
					</div>
					<div className="mt-10 mb-6 flex w-full flex-col-reverse items-center justify-center gap-10 px-6 lg:mt-auto lg:flex-row lg:justify-between lg:px-4">
						<div className="flex items-center gap-2">
							<p className="font-mono text-foreground/60 text-xs">
								Works well with
							</p>
							<TooltipOnHover content="React">
								<Link href="https://react.dev" target="_blank">
									<Logos.react className="size-4" />
								</Link>
							</TooltipOnHover>
							<TooltipOnHover content="Next.js">
								<Link href="https://nextjs.org" target="_blank">
									<Logos.nextjs className="size-4" />
								</Link>
							</TooltipOnHover>
							<TooltipOnHover content="Tailwind">
								<Link href="https://tailwindcss.com" target="_blank">
									<Logos.tailwind className="size-4" />
								</Link>
							</TooltipOnHover>
							<TooltipOnHover content="Shadcn/UI">
								<Link href="https://ui.shadcn.com" target="_blank">
									<Logos.shadcn className="size-4" />
								</Link>
							</TooltipOnHover>
						</div>
						<AnimationControls />
					</div>
				</div>
			</div>
			<PlasmaIs />
			<PrecisionFlowSection />
			<Benefits />
			<Install />
			{/* <Benefits /> */}
		</>
	);
}
