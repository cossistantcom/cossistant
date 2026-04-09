import type React from "react";

type ThemeWrapperProps = {
	theme?: "light" | "dark";
	children: React.ReactNode;
};

/**
 * Applies theme data attribute when dark mode is requested.
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

	// Light or undefined - render children directly to inherit theme from parent
	return <>{children}</>;
};
