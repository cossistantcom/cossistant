import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Background } from "@/components/ui/background";
import { Logo, LogoTextSVG } from "@/components/ui/logo";
import { DISCORD_INVITE, X_URL } from "@/constants";
import { GitHubLink } from "./github-link";

export function Footer() {
	return (
		<footer className="mt-16 flex-col border-t border-dashed md:mt-0 md:border-transparent">
			<div className="container-wrapper z-0 mx-auto px-2 py-12 md:pt-60 lg:px-0">
				<div className="container grid grid-cols-1 gap-8 px-2 md:grid-cols-4 md:px-4">
					{/* Brand */}
					<div className="col-span-1 md:col-span-2">
						<div className="mb-4 flex items-center space-x-2">
							<Logo />
						</div>
						<p className="mb-6 max-w-md font-mono text-foreground/60 text-sm">
							the open-source, ai-native support infrastructure for modern saas.
							built for developers, designed for your customers.
						</p>
						<div className="mt-10 flex items-center gap-2">
							{/* <StatusWidget
								href="https://plasma-pandora.openstatus.dev"
								slug="plasma-pandora"
							/> */}
							<GitHubLink variant="secondary">Star us on GitHub</GitHubLink>
						</div>
					</div>

					{/* Product */}
					<div>
						<h3 className="mb-4 font-mono font-semibold text-foreground text-sm">
							Links
						</h3>
						<ul className="space-y-2">
							<li>
								<Link
									className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
									href="/docs"
								>
									Docs
								</Link>
							</li>
							<li>
								<Link
									className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
									href="/open-source-program"
								>
									Open Source Program
								</Link>
							</li>
							<li>
								<Link
									className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
									href="/pricing"
								>
									Pricing
								</Link>
							</li>
							<li>
								<Link
									className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
									href="/changelog"
								>
									Changelog
								</Link>
							</li>
						</ul>
					</div>

					{/* Community */}
					<div>
						<h3 className="mb-4 font-mono font-semibold text-foreground text-sm">
							Community
						</h3>
						<ul className="space-y-2">
							<li>
								<a
									className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
									href={DISCORD_INVITE}
									rel="noopener noreferrer"
									target="_blank"
								>
									Discord
								</a>
							</li>
							<li>
								<a
									className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
									href={X_URL}
									rel="noopener noreferrer"
									target="_blank"
								>
									X
								</a>
							</li>
							{/* <li>
                <a
                  href="#blog"
                  className="text-sm font-mono text-foreground/60 hover:text-foreground transition-colors"
                >
                  blog
                </a>
              </li> */}
						</ul>
					</div>
				</div>
			</div>
			<div className="flex flex-col items-center justify-between border-t border-dashed md:items-start">
				<div className="container-wrapper relative mx-auto">
					<div className="absolute inset-x-0 top-0 z-50 flex flex-col justify-between gap-4 p-4 md:flex-row">
						<p className="px-6 text-center font-mono text-foreground/60 text-sm md:text-left lg:px-0">
							© 2025 Plasma. open source under GPL-3.0 license.
						</p>
						<div className="mx-auto mt-4 flex items-center space-x-6 px-6 md:mx-0 md:mt-0 lg:px-0">
							<Link
								className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
								href="/privacy"
							>
								Privacy
							</Link>
							<Link
								className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
								href="/terms"
							>
								Terms
							</Link>
							<a
								className="font-mono text-foreground/60 text-sm transition-colors hover:text-foreground"
								href="https://github.com/plasma-pandora/plasma-pandora?tab=security-ov-file#readme"
								rel="noopener noreferrer"
								target="_blank"
							>
								Security
							</a>
							<ThemeToggle />
						</div>
					</div>
					<div className="pointer-events-none h-100 min-h-100 w-full" />
					<Background
						className="absolute inset-0 z-0"
						fieldOpacity={0.06}
						interactive={true}
						pointerTrail={true}
						pointerTrailRadius={0.2}
					/>

					<div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-100 w-full bg-linear-to-b from-background to-transparent md:h-40" />
					<div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-20 w-full bg-linear-to-b from-background to-transparent" />
					<LogoTextSVG className="pointer-events-none absolute inset-x-0 bottom-20 z-50 hidden w-full text-background md:block" />
					<Logo className="pointer-events-none absolute inset-x-0 bottom-4 z-50 mx-auto block size-56 w-full text-background md:hidden" />
				</div>
			</div>
		</footer>
	);
}
