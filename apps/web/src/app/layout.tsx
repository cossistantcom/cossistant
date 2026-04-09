import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";

import "./globals.css";

import { Toaster } from "@/components/ui/sonner";
import { createRootMetadata } from "@/lib/metadata";
import { Providers } from "./providers";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
	display: "swap",
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
	display: "swap",
});

const F37Stout = localFont({
	src: [
		{
			path: "../../public/fonts/F37Stout-Regular.woff2",
			weight: "400",
			style: "normal",
		},
	],
	variable: "--font-f37-stout",
	display: "swap",
});

export const metadata = createRootMetadata();

export const viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
	themeColor: [
		{ media: "(prefers-color-scheme: light)" },
		{ media: "(prefers-color-scheme: dark)" },
	],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={`${geistSans.variable} ${geistMono.variable} ${F37Stout.variable} group/body antialiased`}
			>
				<div className="isolate" id="radix-portal-root" />
				<Script
					data-domain="plasma-pandora.com"
					data-website-id="68dfcb6e6f762f4ecaf58bb4"
					src="https://datafa.st/js/script.js"
					strategy="afterInteractive"
				/>
				<Providers>{children}</Providers>
				<Toaster />
			</body>
		</html>
	);
}
