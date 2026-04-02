import { cn } from "@/lib/utils";
import { FullWidthBorder } from "../full-width-border";
import { PromptToneGraphic } from "./prompt-tone";
import { SelfLearningGraphic } from "./self-learning";
import { CustomToolsGraphic } from "./tools";

export const HEADLINE = (
	<>
		Wake up to zero support tickets, your custom
		<br />
		AI agent keeps your users happy while you sleep.
	</>
);

const benefits = [
	//   {
	//     children: HumanAiGraphic,
	//     className: "lg:col-span-3",
	//     title: (
	//       <>
	//         <span className="group/title text-plasma-green">Human + AI</span>{" "}
	//         support
	//       </>
	//     ),
	//     description:
	//       "AI agents don’t just spit answers, they join the conversation like a teammate, talking naturally and handing off smoothly when a human needs to step in.",
	//   },
	//   {
	//     children: AiAgentsGraphic,
	//     className: "lg:col-span-3",
	//     title: (
	//       <>
	//         24/7 autonomous <span className="text-plasma-green">AI agents</span>
	//       </>
	//     ),
	//     description:
	//       "Agents handle questions around the clock across time zones, cutting response times to seconds without needing extra staff.",
	//   },
	//   {
	//     children: ContextGraphic,
	//     className: "lg:col-span-3",
	//     title: (
	//       <>
	//         <span className="text-plasma-green">Context-aware</span> replies
	//       </>
	//     ),
	//     description:
	//       "Agents read app logs, errors, user actions, past conversations and knowledge base to deliver precise answers—no generic chatbot fluff.",
	//   },
	{
		children: SelfLearningGraphic,
		className: "lg:col-span-2",
		title: <>Self-learning knowledge base</>,
		description:
			"Cossistant crawls your docs, resources and conversations to auto-build FAQs, improving agents answers as your product and support evolves.",
	},
	{
		children: CustomToolsGraphic,
		className: "lg:col-span-2",
		title: <>Default & Custom tools</>,
		description:
			"Out-of-the-box support for tools like Linear to log tickets, Stripe to check subscriptions, and Cal.com to book calls, plus the freedom to wire up your own APIs for truly custom actions.",
	},
	{
		children: PromptToneGraphic,
		className: "lg:col-span-2",
		title: <>Control prompt & skills</>,
		description:
			"Set the model, prompt, personality and skills of your agent. Make it formal, funny, or straight to the point — you’re in charge.",
	},
] as const;

export const Benefits = () => (
	<section className="relative mb-0 grid gap-6 pt-12 md:gap-12">
		<FullWidthBorder className="top-0" />
		<div className="flex flex-col gap-2 px-4">
			<p className="font-medium font-mono text-plasma-orange text-sm">
				[Support your customers faster with your own AI agent]
			</p>
			<h2 className="w-full max-w-4xl text-pretty font-f37-stout text-4xl sm:text-3xl md:text-balance md:text-4xl">
				{HEADLINE}
			</h2>
		</div>
		<div className="relative isolate grid gap-0 border-dashed lg:grid-cols-6">
			<FullWidthBorder className="top-0" />
			{benefits.map((benefit, index) => (
				<div
					className={cn(
						"relative flex flex-col gap-2 overflow-hidden border-b border-dashed p-4 pt-20 last:border-b-0 sm:p-8 sm:pt-16 lg:border-b-0",
						benefit.className,
						index < benefits.length - 1 && "lg:border-r"
					)}
					key={benefit.description}
				>
					<div className="relative z-10 h-64 w-full">
						{benefit.children && <benefit.children />}
					</div>
					<h3 className="z-10 mt-4 font-semibold text-md">{benefit.title}</h3>
					<p className="w-full max-w-lg text-balance text-muted-foreground">
						{benefit.description}
					</p>
				</div>
			))}
		</div>
	</section>
);
