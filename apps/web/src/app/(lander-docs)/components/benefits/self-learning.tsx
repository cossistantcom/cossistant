import Icon from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const defaultCards = [
	{
		icon: <Icon className="size-4" name="check" />,
		title: "SSO Configuration",
		description:
			"Configure Single Sign-On with popular identity providers like Google and Microsoft",
		date: "Updated 2 hours ago",
		className: "[grid-area:stack] hover:-translate-y-10",
	},
	{
		icon: <Icon className="size-4" name="command" />,
		title: "API Integration Setup",
		description:
			"Complete tutorial for connecting your app with our REST API and webhooks",
		date: "Updated 1 day ago",
		className:
			"[grid-area:stack] translate-x-12 translate-y-10 hover:-translate-y-1",
	},
	{
		icon: <Icon className="size-4" name="star" />,
		title: "How to upgrade my plan?",
		description:
			"Step-by-step guide to upgrade your subscription and access premium features",
		date: "Auto-updated 3 days ago by AI",
		className:
			"[grid-area:stack] translate-x-24 translate-y-20 hover:translate-y-10",
	},
];

export const SelfLearningGraphic = () => (
	<div className="-ml-16 xl:-ml-48 fade-in-0 grid animate-in place-items-center opacity-100 duration-200">
		{defaultCards.map((card) => (
			<div
				className={cn(
					"-skew-y-[8deg] relative flex h-32 w-[22rem] select-none flex-col justify-between rounded border border-dashed bg-background p-3 font-mono transition-all duration-200",
					"after:-right-1 after:absolute after:top-[-5%] after:h-[110%] after:w-[20rem] after:bg-linear-to-l after:from-background after:via-transparent after:to-transparent after:content-['']",
					"bg-background-50 hover:border-foreground/20 hover:bg-background-50",
					"[&>*]:flex [&>*]:items-center [&>*]:gap-2",
					card.className
				)}
				key={card.title}
			>
				<div className="text-plasma-orange">
					<p className="font-medium text-[13px]">{card.title}</p>
				</div>
				<p className="line-clamp-2 text-balance font-normal text-[13px] text-primary/60">
					{card.description}
				</p>
				<p className="text-[10px] text-primary/40">{card.date}</p>
			</div>
		))}
	</div>
);
