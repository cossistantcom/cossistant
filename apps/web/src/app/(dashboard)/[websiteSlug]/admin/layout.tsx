import { AdminNavigationSidebar } from "./admin-navigation-sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<AdminNavigationSidebar />
			{children}
		</>
	);
}
