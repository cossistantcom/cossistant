import Image from "next/image";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { Background } from "@/components/ui/background";
import { Button } from "@/components/ui/button";
import {
	buildCollectionPageJsonLd,
	buildOrganizationJsonLd,
	marketing,
} from "@/lib/metadata";
import { toAbsoluteUrl } from "@/lib/site-url";
import { cn } from "@/lib/utils";
import { FullWidthBorder } from "../components/full-width-border";
import {
	FEATURED_OPEN_SOURCE_PROJECTS,
	type FeaturedOpenSourceProject,
} from "./features";

const PAGE_TITLE = "Open Source Program";
const PAGE_DESCRIPTION =
	"Apply for a free Cossistant Pro plan for your open source project and get featured on our site.";
const FEATURED_PROJECTS_PER_MOBILE_ROW = 2;
const FEATURED_PROJECTS_PER_TABLET_ROW = 3;
const FEATURED_PROJECTS_PER_DESKTOP_ROW = 5;

const OVERVIEW_COLUMNS = [
	{
		title: "What you need",
		items: [
			"Public GitHub repo",
			"Recent commits and active",
			"At least 100+ GitHub stars",
			"Not profitable (yet!)",
		],
	},
	{
		title: "Conditions",
		items: [
			"Keep Cossistant mentioned in the widget",
			"Add the OSS badge to your README.MD",
			"Keep the badge linked to the Cossistant OSS program page",
		],
	},
	{
		title: "What you get",
		items: [
			"Pro plan for free with included credits",
			"Listing on this page with a dofollow link",
			"Guest blog post to our blog",
			"Help integrating & customizing the widget by our team",
		],
	},
] as const;

export const dynamic = "force-static";
export const revalidate = false;

export const metadata = marketing({
	title: PAGE_TITLE,
	description: PAGE_DESCRIPTION,
	path: "/open-source-program",
	image: `/og?title=${encodeURIComponent(PAGE_TITLE)}&description=${encodeURIComponent(PAGE_DESCRIPTION)}`,
	keywords: [
		"open source program",
		"open source sponsorship",
		"free support widget for open source",
		"customer support for open source projects",
		"oss sponsorship program",
	],
});

function buildFeaturedProjectsJsonLd(projects: FeaturedOpenSourceProject[]) {
	return {
		"@context": "https://schema.org",
		"@type": "ItemList",
		name: "Featured open source projects",
		itemListElement: projects.map((project, index) => ({
			"@type": "ListItem",
			position: index + 1,
			url: project.websiteUrl,
			name: project.name,
			image: project.ogImageUrl,
		})),
	};
}

function getDesktopFeaturedSlotCount(projectCount: number) {
	if (projectCount <= 0) {
		return FEATURED_PROJECTS_PER_DESKTOP_ROW;
	}

	return (
		Math.ceil(projectCount / FEATURED_PROJECTS_PER_DESKTOP_ROW) *
		FEATURED_PROJECTS_PER_DESKTOP_ROW
	);
}

function shouldShowTopSeparator(index: number, itemsPerRow: number) {
	return index >= itemsPerRow;
}

function shouldShowRightSeparator(index: number, itemsPerRow: number) {
	return index % itemsPerRow !== itemsPerRow - 1;
}

function GridSeparator({
	orientation,
	className,
}: {
	orientation: "top" | "right";
	className?: string;
}) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute z-10 border-dashed",
				orientation === "top"
					? "inset-x-0 top-0 border-t"
					: "inset-y-0 right-0 border-r",
				className
			)}
		/>
	);
}

function Section({
	id,
	title,
	description,
	children,
}: {
	id?: string;
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="px-4 py-12 md:px-0" id={id}>
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
				<div className="space-y-2">
					<h2 className="font-f37-stout text-2xl leading-tight md:text-3xl">
						{title}
					</h2>
					{description ? (
						<p className="max-w-3xl text-muted-foreground leading-7">
							{description}
						</p>
					) : null}
				</div>
				{children}
			</div>
		</section>
	);
}

export const ListItem = ({ children }: { children: React.ReactNode }) => (
	<li className="flex items-start gap-2">
		<span className="mr-1 font-bold font-mono text-plasma-orange text-xs leading-7">
			&gt;
		</span>
		{children}
	</li>
);

export default function OpenSourceProgramPage() {
	const programUrl = toAbsoluteUrl("/open-source-program");
	const featuredProjectDesktopSlotCount = getDesktopFeaturedSlotCount(
		FEATURED_OPEN_SOURCE_PROJECTS.length
	);
	const featuredProjectPlaceholderCount =
		featuredProjectDesktopSlotCount - FEATURED_OPEN_SOURCE_PROJECTS.length;
	const readmeSnippet = `<br />
<br />
<a href="${programUrl}">
<img alt="Cossistant OSS Program" src="https://cdn.plasma-pandora.com/oss/oss-friends.svg" />
</a>`;

	return (
		<>
			<JsonLdScripts
				data={[
					buildOrganizationJsonLd(),
					buildCollectionPageJsonLd({
						title: PAGE_TITLE,
						description: PAGE_DESCRIPTION,
						path: "/open-source-program",
					}),
					buildFeaturedProjectsJsonLd(FEATURED_OPEN_SOURCE_PROJECTS),
				]}
				idPrefix="open-source-program-jsonld"
			/>

			<section className="relative overflow-hidden pt-16 pb-16 md:pb-20">
				<Background
					className="absolute inset-0 z-0"
					fieldOpacity={0.06}
					interactive={true}
					pointerTrail={true}
					pointerTrailRadius={0.1}
				/>
				<div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-32 bg-linear-to-b from-background via-background/80 to-transparent md:h-44" />
				<div className="pointer-events-none absolute inset-0 z-0 bg-linear-to-br from-background/30 via-transparent to-background/55" />
				<div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-40 bg-linear-to-t from-background via-background/90 to-transparent md:h-52" />

				<div className="pointer-events-none relative z-10 flex w-full flex-col gap-6 md:gap-8">
					<div
						aria-hidden="true"
						className="pointer-events-none overflow-hidden px-2 sm:px-4 md:px-6"
					>
						<p className="-ml-[0.04em] pointer-events-none pt-20 font-f37-stout text-[clamp(4.75rem,17vw,14rem)] text-background uppercase leading-[0.76] tracking-[0.08em]">
							OSS FRIENDS
						</p>
					</div>

					<div className="pointer-events-none relative mx-auto w-full px-4 md:px-6">
						<div className="-inset-x-4 md:-inset-x-6 pointer-events-none absolute inset-y-0 rounded-[40px] bg-linear-to-r from-background via-background/88 to-background/12 blur-2xl" />
						<div className="pointer-events-none relative flex flex-col gap-6">
							<h1 className="pointer-events-none max-w-4xl text-balance font-f37-stout text-[40px] leading-tight md:text-6xl">
								Support your open source project users with Cossistant.
							</h1>
							<p className="pointer-events-none max-w-3xl text-lg text-muted-foreground leading-8">
								We want to help open source projects ship better customer
								support. If your project is real and already helping people,
								apply to get Cossistant Pro plan for free and extra benefits.
							</p>
							<div className="pointer-events-auto flex flex-col gap-3 sm:flex-row">
								<Button asChild className="h-11 px-5">
									<Link href="/open-source-program/apply">
										Join the OSS friends Program
									</Link>
								</Button>
								<Button asChild className="h-11 px-5" variant="ghost">
									<Link href="#featured-projects">See featured projects</Link>
								</Button>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="relative px-4 py-12 md:px-0">
				<div className="relative flex-col">
					<FullWidthBorder className="top-0" />
					<div className="grid grid-cols-1 lg:grid-cols-6">
						{OVERVIEW_COLUMNS.map((column, index) => (
							<div
								className="relative flex flex-col gap-6 px-4 py-12 pr-10 lg:col-span-2"
								key={column.title}
							>
								{index > 0 ? (
									<GridSeparator className="lg:hidden" orientation="top" />
								) : null}
								{index < OVERVIEW_COLUMNS.length - 1 ? (
									<GridSeparator
										className="hidden lg:block"
										orientation="right"
									/>
								) : null}
								<h2 className="font-f37-stout text-2xl leading-tight md:text-3xl">
									{column.title}
								</h2>
								<ul className="space-y-2 text-muted-foreground leading-7">
									{column.items.map((item) => (
										<ListItem key={item}>{item}</ListItem>
									))}
								</ul>
							</div>
						))}
					</div>

					<div className="relative flex flex-col gap-4">
						<FullWidthBorder className="top-0" />
						<div className="relative space-y-2 px-4 py-12">
							<Background className="absolute left-1/2" />
							<h3 className="font-f37-stout text-xl leading-tight md:text-2xl">
								README snippet
							</h3>
							<p className="mb-6 max-w-2xl text-muted-foreground text-sm leading-7">
								Copy the snippet below to link the badge back to the Cossistant
								OSS program page.
							</p>
							<Image
								alt="Cossistant OSS Program badge"
								className="h-auto w-auto dark:invert"
								height={48}
								src="https://cdn.plasma-pandora.com/oss/oss-friends.svg"
								width={220}
							/>
						</div>
						<div className="relative">
							<FullWidthBorder className="top-0" />

							<div className="relative flex items-center justify-between p-4">
								<p className="text-plasma-orange text-xs leading-7">
									&gt; ./README.md
								</p>
								<a
									className="absolute top-3.5 right-12 font-mono text-primary/50 text-xs hover:cursor-pointer hover:text-primary"
									href="https://github.com/plasma-pandora/plasma-pandora#:~:text=You%20can%20also%20join%20our%20open%20source%20program%3A"
									rel="noreferrer"
									target="_blank"
								>
									See example
								</a>
								<CopyButton
									className="top-2 right-2"
									value={readmeSnippet}
									variant="outline"
								/>
							</div>
							<pre className="overflow-x-auto p-4 pr-12 font-mono text-primary text-xs leading-6">
								<code>
									<span className="text-primary/40">{`
<!--
	Simply add this snippet to the end of your README.MD
	to show the OSS friends badge.
-->`}</span>
									<br />
									<br />
									{readmeSnippet}
								</code>
							</pre>
							<FullWidthBorder className="bottom-0" />
						</div>
					</div>
				</div>
			</section>

			<section className="p-0" id="featured-projects">
				<div className="mx-auto flex w-full flex-col gap-6">
					<div className="space-y-2 px-4">
						<h2 className="font-f37-stout text-2xl leading-tight md:text-3xl">
							Featured open source friends{" "}
							<span className="text-plasma-orange"> 👋</span>
						</h2>
						<p className="mb-6 max-w-2xl text-muted-foreground text-sm leading-7">
							These are the awesome open source projects that have been accepted
							into the OSS friends program.
						</p>
					</div>

					<div className="relative grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
						<FullWidthBorder className="top-0" />
						{FEATURED_OPEN_SOURCE_PROJECTS.map((project, index) => (
							<a
								className="group relative flex flex-col transition-colors hover:bg-background-100"
								href={`${project.websiteUrl}?utm_source=plasma-pandora&utm_medium=oss-program`}
								key={project.id}
								rel="noreferrer"
								target="_blank"
							>
								{shouldShowTopSeparator(
									index,
									FEATURED_PROJECTS_PER_MOBILE_ROW
								) ? (
									<GridSeparator className="md:hidden" orientation="top" />
								) : null}
								{shouldShowRightSeparator(
									index,
									FEATURED_PROJECTS_PER_MOBILE_ROW
								) ? (
									<GridSeparator className="md:hidden" orientation="right" />
								) : null}
								{shouldShowTopSeparator(
									index,
									FEATURED_PROJECTS_PER_TABLET_ROW
								) ? (
									<GridSeparator
										className="hidden md:block lg:hidden"
										orientation="top"
									/>
								) : null}
								{shouldShowRightSeparator(
									index,
									FEATURED_PROJECTS_PER_TABLET_ROW
								) ? (
									<GridSeparator
										className="hidden md:block lg:hidden"
										orientation="right"
									/>
								) : null}
								{shouldShowTopSeparator(
									index,
									FEATURED_PROJECTS_PER_DESKTOP_ROW
								) ? (
									<GridSeparator
										className="hidden lg:block"
										orientation="top"
									/>
								) : null}
								{shouldShowRightSeparator(
									index,
									FEATURED_PROJECTS_PER_DESKTOP_ROW
								) ? (
									<GridSeparator
										className="hidden lg:block"
										orientation="right"
									/>
								) : null}
								<div className="group overflow-hidden overflow-clip border-b border-dashed">
									<Image
										alt={`${project.name} open graph image`}
										className="aspect-[1.91/1] h-auto w-full object-cover grayscale group-hover:grayscale-0"
										height={630}
										src={project.ogImageUrl}
										unoptimized
										width={1200}
									/>
								</div>
								<div className="flex flex-1 items-center justify-between gap-3 p-4 text-sm">
									<span className="group-hover:text-primary">
										{project.name}
									</span>
									<span className="text-muted-foreground">Visit</span>
								</div>
							</a>
						))}
						{Array.from({ length: featuredProjectPlaceholderCount }).map(
							(_, index) => (
								<div
									aria-hidden="true"
									className="hidden lg:block"
									key={`featured-project-placeholder-${index}`}
								/>
							)
						)}
						<FullWidthBorder className="bottom-0" />
					</div>
				</div>
			</section>

			<div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row">
				<Button asChild className="h-11 px-5">
					<Link href="/open-source-program/apply">
						Apply to the OSS Program
					</Link>
				</Button>
			</div>
		</>
	);
}
