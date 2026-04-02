import { format } from "date-fns";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { AsciiImage } from "@/components/ui/ascii-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import {
	blogArticle,
	buildBlogPostingJsonLd,
	buildBreadcrumbJsonLd,
} from "@/lib/metadata";
import {
	getBlogData,
	getBlogPostBySlug,
	getBlogPostSlug,
	getPublishedBlogPosts,
} from "@/lib/seo-content";
import { mdxComponents } from "../../components/docs/mdx-components";

export const revalidate = false;
export const dynamic = "force-static";
export const dynamicParams = false;

const DEFAULT_BLOG_IMAGE = "https://cdn.plasma-pandora.com/landing/main-large.jpg";
type BlogPage = ReturnType<typeof getPublishedBlogPosts>[number];

export function generateStaticParams() {
	const posts = getPublishedBlogPosts();
	return posts.map((post) => ({
		slug: getBlogPostSlug(post),
	}));
}

export async function generateMetadata(props: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const params = await props.params;
	const post = getBlogPostBySlug(params.slug);

	if (!post) {
		return {};
	}

	const data = getBlogData(post);
	const { title, description, image, author, date, canonical, tags, keywords } =
		data;

	return blogArticle({
		title,
		description,
		path: post.url,
		canonical,
		image:
			image ||
			`/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
		keywords,
		tags,
		authors: [author],
		publishedTime: date,
		modifiedTime: data.updatedAt ?? date,
		noIndex: data.noindex,
	});
}

function RelatedArticles({ slugs }: { slugs: string[] }) {
	const posts = getPublishedBlogPosts();
	const relatedPosts = slugs
		.map((slug) => posts.find((post) => getBlogPostSlug(post) === slug))
		.filter((p): p is BlogPage => p !== undefined)
		.slice(0, 3);

	if (relatedPosts.length === 0) {
		return null;
	}

	return (
		<section className="mt-16">
			<h2 className="mb-6 font-medium text-xl">Related Articles</h2>
			<div className="grid gap-4 md:grid-cols-3">
				{relatedPosts.map((post) => {
					const relatedPost = getBlogData(post);
					const date = new Date(relatedPost.date);
					return (
						<Link
							className="group flex flex-col gap-3 border border-dashed bg-background-50 p-5 transition-colors hover:bg-background-100 dark:bg-background-100 dark:hover:bg-background-200"
							href={post.url}
							key={post.url}
						>
							<h3 className="line-clamp-2 font-medium tracking-tight transition-colors group-hover:text-primary">
								{relatedPost.title}
							</h3>
							<p className="line-clamp-2 text-muted-foreground text-sm">
								{relatedPost.description}
							</p>
							<time
								className="mt-auto font-mono text-muted-foreground text-xs"
								dateTime={relatedPost.date}
							>
								{format(date, "MMM d, yyyy")}
							</time>
						</Link>
					);
				})}
			</div>
		</section>
	);
}

export default async function BlogPostPage(props: {
	params: Promise<{ slug: string }>;
}) {
	const params = await props.params;
	const post = getBlogPostBySlug(params.slug);

	if (!post) {
		notFound();
	}

	const data = getBlogData(post);
	const { title, description, image, author, date, tags, related } = data;
	const MDX = post.data.body;
	const formattedDate = format(new Date(date), "MMMM d, yyyy");

	// Find prev/next posts for navigation
	const allPosts = getPublishedBlogPosts();
	const currentIndex = allPosts.indexOf(post);
	const prevPost =
		currentIndex < allPosts.length - 1 ? allPosts[currentIndex + 1] : null;
	const nextPost = currentIndex > 0 ? allPosts[currentIndex - 1] : null;

	return (
		<>
			<JsonLdScripts
				data={[
					buildBlogPostingJsonLd({
						title,
						description,
						path: post.url,
						image:
							image ||
							`/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
						author,
						publishedTime: date,
						modifiedTime: data.updatedAt ?? date,
						tags,
					}),
					buildBreadcrumbJsonLd([
						{ name: "Home", path: "/" },
						{ name: "Blog", path: "/blog" },
						{ name: title, path: post.url },
					]),
				]}
				idPrefix="blog-article-jsonld"
			/>
			<article className="flex flex-col py-20 pb-40">
				<div className="mx-auto w-full max-w-3xl px-4 md:px-0">
					{/* Back link */}
					<Link
						className="mt-10 mb-8 inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
						href="/blog"
					>
						<Icon className="size-4" name="arrow-left" />
						Back to Blog
					</Link>

					{/* Header */}
					<header className="mb-8">
						{/* Tags */}
						<div className="mb-4 flex flex-wrap gap-2">
							{tags.map((tag) => (
								<Badge asChild key={tag} variant="secondary">
									<Link href={`/blog/tag/${encodeURIComponent(tag)}`}>
										{tag}
									</Link>
								</Badge>
							))}
						</div>

						{/* Title */}
						<h1 className="mb-4 text-balance font-medium text-3xl tracking-tight md:text-4xl">
							{title}
						</h1>

						{/* Description */}
						<p className="mb-6 text-lg text-muted-foreground">{description}</p>

						{/* Author & Date */}
						<div className="flex items-center gap-4">
							<div className="flex size-10 items-center justify-center rounded-full bg-background-300 font-medium">
								{author.charAt(0)}
							</div>
							<div className="flex flex-col">
								<span className="font-medium">{author}</span>
								<time className="text-muted-foreground text-sm" dateTime={date}>
									{formattedDate}
								</time>
							</div>
						</div>
					</header>

					{/* Hero Image */}
					<AsciiImage
						alt={title}
						asciiOpacity={0.9}
						className="mb-12 aspect-[16/9] border border-dashed bg-background-100 grayscale"
						priority
						resolution={0.15}
						src={image || DEFAULT_BLOG_IMAGE}
					/>

					{/* Content */}
					<div className="max-w-none">
						<MDX components={mdxComponents} />
					</div>

					{/* Tags at bottom */}
					<Separator className="my-12 opacity-50" />

					<div className="flex flex-wrap items-center gap-2">
						<span className="text-muted-foreground text-sm">Tagged:</span>
						{tags.map((tag) => (
							<Badge asChild key={tag} variant="outline">
								<Link href={`/blog/tag/${encodeURIComponent(tag)}`}>{tag}</Link>
							</Badge>
						))}
					</div>

					{/* Related Articles */}
					{related && related.length > 0 && <RelatedArticles slugs={related} />}

					{/* Navigation */}
					<Separator className="my-12 opacity-50" />

					<nav className="flex items-center justify-between gap-4">
						{prevPost ? (
							<Button
								asChild
								className="shadow-none"
								size="sm"
								variant="secondary"
							>
								<Link href={prevPost.url}>
									<Icon name="arrow-left" />
									<span className="hidden sm:inline">
										{prevPost.data.title}
									</span>
									<span className="sm:hidden">Previous</span>
								</Link>
							</Button>
						) : (
							<div />
						)}
						{nextPost ? (
							<Button
								asChild
								className="shadow-none"
								size="sm"
								variant="secondary"
							>
								<Link href={nextPost.url}>
									<span className="hidden sm:inline">
										{nextPost.data.title}
									</span>
									<span className="sm:hidden">Next</span>
									<Icon name="arrow-right" />
								</Link>
							</Button>
						) : (
							<div />
						)}
					</nav>
				</div>
			</article>
		</>
	);
}
