import path from "node:path";

import { env } from "@api/env";
import {
	DeleteObjectsCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { GenerateUploadUrlRequest } from "@plasma/types/api/upload";
import { ulid } from "ulid";

const LEADING_DOT_PATTERN = /^\./;
const CDN_PREFIX = "cdn";
const TRAILING_SLASHES_PATTERN = /\/+$/;
const LEADING_SLASHES_PATTERN = /^\/+/;

const endpoint =
	env.S3_ENDPOINT.trim().length > 0 ? env.S3_ENDPOINT : undefined;
const forcePathStyle = env.S3_FORCE_PATH_STYLE;
const cdnBaseUrl = env.S3_CDN_BASE_URL.trim();
const publicBaseUrl = env.S3_PUBLIC_BASE_URL.trim();

export const s3Client = new S3Client({
	region: env.S3_REGION,
	credentials: {
		accessKeyId: env.S3_ACCESS_KEY_ID,
		secretAccessKey: env.S3_SECRET_ACCESS_KEY,
	},
	endpoint,
	forcePathStyle,
});

function sanitizeSegmentsFromInput(input: string | undefined): string[] {
	if (!input) {
		return [];
	}

	return input
		.replace(/\\/g, "/")
		.split("/")
		.map((segment) => segment.trim())
		.filter(
			(segment) => segment.length > 0 && segment !== "." && segment !== ".."
		)
		.map((segment) => segment.replace(/[^a-zA-Z0-9_.-]/g, "-"))
		.filter((segment) => segment.length > 0);
}

function sanitizeFileName(fileName: string | undefined): string {
	if (!fileName) {
		return ulid();
	}

	const cleaned = fileName.replace(/[\\/]/g, "").trim();
	const sanitized = cleaned.replace(/[^a-zA-Z0-9_.-]/g, "-");

	return sanitized.length > 0 ? sanitized : ulid();
}

function sanitizeExtension(extension: string | undefined): string | null {
	if (!extension) {
		return null;
	}

	const trimmed = extension.trim().replace(LEADING_DOT_PATTERN, "");
	const sanitized = trimmed.replace(/[^a-zA-Z0-9]/g, "");

	if (sanitized.length === 0) {
		return null;
	}

	return `.${sanitized.toLowerCase()}`;
}

export type UploadScope = GenerateUploadUrlRequest["scope"];

export type GenerateUploadUrlOptions = {
	contentType: string;
	scope: UploadScope;
	path?: string;
	fileName?: string;
	fileExtension?: string;
	expiresInSeconds?: number;
	useCdn?: boolean;
};

export type GenerateUploadUrlResult = {
	uploadUrl: string;
	key: string;
	bucket: string;
	expiresAt: string;
	contentType: string;
	publicUrl: string;
};

function sanitizeSingleSegment(input: string): string {
	const [sanitized] = sanitizeSegmentsFromInput(input);

	if (!sanitized) {
		throw new Error("Unable to sanitize segment for S3 key generation");
	}

	return sanitized;
}

function joinUrl(baseUrl: string, suffix: string): string {
	const normalizedBase = baseUrl.replace(TRAILING_SLASHES_PATTERN, "");
	const normalizedSuffix = suffix.replace(LEADING_SLASHES_PATTERN, "");

	return `${normalizedBase}/${normalizedSuffix}`;
}

function removeCdnPrefix(key: string): string {
	const cdnPrefixWithSlash = `${CDN_PREFIX}/`;

	return key.startsWith(cdnPrefixWithSlash)
		? key.slice(cdnPrefixWithSlash.length)
		: key;
}

function stripQueryFromUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.search = "";
		parsed.hash = "";

		return parsed.toString();
	} catch {
		const [base] = url.split("?");
		return base ?? url;
	}
}

function buildPublicReadUrl(
	key: string,
	uploadUrl: string,
	useCdn: boolean
): string {
	if (useCdn && cdnBaseUrl.length > 0) {
		return joinUrl(cdnBaseUrl, removeCdnPrefix(key));
	}

	if (publicBaseUrl.length > 0) {
		return joinUrl(publicBaseUrl, key);
	}

	return stripQueryFromUrl(uploadUrl);
}

function buildScopeBaseSegments(scope: UploadScope, useCdn: boolean): string[] {
	const segments: string[] = [];

	if (useCdn) {
		segments.push(CDN_PREFIX);
	}

	segments.push(
		sanitizeSingleSegment(scope.organizationId),
		sanitizeSingleSegment(scope.websiteId)
	);

	switch (scope.type) {
		case "conversation":
			segments.push(sanitizeSingleSegment(scope.conversationId));
			break;
		case "user":
			segments.push(sanitizeSingleSegment(scope.userId));
			break;
		case "contact":
			segments.push(sanitizeSingleSegment(scope.contactId));
			break;
		case "visitor":
			segments.push(sanitizeSingleSegment(scope.visitorId));
			break;
		default: {
			const exhaustiveCheck: never = scope;
			throw new Error(
				`Unsupported upload scope encountered: ${JSON.stringify(exhaustiveCheck)}`
			);
		}
	}

	return segments;
}

export async function generateUploadUrl(
	options: GenerateUploadUrlOptions
): Promise<GenerateUploadUrlResult> {
	const useCdn = Boolean(options.useCdn);
	const baseSegments = buildScopeBaseSegments(options.scope, useCdn);
	const normalizedPathSegments = sanitizeSegmentsFromInput(options.path);

	const allSegments = [...baseSegments, ...normalizedPathSegments];

	const sanitizedFileName = sanitizeFileName(options.fileName);
	const extension = sanitizeExtension(options.fileExtension);

	const finalFileName = extension
		? sanitizedFileName.endsWith(extension)
			? sanitizedFileName
			: `${sanitizedFileName}${extension}`
		: sanitizedFileName;

	const objectKey = path.posix.join(...allSegments, finalFileName);

	const expiresIn =
		options.expiresInSeconds ?? env.S3_SIGNED_URL_EXPIRATION_SECONDS;

	const command = new PutObjectCommand({
		Bucket: env.S3_BUCKET_NAME,
		Key: objectKey,
		ContentType: options.contentType,
	});

	try {
		const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

		return {
			uploadUrl,
			key: objectKey,
			bucket: env.S3_BUCKET_NAME,
			expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
			contentType: options.contentType,
			publicUrl: buildPublicReadUrl(objectKey, uploadUrl, useCdn),
		};
	} catch (error) {
		throw new Error(
			`Failed to generate signed upload URL: ${error instanceof Error ? error.message : "Unknown error"}`,
			{ cause: error }
		);
	}
}

async function deleteByPrefix(prefix: string): Promise<number> {
	let continuationToken: string | undefined;
	let deletedCount = 0;

	do {
		const listResponse = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: env.S3_BUCKET_NAME,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			})
		);

		const objects = (listResponse.Contents ?? [])
			.map((entry) => entry.Key)
			.filter((key): key is string => Boolean(key))
			.map((key) => ({ Key: key }));

		if (objects.length > 0) {
			const deleteResponse = await s3Client.send(
				new DeleteObjectsCommand({
					Bucket: env.S3_BUCKET_NAME,
					Delete: { Objects: objects, Quiet: true },
				})
			);

			deletedCount += deleteResponse.Deleted?.length ?? 0;
		}

		continuationToken = listResponse.IsTruncated
			? listResponse.NextContinuationToken
			: undefined;
	} while (continuationToken);

	return deletedCount;
}

async function calculateSizeByPrefix(prefix: string): Promise<number> {
	let continuationToken: string | undefined;
	let totalSize = 0;

	do {
		const listResponse = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: env.S3_BUCKET_NAME,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			})
		);

		totalSize += (listResponse.Contents ?? []).reduce(
			(accumulator, entry) => accumulator + (entry.Size ?? 0),
			0
		);

		continuationToken = listResponse.IsTruncated
			? listResponse.NextContinuationToken
			: undefined;
	} while (continuationToken);

	return totalSize;
}

function buildPrefixes(
	organizationId: string,
	websiteId?: string,
	leafId?: string
): string[] {
	const organizationSegment = sanitizeSingleSegment(organizationId);
	const websiteSegment = websiteId
		? sanitizeSingleSegment(websiteId)
		: undefined;
	const leafSegment = leafId ? sanitizeSingleSegment(leafId) : undefined;

	const basePath = [organizationSegment, websiteSegment, leafSegment]
		.filter((segment): segment is string => Boolean(segment))
		.join("/");

	const prefixes = [] as string[];

	if (basePath.length > 0) {
		prefixes.push(`${basePath}/`);
		prefixes.push(`${CDN_PREFIX}/${basePath}/`);
	} else {
		prefixes.push("");
	}

	return prefixes;
}

export async function deleteOrganizationFiles(
	organizationId: string
): Promise<number> {
	const prefixes = buildPrefixes(organizationId);
	let deleted = 0;

	for (const prefix of prefixes) {
		deleted += await deleteByPrefix(prefix);
	}

	return deleted;
}

export async function deleteWebsiteFiles(params: {
	organizationId: string;
	websiteId: string;
}): Promise<number> {
	const prefixes = buildPrefixes(params.organizationId, params.websiteId);
	let deleted = 0;

	for (const prefix of prefixes) {
		deleted += await deleteByPrefix(prefix);
	}

	return deleted;
}

export async function deleteConversationFiles(params: {
	organizationId: string;
	websiteId: string;
	conversationId: string;
}): Promise<number> {
	const prefixes = buildPrefixes(
		params.organizationId,
		params.websiteId,
		params.conversationId
	);
	let deleted = 0;

	for (const prefix of prefixes) {
		deleted += await deleteByPrefix(prefix);
	}

	return deleted;
}

export async function deleteVisitorFiles(params: {
	organizationId: string;
	websiteId: string;
	visitorId: string;
}): Promise<number> {
	const prefixes = buildPrefixes(
		params.organizationId,
		params.websiteId,
		params.visitorId
	);
	let deleted = 0;

	for (const prefix of prefixes) {
		deleted += await deleteByPrefix(prefix);
	}

	return deleted;
}

export async function deleteContactFiles(params: {
	organizationId: string;
	websiteId: string;
	contactId: string;
}): Promise<number> {
	const prefixes = buildPrefixes(
		params.organizationId,
		params.websiteId,
		params.contactId
	);
	let deleted = 0;

	for (const prefix of prefixes) {
		deleted += await deleteByPrefix(prefix);
	}

	return deleted;
}

export async function getWebsiteUsageBytes(params: {
	organizationId: string;
	websiteId: string;
}): Promise<number> {
	const prefixes = buildPrefixes(params.organizationId, params.websiteId);
	let total = 0;

	for (const prefix of prefixes) {
		total += await calculateSizeByPrefix(prefix);
	}

	return total;
}
