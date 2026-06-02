import type { Metadata } from "next";
import { ExampleSupportProvider } from "./example-support-provider";
import "./globals.css";

export const metadata: Metadata = {
	title: "Cossistant Example - Next.js + Tailwind",
	description: "Integration test app for @cossistant/next docs flow",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className="bg-white text-slate-900 antialiased">
				<ExampleSupportProvider
					publicKey={process.env.NEXT_PUBLIC_COSSISTANT_API_KEY}
				>
					{children}
				</ExampleSupportProvider>
			</body>
		</html>
	);
}
