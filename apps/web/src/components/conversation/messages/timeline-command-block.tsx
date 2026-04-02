import {
	TimelineCommandBlock as PrimitiveTimelineCommandBlock,
	type TimelineCommandBlockProps as PrimitiveTimelineCommandBlockProps,
} from "@plasma/next/primitives";
import type React from "react";
import { Button } from "@/components/ui/button";

export type TimelineCommandBlockProps = PrimitiveTimelineCommandBlockProps;

export function TimelineCommandBlock({
	commands,
	className,
}: TimelineCommandBlockProps): React.ReactElement {
	return (
		<PrimitiveTimelineCommandBlock
			className={`w-full overflow-hidden rounded border border-border bg-background-400 ${className ?? ""}`.trim()}
			commands={commands}
		>
			{({
				activeCommand,
				activePackageManager,
				hasCopied,
				onCopy,
				packageManagers,
				setPackageManager,
			}) => (
				<>
					<div className="flex items-center justify-between gap-2 px-2 py-1.5">
						<div className="flex items-center gap-1">
							{packageManagers.map((packageManager) => (
								<Button
									key={packageManager}
									onClick={() => setPackageManager(packageManager)}
									size="xs"
									type="button"
									variant={
										activePackageManager === packageManager
											? "secondary"
											: "ghost"
									}
								>
									{packageManager}
								</Button>
							))}
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
						<code className="language-bash">{activeCommand}</code>
					</pre>
				</>
			)}
		</PrimitiveTimelineCommandBlock>
	);
}
