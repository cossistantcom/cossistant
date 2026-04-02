import { format } from "date-fns";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { buildCollectionPageJsonLd, changelogCollection } from "@/lib/metadata";
import { getChangelogData, getSortedChangelogEntries } from "@/lib/seo-content";
import { mdxComponents } from "../../../components/docs/mdx-components";

export const revalidate = false;
export const dynamic = "force-static";
export const dynamicParams = false;

const ITEMS_PER_PAGE = 10;

export function generateStaticParams() {
	const allEntries = getSortedChangelogEntries();
	const totalPages = Math.ceil(allEntries.length / ITEMS_PER_PAGE);

	// Only generate pages 2+ (page 1 is at /changelog)
	if (totalPages <= 1) {
		return [];
	}

	return Array.from({ length: totalPages - 1 }, (_, i) => ({
		pageNumber: String(i + 2),
	}));
}

export async function generateMetadata(props: {
	params: Promise<{ pageNumber: string }>;
}) {
	const params = await props.params;
	const pageNumber = Number.parseInt(params.pageNumber, 10);

	const title = `Changelog - Page ${pageNumber}`;
	const description =
		"All the latest updates, improvements, and fixes to Cossistant.";

	return changelogCollection({
		title,
		description,
		path: `/changelog/page/${pageNumber}`,
		image: `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
		noIndex: true,
		follow: true,
	});
}

export default async function ChangelogPaginatedPage(props: {
	params: Promise<{ pageNumber: string }>;
}) {
	const params = await props.params;
	const pageNumber = Number.parseInt(params.pageNumber, 10);

	// Redirect page 1 to /changelog
	if (pageNumber === 1) {
		redirect("/changelog");
	}

	const allEntries = getSortedChangelogEntries();

	const totalPages = Math.ceil(allEntries.length / ITEMS_PER_PAGE);

	// 404 for invalid page numbers
	if (pageNumber < 1 || pageNumber > totalPages) {
		notFound();
	}

	const startIndex = (pageNumber - 1) * ITEMS_PER_PAGE;
	const entries = allEntries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

	const hasPreviousPage = pageNumber > 1;
	const hasNextPage = pageNumber < totalPages;
	const previousPageUrl =
		pageNumber === 2 ? "/changelog" : `/changelog/page/${pageNumber - 1}`;

	return (
		<div className="flex flex-col py-20 pb-40">
			<JsonLdScripts
				data={buildCollectionPageJsonLd({
					title: `Changelog - Page ${pageNumber}`,
					description:
						"All the latest updates, improvements, and fixes to Cossistant.",
					path: `/changelog/page/${pageNumber}`,
				})}
				idPrefix="changelog-page-jsonld"
			/>
			<div className="mx-auto w-full max-w-3xl px-4 md:px-0">
				<header className="mb-16">
					<h1 className="font-medium text-4xl tracking-tight">Changelog</h1>
					<p className="mt-4 text-lg text-muted-foreground">
						All the latest updates, improvements, and fixes to Cossistant.
					</p>
				</header>

				<div className="flex flex-col">
					{entries.map((entry) => {
						const entryData = getChangelogData(entry);
						const MDX = entry.data.body;
						const date = new Date(entryData.date);

						return (
							<article className="relative pb-16" key={entry.url}>
								<div className="flex flex-col gap-8 md:flex-row md:gap-12">
									{/* Sticky sidebar with version and date */}
									<div className="shrink-0 md:sticky md:top-24 md:h-fit md:w-32">
										<div className="flex items-center gap-3 md:flex-col md:items-start md:gap-1">
											<a
												className="inline-flex items-center rounded-sm bg-background-300 px-2.5 py-1 font-mono text-sm transition-colors hover:bg-background-400 dark:bg-background-400 dark:hover:bg-background-500"
												href={`https://www.npmjs.com/package/@plasma/react/v/${entryData.version}`}
												rel="noopener noreferrer"
												target="_blank"
											>
												{entryData.version}
											</a>
											<time
												className="text-muted-foreground text-sm"
												dateTime={entryData.date}
											>
												{format(date, "MMM d, yyyy")}
											</time>
										</div>
									</div>

									{/* Content */}
									<div className="min-w-0 flex-1">
										<h2 className="mb-6 font-medium text-xl">
											{entryData.description}
										</h2>
										<div className="w-full flex-1 *:data-[slot=alert]:first:mt-0">
											<MDX components={mdxComponents} />
										</div>
									</div>
								</div>

								{/* Separator line */}
								<div className="mt-16 border-t" />
							</article>
						);
					})}
				</div>

				{/* Navigation */}
				<nav className="mt-8 flex items-center justify-between">
					{hasPreviousPage ? (
						<Button
							asChild
							className="shadow-none"
							size="sm"
							variant="secondary"
						>
							<Link href={previousPageUrl}>
								<Icon name="arrow-left" /> Newer posts
							</Link>
						</Button>
					) : (
						<div />
					)}
					{hasNextPage ? (
						<Button
							asChild
							className="shadow-none"
							size="sm"
							variant="secondary"
						>
							<Link href={`/changelog/page/${pageNumber + 1}`}>
								Older posts <Icon name="arrow-right" />
							</Link>
						</Button>
					) : (
						<div />
					)}
				</nav>
			</div>
		</div>
	);
}
