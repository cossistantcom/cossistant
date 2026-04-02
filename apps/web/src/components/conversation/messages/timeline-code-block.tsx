import {
	TimelineCodeBlock as PrimitiveTimelineCodeBlock,
	type TimelineCodeBlockProps as PrimitiveTimelineCodeBlockProps,
} from "@plasma/next/primitives";
import type React from "react";
import { Button } from "@/components/ui/button";

export type TimelineCodeBlockProps = PrimitiveTimelineCodeBlockProps;

export function TimelineCodeBlock({
	code,
	language,
	fileName,
	className,
}: TimelineCodeBlockProps): React.ReactElement {
	return (
		<PrimitiveTimelineCodeBlock
			className={`w-full overflow-hidden rounded border border-border bg-background-400 ${className ?? ""}`.trim()}
			code={code}
			fileName={fileName}
			language={language}
		>
			{({
				code: content,
				codeClassName,
				fileName: resolvedFileName,
				languageLabel,
				hasCopied,
				onCopy,
			}) => (
				<>
					<div className="flex items-center justify-between gap-2 px-2 py-1.5">
						<div className="flex min-w-0 items-center gap-2">
							{resolvedFileName ? (
								<span className="truncate font-medium text-xs">
									{resolvedFileName}
								</span>
							) : null}
							<span className="rounded border border-border/70 bg-background-200 px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide">
								{languageLabel}
							</span>
						</div>

						<Button
							onClick={() => {
								void onCopy();
							}}
							size="xs"
							type="button"
							variant="ghost"
						>
							{hasCopied ? "Copied" : "Copy"}
						</Button>
					</div>

					<pre className="no-scrollbar overflow-x-auto p-3 text-xs leading-relaxed">
						<code className={codeClassName}>{content}</code>
					</pre>
				</>
			)}
		</PrimitiveTimelineCodeBlock>
	);
}
