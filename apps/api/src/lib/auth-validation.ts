import type { Database } from "@api/db";
import {
	type ApiKeyWithWebsiteAndOrganization,
	getApiKeyByKey,
} from "@api/db/queries/api-keys";
import { env } from "@api/env";
import {
	hashApiKey,
	isValidPublicApiKeyFormat,
	isValidSecretApiKeyFormat,
} from "@api/utils/api-keys";

// Enable auth logging by setting ENABLE_AUTH_LOGS=true
const AUTH_LOGS_ENABLED = process.env.ENABLE_AUTH_LOGS === "true";

export type AuthValidationOptions = {
	origin?: string;
	protocol?: string;
	hostname?: string;
};

export type AuthValidationResult = {
	apiKey: ApiKeyWithWebsiteAndOrganization;
	isTestKey: boolean;
};

export class AuthValidationError extends Error {
	statusCode: number;

	constructor(statusCode: number, message: string) {
		super(message);
		this.name = "AuthValidationError";
		this.statusCode = statusCode;
	}
}

/**
 * Get API key from database (leverages Redis cache via .$withCache)
 */
async function getApiKeyFromRedis(
	key: string,
	db: Database
): Promise<ApiKeyWithWebsiteAndOrganization | null> {
	// Direct call to DB query which has Redis caching built-in via .$withCache({ tag: "api-key" })
	// This is shared across all API instances and provides sub-ms responses
	return await getApiKeyByKey(db, { key });
}

/**
 * Check if an API key is a test key
 */
export function isTestApiKey(key: string): boolean {
	return key.includes("_test_");
}

/**
 * Validate that a domain is in the whitelist
 */
export function validateDomain(
	requestDomain: string,
	whitelistedDomains: string[]
): boolean {
	return whitelistedDomains.some((domain) => {
		let domainToCheck = domain;

		// Handle full URLs by extracting hostname
		if (domain.includes("://")) {
			try {
				const url = new URL(domain);
				domainToCheck = url.hostname;
			} catch {
				// If URL parsing fails, use the domain as-is
				domainToCheck = domain;
			}
		}

		if (AUTH_LOGS_ENABLED) {
			console.log(
				`[AUTH] Checking domain: "${requestDomain}" against "${domainToCheck}" (original: "${domain}")`
			);
		}

		if (domainToCheck.startsWith("*.")) {
			const baseDomain = domainToCheck.slice(2);
			const isMatch =
				requestDomain === baseDomain ||
				requestDomain.endsWith(`.${baseDomain}`);
			if (AUTH_LOGS_ENABLED) {
				console.log(`[AUTH] Wildcard match for "${baseDomain}": ${isMatch}`);
			}
			return isMatch;
		}

		const isMatch = requestDomain === domainToCheck;
		if (AUTH_LOGS_ENABLED) {
			console.log(`[AUTH] Exact match: ${isMatch}`);
		}
		return isMatch;
	});
}

/**
 * Validate the origin header
 */
export function validateOriginHeader(origin: string | undefined): string {
	if (!origin) {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Origin header missing");
		}
		throw new AuthValidationError(
			403,
			"Origin header is required for public key authentication. This API key can only be used from browser environments."
		);
	}

	if (origin === "null") {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Null origin detected");
		}
		throw new AuthValidationError(
			403,
			"Requests from null origin are not allowed for public key authentication"
		);
	}

	return origin;
}

/**
 * Parse and validate origin URL
 */
export function parseAndValidateOriginUrl(origin: string): {
	hostname: string;
	protocol: string;
} {
	let hostname: string;
	let protocol: string;

	try {
		const url = new URL(origin);
		hostname = url.hostname;
		protocol = url.protocol;

		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Parsed origin:", {
				protocol: url.protocol,
				hostname: url.hostname,
				port: url.port,
			});
		}

		if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
			if (AUTH_LOGS_ENABLED) {
				console.log("[AUTH] Invalid protocol:", url.protocol);
			}
			throw new AuthValidationError(
				403,
				"Only HTTP, HTTPS, WS, and WSS origins are allowed"
			);
		}
	} catch (error) {
		if (error instanceof AuthValidationError) {
			throw error;
		}
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Failed to parse origin:", error);
		}
		throw new AuthValidationError(403, "Invalid origin header format");
	}

	return { hostname, protocol };
}

/**
 * Check if hostname is localhost or private IP
 */
function isLocalhostOrPrivateIP(hostname: string): boolean {
	const localhostPatterns = ["localhost", "127.0.0.1", "[::1]"];
	const privateIPPrefixes = ["192.168.", "10.", "172."];

	return (
		localhostPatterns.includes(hostname) ||
		privateIPPrefixes.some((prefix) => hostname.startsWith(prefix))
	);
}

/**
 * Validate HTTPS requirement for non-test keys
 */
export function validateHttpsRequirement(
	apiKey: string,
	protocol: string,
	hostname: string
): void {
	// Test keys skip all validation
	if (isTestApiKey(apiKey)) {
		return;
	}

	// Development mode skips validation
	if (process.env.NODE_ENV !== "production") {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Development mode - allowing non-test API key from:", {
				hostname,
				protocol,
			});
		}
		return;
	}

	// Production validation
	const isSecure = protocol === "https:" || protocol === "wss:";
	if (!isSecure) {
		if (AUTH_LOGS_ENABLED) {
			console.log(
				"[AUTH] Non-test API key used with insecure protocol:",
				protocol
			);
		}
		throw new AuthValidationError(
			403,
			"Production API keys can only be used over HTTPS/WSS connections"
		);
	}

	if (isLocalhostOrPrivateIP(hostname)) {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Non-test API key used from localhost:", hostname);
		}
		throw new AuthValidationError(
			403,
			"Production API keys cannot be used from localhost. Please use a test API key for local development."
		);
	}
}

/**
 * Validate origin for public key authentication
 */
export function validateOriginForPublicKey(
	apiKey: ApiKeyWithWebsiteAndOrganization,
	options: AuthValidationOptions
): void {
	if (!apiKey.website) {
		if (AUTH_LOGS_ENABLED) {
			console.log(
				"[AUTH] No website associated with API key, skipping origin validation"
			);
		}
		return;
	}

	const { origin } = options;

	if (AUTH_LOGS_ENABLED) {
		console.log("[AUTH] Origin validation:", {
			origin,
			websiteId: apiKey.website.id,
			whitelistedDomains: apiKey.website.whitelistedDomains,
		});
	}

	const validatedOrigin = validateOriginHeader(origin);
	const { hostname, protocol } = parseAndValidateOriginUrl(validatedOrigin);

	// Validate HTTPS requirement for non-test keys
	validateHttpsRequirement(apiKey.key, protocol, hostname);

	const isWhitelisted = validateDomain(
		hostname,
		apiKey.website.whitelistedDomains
	);

	if (AUTH_LOGS_ENABLED) {
		console.log("[AUTH] Domain validation:", {
			hostname,
			whitelistedDomains: apiKey.website.whitelistedDomains,
			isWhitelisted,
		});
	}

	if (!isWhitelisted) {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Domain not whitelisted:", {
				hostname,
				whitelistedDomains: apiKey.website.whitelistedDomains,
			});
		}
		throw new AuthValidationError(
			403,
			`Domain ${hostname} is not whitelisted for this API key`
		);
	}

	// Additional security: Log suspicious requests for monitoring
	if (process.env.NODE_ENV === "production" && !AUTH_LOGS_ENABLED) {
		console.log(
			`Public key used from origin: ${validatedOrigin}, domain: ${hostname}`
		);
	}

	if (AUTH_LOGS_ENABLED) {
		console.log("[AUTH] Origin validation successful");
	}
}

/**
 * Authenticate with a private API key
 */
export async function authenticateWithPrivateKey(
	privateKey: string,
	db: Database
): Promise<ApiKeyWithWebsiteAndOrganization | null> {
	if (!isValidSecretApiKeyFormat(privateKey)) {
		throw new AuthValidationError(401, "Invalid private API key format");
	}

	// Private keys are HMAC-hashed before storage, so hash before lookup
	const hashedKey = hashApiKey(privateKey, env.API_KEY_SECRET);
	return await getApiKeyFromRedis(hashedKey, db);
}

/**
 * Authenticate with a public API key
 */
export async function authenticateWithPublicKey(
	publicKey: string,
	db: Database,
	options: AuthValidationOptions
): Promise<ApiKeyWithWebsiteAndOrganization | null> {
	if (AUTH_LOGS_ENABLED) {
		console.log("[AUTH] Validating public key format:", {
			publicKey: `${publicKey.substring(0, 10)}...`,
			isValid: isValidPublicApiKeyFormat(publicKey),
		});
	}

	if (!isValidPublicApiKeyFormat(publicKey)) {
		throw new AuthValidationError(401, "Invalid public API key format");
	}

	if (AUTH_LOGS_ENABLED) {
		console.log("[AUTH] Looking up API key in database/cache");
	}

	const apiKey = await getApiKeyFromRedis(publicKey, db);

	if (AUTH_LOGS_ENABLED) {
		console.log("[AUTH] API key lookup result:", {
			found: !!apiKey,
			apiKeyId: apiKey?.id,
			websiteId: apiKey?.website?.id,
			organizationId: apiKey?.organization?.id,
		});
	}

	if (apiKey) {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Validating origin for public key");
		}
		validateOriginForPublicKey(apiKey, options);
	}

	return apiKey;
}

/**
 * Perform authentication with either private or public key
 */
export async function performAuthentication(
	privateKey: string | undefined,
	publicKey: string | undefined,
	db: Database,
	options: AuthValidationOptions
): Promise<AuthValidationResult> {
	let apiKey: ApiKeyWithWebsiteAndOrganization | null = null;
	let usedKey: string | undefined;

	if (privateKey) {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Using private key authentication");
		}
		apiKey = await authenticateWithPrivateKey(privateKey, db);
		usedKey = privateKey;
	} else if (publicKey) {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] Using public key authentication");
		}
		apiKey = await authenticateWithPublicKey(publicKey, db, options);
		usedKey = publicKey;
	} else {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] No API key provided");
		}
		throw new AuthValidationError(401, "API key is required");
	}

	if (!apiKey) {
		if (AUTH_LOGS_ENABLED) {
			console.log("[AUTH] API key not found in database");
		}
		throw new AuthValidationError(401, "Invalid API key");
	}

	if (AUTH_LOGS_ENABLED) {
		console.log("[AUTH] Authentication successful:", {
			apiKeyId: apiKey.id,
			organizationId: apiKey.organization.id,
			websiteId: apiKey.website?.id,
			websiteName: apiKey.website?.name,
			whitelistedDomains: apiKey.website?.whitelistedDomains,
		});
	}

	return {
		apiKey,
		isTestKey: usedKey ? isTestApiKey(usedKey) : false,
	};
}
