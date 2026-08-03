type DocsFeedbackProps = {
	pageTitle: string;
	pageUrl: string;
};

function buildFeedbackUrl({
	helpful,
	pageTitle,
	pageUrl,
}: DocsFeedbackProps & { helpful: boolean }) {
	const url = new URL("https://github.com/cossistantcom/cossistant/issues/new");
	const verdict = helpful ? "helpful" : "needs improvement";

	url.searchParams.set("labels", "documentation");
	url.searchParams.set("title", `Docs feedback: ${pageTitle}`);
	url.searchParams.set(
		"body",
		[
			`Page: https://cossistant.com${pageUrl}`,
			`Verdict: ${verdict}`,
			"",
			helpful
				? "What helped you?"
				: "What were you trying to do, and what should we improve?",
		].join("\n")
	);

	return url.toString();
}

export function DocsFeedback({ pageTitle, pageUrl }: DocsFeedbackProps) {
	return (
		<section
			aria-labelledby="docs-feedback-title"
			className="border-border border-t border-dashed pt-6"
			data-slot="docs-feedback"
		>
			<h2 className="font-medium text-base" id="docs-feedback-title">
				Was this page helpful?
			</h2>
			<p className="mt-1 text-muted-foreground text-sm">
				Open a prefilled documentation issue so the team can act on your
				feedback.
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<a
					className="inline-flex min-h-11 items-center border border-border bg-background px-4 font-medium text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
					href={buildFeedbackUrl({ helpful: true, pageTitle, pageUrl })}
					rel="noreferrer"
					target="_blank"
				>
					Yes, it helped
				</a>
				<a
					className="inline-flex min-h-11 items-center border border-border bg-background px-4 font-medium text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
					href={buildFeedbackUrl({ helpful: false, pageTitle, pageUrl })}
					rel="noreferrer"
					target="_blank"
				>
					Needs improvement
				</a>
			</div>
		</section>
	);
}
