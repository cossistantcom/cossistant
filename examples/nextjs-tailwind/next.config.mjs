/** @type {import('next').NextConfig} */
const nextConfig = {
	allowedDevOrigins: ["localhost", "127.0.0.1"],
	reactStrictMode: true,
	transpilePackages: [
		"@cossistant/core",
		"@cossistant/react",
		"@cossistant/next",
		"@cossistant/types",
	],
	devIndicators: false,
};

export default nextConfig;
