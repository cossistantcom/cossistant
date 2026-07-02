"use client";

import * as React from "react";
import {
	COMMAND_PACKAGE_MANAGERS,
	COMMAND_PREFERENCE_EVENT,
	COMMAND_PREFERENCE_STORAGE_KEY,
	type CommandPackageManager,
	type CommandVariants,
	DEFAULT_PACKAGE_MANAGER,
	isCommandPackageManager,
} from "./command-block-utils";

export type TimelineCommandBlockRenderState = {
	commands: CommandVariants;
	packageManagers: readonly CommandPackageManager[];
	activePackageManager: CommandPackageManager;
	activeCommand: string;
	setPackageManager: (packageManager: CommandPackageManager) => void;
	hasCopied: boolean;
	onCopy: () => Promise<boolean>;
};

export type TimelineCommandBlockProps = {
	commands: CommandVariants;
	className?: string;
	children?: (state: TimelineCommandBlockRenderState) => React.ReactNode;
};

function readStoredPackageManager(): CommandPackageManager {
	if (typeof window === "undefined") {
		return DEFAULT_PACKAGE_MANAGER;
	}

	const storedValue = window.localStorage.getItem(
		COMMAND_PREFERENCE_STORAGE_KEY
	);
	if (storedValue && isCommandPackageManager(storedValue)) {
		return storedValue;
	}

	return DEFAULT_PACKAGE_MANAGER;
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
 * Shared command block UI with package-manager tabs and copy action.
 */
export function TimelineCommandBlock({
	commands,
	className,
	children,
}: TimelineCommandBlockProps): React.ReactElement {
	// Start from the default on both server and first client render (SSR
	// hydration safety); the mount effect below applies the stored preference
	const [packageManager, setPackageManager] =
		React.useState<CommandPackageManager>(DEFAULT_PACKAGE_MANAGER);
	const [hasCopied, setHasCopied] = React.useState(false);

	React.useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		setPackageManager(readStoredPackageManager());

		const onStorageChange = (event: StorageEvent) => {
			if (event.key !== COMMAND_PREFERENCE_STORAGE_KEY) {
				return;
			}

			if (event.newValue && isCommandPackageManager(event.newValue)) {
				setPackageManager(event.newValue);
			}
		};

		const onPreferenceEvent = (event: Event) => {
			const nextValue = (event as CustomEvent<CommandPackageManager>).detail;
			if (nextValue && isCommandPackageManager(nextValue)) {
				setPackageManager(nextValue);
			}
		};

		window.addEventListener("storage", onStorageChange);
		window.addEventListener(
			COMMAND_PREFERENCE_EVENT,
			onPreferenceEvent as EventListener
		);

		return () => {
			window.removeEventListener("storage", onStorageChange);
			window.removeEventListener(
				COMMAND_PREFERENCE_EVENT,
				onPreferenceEvent as EventListener
			);
		};
	}, []);

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

	const setPackageManagerPreference = React.useCallback(
		(nextValue: CommandPackageManager) => {
			setPackageManager(nextValue);

			if (typeof window === "undefined") {
				return;
			}

			window.localStorage.setItem(COMMAND_PREFERENCE_STORAGE_KEY, nextValue);
			window.dispatchEvent(
				new CustomEvent<CommandPackageManager>(COMMAND_PREFERENCE_EVENT, {
					detail: nextValue,
				})
			);
		},
		[]
	);

	const activeCommand = commands[packageManager];

	const onCopy = React.useCallback(async () => {
		const didCopy = await copyToClipboard(activeCommand);
		if (didCopy) {
			setHasCopied(true);
		}

		return didCopy;
	}, [activeCommand]);

	const renderState: TimelineCommandBlockRenderState = {
		commands,
		packageManagers: COMMAND_PACKAGE_MANAGERS,
		activePackageManager: packageManager,
		activeCommand,
		setPackageManager: setPackageManagerPreference,
		hasCopied,
		onCopy,
	};

	return (
		<div className={className} data-co-command-block="">
			{typeof children === "function" ? (
				children(renderState)
			) : (
				<>
					<div>
						<div>
							{COMMAND_PACKAGE_MANAGERS.map((manager) => (
								<button
									key={manager}
									onClick={() => setPackageManagerPreference(manager)}
									type="button"
								>
									{manager}
								</button>
							))}
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
						<code className="language-bash">{activeCommand}</code>
					</pre>
				</>
			)}
		</div>
	);
}
