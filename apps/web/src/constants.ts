export const SELECTED_WEBSITE_COOKIE_NAME = "plasma-selected-website";

export const GITHUB_URL = "https://github.com/plasma-pandora/plasma-pandora";
export const DISCORD_INVITE = "https://discord.gg/vQkPjgvzcc";
export const X_URL = "https://x.com/plasmapandora";

export const ANTHONY_AVATAR = "/anthony-picture.jpg";

export const BASE_URL =
	process.env.NODE_ENV === "development" ||
	!process.env.VERCEL_PROJECT_PRODUCTION_URL
		? new URL("http://localhost:3000")
		: new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
