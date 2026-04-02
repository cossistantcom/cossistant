import { Github } from "lucide-react";
import { ApiRouteExample } from "@/components/api-route-example";
import { AvatarGenerator } from "@/components/avatar-generator";
import { CodeExample } from "@/components/code-example";
import { PlasmaLogo } from "@/components/plasma-logo";
import { FloatingAvatars } from "@/components/floating-avatars";
import { InlineAvatar } from "@/components/inline-avatar";
import { InstallCommand } from "@/components/install-command";
import { PropsExamples } from "@/components/props-examples";
import { ShapeProvider } from "@/components/shape-context";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
	return (
		<ShapeProvider>
			<div className="relative min-h-screen">
				{/* Floating avatars background */}
				<FloatingAvatars />

				{/* Main content */}
				<main className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col border-[var(--border)] border-x border-dashed bg-[var(--background)]/80 px-8 py-12 backdrop-blur-md md:px-12 md:py-20">
					{/* Logo with tight guide borders */}
					<div className="relative mb-10 py-6">
						{/* Full-width top border */}
						<div className="-translate-x-1/2 absolute top-0 left-1/2 w-screen border-[var(--border)] border-t border-dashed" />
						{/* Full-width bottom border */}
						<div className="-translate-x-1/2 absolute bottom-0 left-1/2 w-screen border-[var(--border)] border-b border-dashed" />
						<h1 className="flex justify-between py-0 text-4xl md:text-5xl">
							<span>F</span>
							<span>A</span>
							<span>C</span>
							<span>E</span>
							<span>H</span>
							<span>A</span>
							<span>S</span>
							<span>H</span>
						</h1>
						<a
							className="mt-3 flex items-center justify-center gap-1.5 text-[var(--muted-foreground)] text-xs transition-colors hover:text-[var(--foreground)]"
							href="https://plasma-pandora.com?ref=facehash"
							rel="noopener noreferrer"
							target="_blank"
						>
							<span>by</span>
							<PlasmaLogo className="h-2.5 w-auto" />
							<span>Plasma</span>
						</a>
					</div>

					{/* Hero */}
					<section className="relative mb-10 py-6">
						<p className="text-[var(--muted-foreground)] text-sm">
							a React component that generates unique avatar faces from any
							string. zero dependencies. works with Next.js, Vite, Remix.
						</p>
					</section>

					{/* Install */}
					<section className="mb-10">
						<InstallCommand />
					</section>

					{/* Playground - right after install */}
					<section className="mb-16">
						<p className="mb-4 text-[var(--muted-foreground)] text-xs">
							try it — type anything
						</p>
						<AvatarGenerator />
					</section>

					{/* Why facehash */}
					<section className="mb-16">
						<h2 className="mb-4 font-semibold text-lg">why facehash?</h2>
						<div className="space-y-4 text-[var(--muted-foreground)] text-sm">
							<p>
								every app needs avatars. most solutions are either too heavy,
								require external services, or look dated. facehash generates
								unique, friendly faces from any string — emails, usernames,
								uuids, whatever.
							</p>
							<p>
								same input = same face. always. no api calls, no storage, no
								randomness. just deterministic, beautiful avatars that work
								offline.
							</p>
							<p>
								need an image URL for emails or og images? use the{" "}
								<span className="text-[var(--foreground)]">
									next.js route handler
								</span>{" "}
								to generate PNGs by default or raw SVGs for icons and favicons —
								cached forever.
							</p>
							<p>
								perfect for user profiles, comment sections, chat apps, and{" "}
								<span className="text-[var(--foreground)]">ai agents</span> —
								give your bots a face that&apos;s consistent across sessions.
							</p>
						</div>
					</section>

					{/* Features grid */}
					<section className="mb-16 grid grid-cols-2 gap-8 md:grid-cols-4">
						<div>
							<div className="mb-1 text-xl">0kb</div>
							<div className="text-[var(--muted-foreground)] text-xs">
								no external assets
							</div>
						</div>
						<div>
							<div className="mb-1 text-xl">api</div>
							<div className="text-[var(--muted-foreground)] text-xs">
								next.js image route
							</div>
						</div>
						<div>
							<div className="mb-1 text-xl">a11y</div>
							<div className="text-[var(--muted-foreground)] text-xs">
								accessible by default
							</div>
						</div>
						<div>
							<div className="mb-1 text-xl">ts</div>
							<div className="text-[var(--muted-foreground)] text-xs">
								fully typed
							</div>
						</div>
					</section>

					{/* Code example */}
					<section className="mb-16">
						<CodeExample />
					</section>

					{/* API Route example */}
					<section className="mb-16">
						<ApiRouteExample />
					</section>

					{/* Props examples */}
					<section className="mb-16">
						<h2 className="mb-6 font-semibold text-lg">props</h2>
						<PropsExamples />
					</section>

					{/* Use cases */}
					<section className="mb-16">
						<h2 className="mb-4 font-semibold text-lg">use cases</h2>
						<p className="text-[var(--muted-foreground)] text-sm">
							user profiles, chat apps, comment sections, team directories,
							multiplayer games, placeholder avatars, bot identities, even AI
							agents like that one you randomly named &quot;Claude&quot;{" "}
							<InlineAvatar name="Claude" />.
						</p>
					</section>

					{/* Cross-promotion */}
					<section className="relative mb-12 pb-12">
						<p className="text-[var(--muted-foreground)] text-sm">
							made by{" "}
							<a
								className="text-[var(--foreground)] underline underline-offset-4 transition-colors hover:text-[var(--accent)]"
								href="https://plasma-pandora.com?ref=facehash"
								rel="noopener noreferrer"
								target="_blank"
							>
								cossistant
							</a>
						</p>
						<p className="mt-1 text-[var(--muted-foreground)] text-xs">
							the open-source chat support widget for react
						</p>
						{/* Full-width bottom border */}
						<div className="-translate-x-1/2 absolute bottom-0 left-1/2 w-screen border-[var(--border)] border-b border-dashed" />
					</section>

					{/* Footer controls */}
					<footer className="mt-auto flex items-center justify-between">
						<div className="flex items-center gap-4">
							<a
								className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
								href="https://github.com/plasma-pandora/plasma-pandora"
								rel="noopener noreferrer"
								target="_blank"
							>
								<Github className="h-4 w-4" />
							</a>
							<span className="text-[var(--muted-foreground)] text-xs">
								MIT
							</span>
						</div>
						<ThemeToggle />
					</footer>
				</main>
			</div>
		</ShapeProvider>
	);
}
