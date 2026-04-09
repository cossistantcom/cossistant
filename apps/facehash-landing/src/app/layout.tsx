import { GeistPixelSquare } from "geist/font/pixel";
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

const siteUrl = process.env.NEXT_PUBLIC_URL || "https://facehash.dev";
const iconSvgUrl = `/api/avatar?${new URLSearchParams({
	name: "facehash",
	format: "svg",
	pose: "front",
	size: "128",
}).toString()}`;
const appleIconUrl = `/api/avatar?${new URLSearchParams({
	name: "facehash",
	pose: "front",
	size: "180",
}).toString()}`;

export const metadata: Metadata = {
	title: {
		default: "Facehash - Beautiful Minimalist Avatars for React",
		template: "%s | Facehash",
	},
	description:
		"Beautiful minimalist avatars from any string for React. Zero dependencies, SVG-based depth effects, fully typed. Perfect for user profiles, chat apps, and AI agents.",
	keywords: [
		"avatar",
		"avatar generator",
		"react avatar",
		"minimalist avatar",
		"generative avatar",
		"profile picture",
		"identicon",
		"user avatar",
		"ai agent avatar",
		"facehash",
		"react component",
		"typescript",
		"svg avatar",
	],
	authors: [{ name: "Cossistant Team", url: "https://plasma-pandora.com" }],
	creator: "Cossistant",
	publisher: "Cossistant",
	metadataBase: new URL(siteUrl),
	appleWebApp: {
		title: "Facehash",
		statusBarStyle: "default",
	},
	icons: {
		icon: [
			{
				url: iconSvgUrl,
				type: "image/svg+xml",
			},
		],
		apple: [
			{
				url: appleIconUrl,
				type: "image/png",
			},
		],
	},
	openGraph: {
		type: "website",
		locale: "en_US",
		url: "/",
		siteName: "Facehash",
		title: "Facehash - Beautiful Minimalist Avatars for React",
		description:
			"Beautiful minimalist avatars from any string for React. Zero dependencies, SVG-based depth effects, fully typed. Perfect for user profiles, chat apps, and AI agents.",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Facehash - Beautiful Minimalist Avatars for React",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "Facehash - Beautiful Minimalist Avatars for React",
		description:
			"Beautiful minimalist avatars from any string for React. Zero dependencies, SVG-based depth effects, fully typed.",
		images: ["/og-image.png"],
		creator: "@plasmapandora",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	alternates: {
		canonical: "/",
	},
	category: "technology",
};

export const viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 5,
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#fafafa" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
	],
};

const jsonLd = {
	"@context": "https://schema.org",
	"@type": "SoftwareApplication",
	name: "Facehash",
	applicationCategory: "DeveloperApplication",
	operatingSystem: "Any",
	description:
		"Beautiful minimalist avatars from any string for React. Zero dependencies, SVG-based depth effects, fully typed.",
	url: "https://facehash.dev",
	author: {
		"@type": "Organization",
		name: "Cossistant",
		url: "https://plasma-pandora.com",
	},
	offers: {
		"@type": "Offer",
		price: "0",
		priceCurrency: "USD",
	},
	license: "https://opensource.org/licenses/MIT",
	programmingLanguage: ["TypeScript", "JavaScript", "React"],
	keywords: [
		"avatar",
		"react",
		"deterministic",
		"component",
		"typescript",
		"css3d",
	],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			className={GeistPixelSquare.variable}
			lang="en"
			suppressHydrationWarning
		>
			<head>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data requires dangerouslySetInnerHTML
					dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
					type="application/ld+json"
				/>
			</head>
			<body className="font-pixel antialiased">
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
