export function getAPIBaseUrl(path: `/${string}`) {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8787";
  return `${baseUrl}/api${path}`;
}

export function getTRPCUrl() {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8787";
  return `${baseUrl}/trpc`;
}

export function getWaitlistUrl(referralId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return `${baseUrl}/j/${referralId}`;
}

export function getLandingBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  return baseUrl;
}
