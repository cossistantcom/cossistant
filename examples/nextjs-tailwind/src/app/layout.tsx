import { SupportProvider } from "@plasma/next";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Cossistant Example - Next.js + Tailwind",
	description: "Integration test app for @plasma/next docs flow",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className="bg-white text-slate-900 antialiased">
				<SupportProvider>{children}</SupportProvider>
			</body>
		</html>
	);
}
