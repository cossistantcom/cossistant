import type { ReactNode } from "react";

type LegalSection = {
	title: string;
	content: ReactNode;
};

type LegalPageLayoutProps = {
	title: string;
	effectiveDate: string;
	sections: LegalSection[];
};

export function LegalPageLayout({
	title,
	effectiveDate,
	sections,
}: LegalPageLayoutProps) {
	return (
		<div className="flex flex-col pt-40 pb-20">
			<div className="mx-auto max-w-3xl px-6">
				<h1 className="font-f37-stout text-4xl leading-tight md:text-5xl">
					{title}
				</h1>
				<p className="mt-4 text-muted-foreground">
					Effective Date: {effectiveDate}
				</p>

				<div className="mt-12 space-y-10">
					{sections.map((section, index) => (
						<section key={section.title}>
							<h2 className="mb-4 font-semibold text-xl">
								{index + 1}. {section.title}
							</h2>
							<div className="space-y-4 text-foreground/80 leading-relaxed">
								{section.content}
							</div>
						</section>
					))}
				</div>

				<div className="mt-16 border-t border-dashed pt-8">
					<p className="text-muted-foreground text-sm">
						If you have any questions about this document, please contact us at{" "}
						<a
							className="text-primary underline"
							href="mailto:anthony@plasma-pandora.com"
						>
							anthony@plasma-pandora.com
						</a>
						.
					</p>
				</div>
			</div>
		</div>
	);
}
