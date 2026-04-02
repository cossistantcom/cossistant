const COSSISTANT_FACEHASH_PALETTE = [
	{
		className: "dark:bg-plasma-pink/90 bg-plasma-pink/40",
		routeColor: "hsla(314, 100%, 85%, 1)",
	},
	{
		className: "dark:bg-plasma-yellow/90 bg-plasma-yellow/40",
		routeColor: "hsla(58, 92%, 79%, 1)",
	},
	{
		className: "dark:bg-plasma-blue/90 bg-plasma-blue/40",
		routeColor: "hsla(218, 91%, 78%, 1)",
	},
	{
		className: "dark:bg-plasma-orange/90 bg-plasma-orange/40",
		routeColor: "hsla(19, 99%, 50%, 1)",
	},
	{
		className: "dark:bg-plasma-green/90 bg-plasma-green/40",
		routeColor: "hsla(156, 86%, 64%, 1)",
	},
] as const;

export const COSSISTANT_FACEHASH_COLOR_CLASSES =
	COSSISTANT_FACEHASH_PALETTE.map((entry) => entry.className);

export const COSSISTANT_FACEHASH_ROUTE_COLORS_DARK =
	COSSISTANT_FACEHASH_PALETTE.map((entry) => entry.routeColor);
