import { DashboardButton } from "@/app/(lander-docs)/components/topbar/dashboard-button";
import { LandingSupportTrigger } from "@/components/support/landing-support-trigger";
import { Footer } from "./components/footer";
import { TopBar } from "./components/topbar";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative flex min-h-svh flex-col overflow-clip">
			<a
				className="-translate-y-full fixed top-2 left-2 z-[100] min-h-11 bg-background px-4 py-3 font-medium text-sm shadow-lg focus:translate-y-0 focus:outline-2 focus:outline-ring focus:outline-offset-2 motion-reduce:transition-none"
				href="#main-content"
			>
				Skip to main content
			</a>
			<TopBar>
				<DashboardButton />
			</TopBar>
			<main className="flex flex-1 flex-col" id="main-content" tabIndex={-1}>
				<div className="container-wrapper mx-auto">{children}</div>
			</main>
			<Footer />
			<LandingSupportTrigger />
		</div>
	);
}
