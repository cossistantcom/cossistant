import { format } from "date-fns";
import Image from "next/image";
import Link from "next/link";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { AsciiImage } from "@/components/ui/ascii-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { ANTHONY_AVATAR } from "@/constants";
import { blogCollection, buildCollectionPageJsonLd } from "@/lib/metadata";
import { getAllBlogTags, getPublishedBlogPosts } from "@/lib/seo-content";
import { cn } from "@/lib/utils";

const AUTHOR_AVATARS: Record<string, string> = {
	"Anthony Riera": ANTHONY_AVATAR,
};

export const revalidate = false;
export const dynamic = "force-static";

const GRID_COUNT = 12;
const DEFAULT_BLOG_IMAGE = "https://cdn.plasma-pandora.com/landing/main-large.jpg";

export function generateMetadata() {
	const title = "Blog";
	const description =
		"Insights, tutorials, and updates about AI-powered customer support and the Cossistant platform.";

	return blogCollection({
		title,
		description,
		path: "/blog",
		image: `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
		keywords: [
			"Cossistant blog",
			"AI support tutorials",
			"React support guides",
		],
	});
}

type BlogPage = ReturnType<typeof getPublishedBlogPosts>[number];

function BlogHero({ post }: { post: BlogPage }) {
	const date = new Date(post.data.date);
	const authorAvatar = AUTHOR_AVATARS[post.data.author];

	return (
		<Link
			className="group relative grid border-x border-dashed bg-background-50 transition-colors hover:bg-background-100 md:grid-cols-2 dark:bg-background-100 dark:hover:bg-background-200"
			href={post.url}
		>
			<AsciiImage
				alt={post.data.title}
				asciiOpacity={0.8}
				className="aspect-16/10 bg-background-200 grayscale md:aspect-4/3"
				priority
				resolution={0.15}
				src={post.data.image || DEFAULT_BLOG_IMAGE}
			/>
			<div className="flex flex-col justify-center gap-3 p-5 md:p-6">
				<div className="flex flex-wrap items-center gap-1.5">
					{post.data.tags.slice(0, 3).map((tag) => (
						<span
							className="inline-flex items-center border border-dashed bg-background-200 px-2 py-0.5 font-mono text-muted-foreground text-xs"
							key={tag}
						>
							{tag}
						</span>
					))}
				</div>
				<h2 className="font-medium text-2xl tracking-tight md:text-3xl">
					{post.data.title}
				</h2>
				<p className="line-clamp-3 text-muted-foreground">
					{post.data.description}
				</p>
				<div className="mt-auto flex items-center gap-3 pt-2">
					{authorAvatar ? (
						<Image
							alt={post.data.author}
							className="size-8 rounded-full object-cover"
							height={32}
							src={authorAvatar}
							width={32}
						/>
					) : (
						<div className="flex size-8 items-center justify-center rounded-full bg-background-300 font-medium text-sm">
							{post.data.author.charAt(0)}
						</div>
					)}
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-sm">{post.data.author}</span>
						<time
							className="font-mono text-muted-foreground text-xs"
							dateTime={post.data.date}
						>
							{format(date, "MMM d, yyyy")}
						</time>
					</div>
				</div>
			</div>
		</Link>
	);
}

function BlogCard({ post, className }: { post: BlogPage; className?: string }) {
	const date = new Date(post.data.date);
	const authorAvatar = AUTHOR_AVATARS[post.data.author];

	return (
		<Link
			className={cn(
				"group flex flex-col bg-background-50 transition-colors hover:bg-background-100 dark:bg-background-100 dark:hover:bg-background-200",
				className
			)}
			href={post.url}
		>
			<div className="flex flex-1 flex-col gap-4 p-6 md:p-8">
				<h3 className="line-clamp-2 font-medium text-lg tracking-tight md:text-xl">
					{post.data.title}
				</h3>
				<p className="line-clamp-3 text-muted-foreground text-sm">
					{post.data.description}
				</p>
				<div className="mt-auto flex items-center justify-between gap-3 pt-4">
					<div className="flex items-center gap-2.5">
						{authorAvatar ? (
							<Image
								alt={post.data.author}
								className="size-7 rounded-full object-cover"
								height={28}
								src={authorAvatar}
								width={28}
							/>
						) : (
							<div className="flex size-7 items-center justify-center rounded-full bg-background-300 font-medium text-xs">
								{post.data.author.charAt(0)}
							</div>
						)}
						<span className="text-muted-foreground text-sm">
							{post.data.author}
						</span>
					</div>
					<time
						className="font-mono text-muted-foreground text-xs"
						dateTime={post.data.date}
					>
						{format(date, "MMM d, yyyy")}
					</time>
				</div>
			</div>
		</Link>
	);
}

export const Section = ({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) => (
	<section className={cn("relative", className)}>
		<div className="-translate-x-1/2 absolute top-0 left-1/2 w-screen border-t border-dashed" />
		{children}
		<div className="-translate-x-1/2 absolute bottom-0 left-1/2 w-screen border-t border-dashed" />
	</section>
);

export default function BlogPage() {
	const allPosts = getPublishedBlogPosts();

	// Find the most recent top post for hero, or use the most recent post
	const topPosts = allPosts.filter((post) => post.data.top);
	const heroPost = topPosts[0] || allPosts[0];

	// Get remaining posts (excluding hero)
	const remainingPosts = allPosts.filter((post) => post !== heroPost);

	// Grid posts (up to GRID_COUNT)
	const gridPosts = remainingPosts.slice(0, GRID_COUNT);

	// Check if there are more posts beyond what's shown
	const hasNextPage = remainingPosts.length > GRID_COUNT;

	return (
		<div className="flex flex-col py-20 pb-40">
			<JsonLdScripts
				data={buildCollectionPageJsonLd({
					title: "Blog",
					description:
						"Insights, tutorials, and updates about AI-powered customer support and the Cossistant platform.",
					path: "/blog",
				})}
				idPrefix="blog-collection-jsonld"
			/>
			<div className="mx-auto mt-10 w-full max-w-5xl px-4 md:px-0">
				{/* Header */}
				<header className="mb-12">
					<h1 className="mb-6 font-medium text-4xl tracking-tight">Blog</h1>
					{/* Tag Filters */}
					<div className="flex flex-wrap gap-2">
						{getAllBlogTags().map((tag) => (
							<Badge asChild key={tag} variant="secondary">
								<Link href={`/blog/tag/${encodeURIComponent(tag)}`}>{tag}</Link>
							</Badge>
						))}
					</div>
				</header>

				{/* Hero Section */}
				{heroPost && (
					<Section className="mb-12">
						<BlogHero post={heroPost} />
					</Section>
				)}

				{/* Grid - 3 columns on desktop, 1 column on mobile */}
				{gridPosts.length > 0 && (
					<div className="mb-12 flex flex-col gap-12">
						{Array.from(
							{ length: Math.ceil(gridPosts.length / 3) },
							(_, rowIndex) => {
								const rowPosts = gridPosts.slice(
									rowIndex * 3,
									rowIndex * 3 + 3
								);
								return (
									<Section className="grid md:grid-cols-3" key={rowIndex}>
										{rowPosts.map((post, index) => (
											<BlogCard
												className={cn(
													// Mobile: horizontal borders between stacked cards
													"border-b border-dashed last:border-b-0 md:border-b-0",
													// Desktop: vertical borders between cards
													"md: md:border-l md:border-dashed",
													// Desktop: right border on last card in row
													index === rowPosts.length - 1 &&
														"md: md:border-r md:border-dashed"
												)}
												key={post.url}
												post={post}
											/>
										))}
									</Section>
								);
							}
						)}
					</div>
				)}

				{/* Pagination */}
				<nav className="mt-12 flex items-center justify-between">
					<div />
					{hasNextPage && (
						<Button
							asChild
							className="shadow-none"
							size="sm"
							variant="secondary"
						>
							<Link href="/blog/page/2">
								Older posts <Icon name="arrow-right" />
							</Link>
						</Button>
					)}
				</nav>
			</div>
		</div>
	);
}
