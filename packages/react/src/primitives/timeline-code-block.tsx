"use client";

import * as React from "react";

export type TimelineCodeBlockRenderState = {
	code: string;
	language?: string;
	languageLabel: string;
	codeClassName?: string;
	fileName?: string;
	hasCopied: boolean;
	onCopy: () => Promise<boolean>;
};

export type TimelineCodeBlockProps = {
	code: string;
	language?: string;
	fileName?: string;
	className?: string;
	children?: (state: TimelineCodeBlockRenderState) => React.ReactNode;
};

function getLanguageLabel(language?: string): string {
	if (!language) {
		return "TEXT";
	}

	return language.toUpperCase();
}

async function copyToClipboard(value: string): Promise<boolean> {
	if (typeof navigator === "undefined" || !navigator.clipboard) {
		return false;
	}

	try {
		await navigator.clipboard.writeText(value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Shared timeline code block UI with filename/language metadata and copy action.
 */
export function TimelineCodeBlock({
	code,
	language,
	fileName,
	className,
	children,
}: TimelineCodeBlockProps): React.ReactElement {
	const [hasCopied, setHasCopied] = React.useState(false);

	React.useEffect(() => {
		if (!hasCopied) {
			return;
		}

		const timer = window.setTimeout(() => {
			setHasCopied(false);
		}, 1800);

		return () => {
			window.clearTimeout(timer);
		};
	}, [hasCopied]);

	const codeClassName = language ? `language-${language}` : undefined;
	const languageLabel = getLanguageLabel(language);

	const onCopy = React.useCallback(async () => {
		const didCopy = await copyToClipboard(code);
		if (didCopy) {
			setHasCopied(true);
		}

		return didCopy;
	}, [code]);

	const renderState: TimelineCodeBlockRenderState = {
		code,
		language,
		languageLabel,
		codeClassName,
		fileName,
		hasCopied,
		onCopy,
	};

	return (
		<div className={className} data-co-code-block="">
			{typeof children === "function" ? (
				children(renderState)
			) : (
				<>
					<div>
						<div>
							{fileName ? <span>{fileName}</span> : null}
							<span>{languageLabel}</span>
						</div>
						<button
							onClick={() => {
								void onCopy();
							}}
							type="button"
						>
							{hasCopied ? "Copied" : "Copy"}
						</button>
					</div>

					<pre>
						<code className={codeClassName}>{code}</code>
					</pre>
				</>
			)}
		</div>
	);
}
