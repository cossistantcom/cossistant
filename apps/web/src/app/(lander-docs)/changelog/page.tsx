import { format } from "date-fns";
import Link from "next/link";
import { Suspense } from "react";
import { JsonLdScripts } from "@/components/seo/json-ld";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icons";
import { buildCollectionPageJsonLd, changelogCollection } from "@/lib/metadata";
import { getChangelogData, getSortedChangelogEntries } from "@/lib/seo-content";
import { mdxComponents } from "../components/docs/mdx-components";
import {
	GitHubActivityGraph,
	GitHubActivityGraphSkeleton,
} from "../components/github-activity-graph";

export const revalidate = false;
export const dynamic = "force-static";

const ITEMS_PER_PAGE = 10;

export function generateMetadata() {
	const title = "Changelog";
	const description =
		"All the latest updates, improvements, and fixes to Cossistant.";

	return changelogCollection({
		title,
		description,
		path: "/changelog",
		image: `/og?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`,
	});
}

export default async function ChangelogPage() {
	const allEntries = getSortedChangelogEntries();

	const totalPages = Math.ceil(allEntries.length / ITEMS_PER_PAGE);
	const entries = allEntries.slice(0, ITEMS_PER_PAGE);
	const hasNextPage = totalPages > 1;

	return (
		<div className="flex flex-col pt-20 pb-40">
			<JsonLdScripts
				data={buildCollectionPageJsonLd({
					title: "Changelog",
					description:
						"All the latest updates, improvements, and fixes to Cossistant.",
					path: "/changelog",
				})}
				idPrefix="changelog-jsonld"
			/>
			<div className="relative flex flex-col">
				<Suspense fallback={<GitHubActivityGraphSkeleton />}>
					<GitHubActivityGraph />
				</Suspense>
				<div className="-translate-x-1/2 absolute bottom-0 left-1/2 w-screen border-t border-dashed" />
			</div>
			<div className="mx-auto w-full px-4 md:px-0">
				<div className="flex flex-col">
					{entries.map((entry) => {
						const entryData = getChangelogData(entry);
						const MDX = entry.data.body;
						const date = new Date(entryData.date);

						return (
							<article className="relative py-16" key={entry.url}>
								<div className="mx-auto mb-6 max-w-2xl shrink-0 md:sticky md:top-[90px] md:mx-0 md:mb-0 md:h-fit md:max-w-none md:px-4">
									<div className="flex items-center gap-3 md:flex-col md:items-start md:gap-1">
										{entryData.version && (
											<a
												className="inline-flex items-center border border-dashed bg-background-300 px-2.5 py-1 font-mono text-sm transition-colors hover:bg-background-400"
												href={`https://www.npmjs.com/package/@plasma/react/v/${entryData.version}`}
												rel="noopener noreferrer"
												target="_blank"
											>
												{entryData.version}
											</a>
										)}
										<time
											className="mt-2 font-mono text-muted-foreground text-sm"
											dateTime={entryData.date}
										>
											{format(date, "MMM d, yyyy")}
										</time>
									</div>
								</div>
								<div className="mx-auto flex max-w-2xl flex-col gap-8 pb-16 md:flex-row md:gap-12">
									{/* Content */}
									<div className="min-w-0 flex-1">
										<h2 className="mb-6 text-balance font-medium text-3xl">
											{entryData.description}
										</h2>
										<div className="w-full flex-1 *:data-[slot=alert]:first:mt-0">
											<MDX components={mdxComponents} />
										</div>
									</div>
								</div>

								{/* Separator line */}
								<div className="relative w-full">
									<div className="-translate-x-1/2 absolute top-0 left-1/2 w-screen border-t border-dashed" />
								</div>
							</article>
						);
					})}
				</div>

				{/* Navigation */}
				<nav className="mt-8 flex items-center justify-between">
					<div />
					{hasNextPage && (
						<Button
							asChild
							className="shadow-none"
							size="sm"
							variant="secondary"
						>
							<Link href="/changelog/page/2">
								Older posts <Icon name="arrow-right" />
							</Link>
						</Button>
					)}
				</nav>
			</div>
		</div>
	);
}
