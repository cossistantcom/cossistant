/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	transpilePackages: [
		"@plasma/core",
		"@plasma/react",
		"@plasma/next",
		"@plasma/types",
	],
	devIndicators: false,
};

export default nextConfig;
