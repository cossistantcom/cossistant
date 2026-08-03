import { SupportConfig } from "@cossistant/next/support-config";
import { AppLayoutSkeleton } from "@/components/ui/skeletons/app-layout-skeleton";

export default function Layout({
	children,
}: Readonly<{
	children: React.ReactNode;
	params: Promise<{
		organizationSlug: string;
	}>;
}>) {
	return (
		<section className="relative h-screen w-full overflow-hidden">
			<AppLayoutSkeleton className="pointer-events-none z-0 opacity-20" />
			<div className="scrollbar-thin scrollbar-thumb-background-500 scrollbar-track-background-100 absolute inset-0 z-10 flex justify-center overflow-y-scroll py-20">
				{children}
			</div>
			<SupportConfig
				quickOptions={[
					"I'm stuck",
					"Can I talk with the founder?",
					"Can I use Cossistant without Tailwind?",
				]}
			/>
		</section>
	);
}
