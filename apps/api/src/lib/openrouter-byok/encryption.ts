import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const VERSION = 1;

type EncryptedOpenRouterApiKeyPayload = {
	v: typeof VERSION;
	alg: typeof ALGORITHM;
	iv: string;
	tag: string;
	ciphertext: string;
};

function deriveEncryptionKey(secret: string): Buffer {
	const normalizedSecret = secret.trim();
	if (!normalizedSecret) {
		throw new Error("API_KEY_SECRET is required to encrypt OpenRouter keys.");
	}

	return createHash("sha256")
		.update("cossistant:openrouter-byok:v1")
		.update(normalizedSecret)
		.digest()
		.subarray(0, KEY_BYTES);
}

function encode(buffer: Buffer): string {
	return buffer.toString("base64url");
}

function decode(value: string): Buffer {
	return Buffer.from(value, "base64url");
}

export function encryptOpenRouterApiKey(params: {
	apiKey: string;
	secret: string;
}): string {
	const key = deriveEncryptionKey(params.secret);
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(params.apiKey, "utf8"),
		cipher.final(),
	]);
	const payload: EncryptedOpenRouterApiKeyPayload = {
		v: VERSION,
		alg: ALGORITHM,
		iv: encode(iv),
		tag: encode(cipher.getAuthTag()),
		ciphertext: encode(ciphertext),
	};

	return JSON.stringify(payload);
}

export function decryptOpenRouterApiKey(params: {
	encryptedApiKey: string;
	secret: string;
}): string {
	const key = deriveEncryptionKey(params.secret);
	const payload = JSON.parse(
		params.encryptedApiKey
	) as Partial<EncryptedOpenRouterApiKeyPayload>;

	if (
		payload.v !== VERSION ||
		payload.alg !== ALGORITHM ||
		typeof payload.iv !== "string" ||
		typeof payload.tag !== "string" ||
		typeof payload.ciphertext !== "string"
	) {
		throw new Error("Invalid encrypted OpenRouter key payload.");
	}

	const decipher = createDecipheriv(ALGORITHM, key, decode(payload.iv));
	decipher.setAuthTag(decode(payload.tag));

	return Buffer.concat([
		decipher.update(decode(payload.ciphertext)),
		decipher.final(),
	]).toString("utf8");
}

export function maskOpenRouterApiKey(apiKey: string): string {
	const trimmed = apiKey.trim();
	if (trimmed.length <= 12) {
		return `${trimmed.slice(0, 3)}...${trimmed.slice(-3)}`;
	}

	return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`;
}
