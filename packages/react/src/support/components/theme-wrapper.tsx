import type React from "react";

type ThemeWrapperProps = {
	theme?: "light" | "dark";
	children: React.ReactNode;
};

/**
 * Applies a color-scheme marker when a theme is forced.
 * Omit theme for automatic detection from parent elements.
 */
export const ThemeWrapper: React.FC<ThemeWrapperProps> = ({
	theme,
	children,
}) => {
	if (theme === "dark") {
		return (
			<div className="dark" data-color-scheme="dark">
				{children}
			</div>
		);
	}

	if (theme === "light") {
		// The stylesheet excludes light-forced subtrees from the .dark palette
		return <div data-color-scheme="light">{children}</div>;
	}

	// Undefined - render children directly to inherit theme from parent
	return <>{children}</>;
};
