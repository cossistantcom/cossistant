import { z } from "@hono/zod-openapi";
import { APIKeyType, WebsiteInstallationTarget, WebsiteStatus } from "../enums";
import { apiTimestampSchema, nullableApiTimestampSchema } from "./common";
import { userResponseSchema } from "./user";
import { publicVisitorResponseSchema } from "./visitor";

/**
 * Website creation request schema
 */
export const createWebsiteRequestSchema = z.object({
	name: z
		.string()
		.openapi({
			description: "The website's name.",
			example: "Dub",
		})
		.min(3, {
			message: "Name must be at least 3 characters",
		})
		.max(30, {
			message: "Name must be less than 30 characters",
		}),
	domain: z
		.string()
		.regex(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
		.openapi({
			description: "The website's domain.",
			example: "dub.co",
		}),
	organizationId: z.ulid().openapi({
		description: "The organization's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	installationTarget: z.nativeEnum(WebsiteInstallationTarget).openapi({
		description: "The website's library installation target.",
		example: WebsiteInstallationTarget.NEXTJS,
	}),
});

export type CreateWebsiteRequest = z.infer<typeof createWebsiteRequestSchema>;

const API_KEY_TYPE_VALUES = [APIKeyType.PUBLIC, APIKeyType.PRIVATE] as const;

const WEBSITE_STATUS_VALUES = [
	WebsiteStatus.ACTIVE,
	WebsiteStatus.INACTIVE,
] as const;

const OPENROUTER_BYOK_STATUS_VALUES = [
	"unchecked",
	"valid",
	"invalid",
] as const;

export const websiteApiKeySchema = z
	.object({
		id: z.ulid().openapi({
			description: "The API key's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		name: z.string().openapi({
			description: "The API key's display name.",
			example: "Production public key",
		}),
		key: z.string().nullable().openapi({
			description:
				"The API key's raw value when available. Private keys will be null when fetched after creation.",
			example: "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		}),
		keyType: z.enum(API_KEY_TYPE_VALUES).openapi({
			description: "The API key's type (public or private).",
			example: APIKeyType.PUBLIC,
		}),
		isTest: z.boolean().openapi({
			description: "Whether the API key is a test key.",
			example: false,
		}),
		isActive: z.boolean().openapi({
			description: "Whether the API key is active.",
			example: true,
		}),
		createdAt: apiTimestampSchema.openapi({
			description: "Timestamp indicating when the API key was created.",
			example: "2024-01-01T00:00:00.000Z",
		}),
		lastUsedAt: nullableApiTimestampSchema.openapi({
			description: "Timestamp indicating when the API key was last used.",
			example: "2024-01-10T12:00:00.000Z",
		}),
		revokedAt: nullableApiTimestampSchema.openapi({
			description:
				"Timestamp indicating when the API key was revoked, if applicable.",
			example: null,
		}),
		linkedUserId: z.ulid().nullable().openapi({
			description:
				"Optional teammate linked to this private key. Linked private keys act as that teammate on actor-required API routes.",
			example: "01JG000000000000000000001",
		}),
		linkedUser: userResponseSchema.nullable().openapi({
			description:
				"Website-access teammate linked to this private key, if one is configured.",
		}),
	})
	.openapi({
		description: "A website API key summary.",
	});

export type WebsiteApiKey = z.infer<typeof websiteApiKeySchema>;

export const websiteOpenRouterByokSettingsSchema = z
	.object({
		enabled: z.boolean().openapi({
			description:
				"Whether this website is configured to use its saved OpenRouter key.",
			example: true,
		}),
		hasKey: z.boolean().openapi({
			description: "Whether an encrypted OpenRouter key is saved.",
			example: true,
		}),
		maskedKey: z.string().nullable().openapi({
			description: "A non-sensitive preview of the saved key.",
			example: "sk-or-v1...abc123",
		}),
		lastConnectionStatus: z.enum(OPENROUTER_BYOK_STATUS_VALUES).openapi({
			description: "The latest non-secret status recorded for this key.",
			example: "unchecked",
		}),
		lastErrorCode: z.string().nullable().openapi({
			description: "A non-secret error summary from the latest failed call.",
			example: "provider_error",
		}),
		lastCheckedAt: nullableApiTimestampSchema.openapi({
			description: "Timestamp for the latest status check.",
			example: null,
		}),
		fallbackPausedUntil: nullableApiTimestampSchema.openapi({
			description:
				"Timestamp until which Cossistant bypasses this saved key after confirmed BYOK failures.",
			example: null,
		}),
		updatedAt: nullableApiTimestampSchema.openapi({
			description: "Timestamp for the latest BYOK config update.",
			example: "2024-01-10T12:00:00.000Z",
		}),
		featureAvailable: z.boolean().openapi({
			description: "Whether the current plan can use OpenRouter BYOK.",
			example: true,
		}),
		requiredPlan: z.literal("pro").openapi({
			description: "The minimum hosted plan required for this feature.",
			example: "pro",
		}),
	})
	.openapi({
		description:
			"Website OpenRouter BYOK settings without exposing the plaintext key.",
	});

export type WebsiteOpenRouterByokSettings = z.infer<
	typeof websiteOpenRouterByokSettingsSchema
>;

export const websiteSummarySchema = z
	.object({
		id: z.ulid().openapi({
			description: "The website's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		slug: z.string().openapi({
			description: "The website's slug.",
			example: "dub-co",
		}),
		name: z.string().openapi({
			description: "The website's name.",
			example: "Dub",
		}),
		domain: z.string().openapi({
			description: "The website's domain.",
			example: "dub.co",
		}),
		contactEmail: z.string().email().nullable().openapi({
			description: "The primary email visitors can use to reach you.",
			example: "support@dub.co",
		}),
		logoUrl: z.url().nullable().openapi({
			description: "Public URL to the website's logo.",
			example: "https://cdn.example.com/logo.png",
		}),
		organizationId: z.ulid().openapi({
			description: "The owning organization's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		defaultLanguage: z.string().default("en").openapi({
			description: "The website's default working language.",
			example: "en",
		}),
		autoTranslateEnabled: z.boolean().default(true).openapi({
			description:
				"Whether automatic translation flows are enabled for this website.",
			example: true,
		}),
		whitelistedDomains: z.array(z.url()).openapi({
			description: "The domains allowed to use the website's public keys.",
			example: ["https://dub.co", "http://localhost:3000"],
		}),
		defaultParticipantIds: z
			.array(z.string())
			.nullable()
			.openapi({
				description:
					"Default participant user IDs for new conversations. null = disabled, [] = auto (admin/owner), [...ids] = specific users.",
				example: ["01JG000000000000000000000"],
			}),
	})
	.openapi({
		description: "Summary information for a website used in settings screens.",
	});

export type WebsiteSummary = z.infer<typeof websiteSummarySchema>;

export const websiteDeveloperSettingsResponseSchema = z
	.object({
		website: websiteSummarySchema,
		apiKeys: z.array(websiteApiKeySchema),
		openRouterByok: websiteOpenRouterByokSettingsSchema,
	})
	.openapi({
		description:
			"Developer settings payload including website information and API keys.",
	});

export type WebsiteDeveloperSettingsResponse = z.infer<
	typeof websiteDeveloperSettingsResponseSchema
>;

export const createWebsiteApiKeyRequestSchema = z
	.object({
		organizationId: z.ulid().openapi({
			description: "The organization's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		websiteId: z.ulid().openapi({
			description: "The website's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		name: z.string().min(3).max(80).openapi({
			description: "A human-friendly label for the API key.",
			example: "Docs integration",
		}),
		keyType: z.enum(API_KEY_TYPE_VALUES).openapi({
			description: "The type of API key to generate.",
			example: APIKeyType.PRIVATE,
		}),
		linkedUserId: z.ulid().nullable().optional().openapi({
			description:
				"Optional website teammate to link to this private key. Only supported for private keys and create-only in v1.",
			example: "01JG000000000000000000001",
		}),
		isTest: z.boolean().openapi({
			description: "Whether to generate a test key scoped to localhost.",
			example: false,
		}),
	})
	.openapi({
		description: "Payload to create a website API key.",
	});

export type CreateWebsiteApiKeyRequest = z.infer<
	typeof createWebsiteApiKeyRequestSchema
>;

export const upsertWebsiteOpenRouterApiKeyRequestSchema = z
	.object({
		organizationId: z.ulid().openapi({
			description: "The organization's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		websiteId: z.ulid().openapi({
			description: "The website's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		apiKey: z.string().trim().min(20).max(512).openapi({
			description: "The OpenRouter API key to encrypt and store.",
			example: "sk-or-v1-...",
		}),
	})
	.openapi({
		description: "Payload to save a website OpenRouter BYOK key.",
	});

export type UpsertWebsiteOpenRouterApiKeyRequest = z.infer<
	typeof upsertWebsiteOpenRouterApiKeyRequestSchema
>;

export const setWebsiteOpenRouterByokEnabledRequestSchema = z
	.object({
		organizationId: z.ulid().openapi({
			description: "The organization's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		websiteId: z.ulid().openapi({
			description: "The website's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		enabled: z.boolean().openapi({
			description: "Whether BYOK should be enabled.",
			example: true,
		}),
	})
	.openapi({
		description: "Payload to enable or disable website OpenRouter BYOK.",
	});

export type SetWebsiteOpenRouterByokEnabledRequest = z.infer<
	typeof setWebsiteOpenRouterByokEnabledRequestSchema
>;

export const deleteWebsiteOpenRouterApiKeyRequestSchema = z
	.object({
		organizationId: z.ulid().openapi({
			description: "The organization's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		websiteId: z.ulid().openapi({
			description: "The website's unique identifier.",
			example: "01JG000000000000000000000",
		}),
	})
	.openapi({
		description: "Payload to delete a website OpenRouter BYOK key.",
	});

export type DeleteWebsiteOpenRouterApiKeyRequest = z.infer<
	typeof deleteWebsiteOpenRouterApiKeyRequestSchema
>;

export const websiteTeamMembersResponseSchema = z
	.object({
		members: z.array(userResponseSchema).openapi({
			description:
				"Website teammates that can be linked to private API keys or used as actor IDs.",
		}),
	})
	.openapi({
		description: "List of website-access team members.",
	});

export type WebsiteTeamMembersResponse = z.infer<
	typeof websiteTeamMembersResponseSchema
>;

export const revokeWebsiteApiKeyRequestSchema = z
	.object({
		organizationId: z.ulid().openapi({
			description: "The organization's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		websiteId: z.ulid().openapi({
			description: "The website's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		apiKeyId: z.ulid().openapi({
			description: "The API key's unique identifier.",
			example: "01JG000000000000000000000",
		}),
	})
	.openapi({
		description: "Payload to revoke a website API key.",
	});

export type RevokeWebsiteApiKeyRequest = z.infer<
	typeof revokeWebsiteApiKeyRequestSchema
>;

const websiteUpdateDataSchema = z
	.object({
		name: z.string().min(1).max(120).optional(),
		slug: z.string().min(1).optional(),
		domain: z.string().min(1).optional(),
		contactEmail: z.string().email().nullable().optional(),
		description: z.string().nullable().optional(),
		logoUrl: z.url().nullable().optional(),
		whitelistedDomains: z.array(z.url()).optional(),
		defaultParticipantIds: z.array(z.string()).nullable().optional(),
		defaultLanguage: z.string().min(2).max(20).optional(),
		autoTranslateEnabled: z.boolean().optional(),
		installationTarget: z.nativeEnum(WebsiteInstallationTarget).optional(),
		status: z.enum(WEBSITE_STATUS_VALUES).optional(),
		teamId: z.string().nullable().optional(),
	})
	.refine((value) => Object.keys(value).length > 0, {
		message: "Provide at least one field to update.",
	});

export const updateWebsiteRequestSchema = z
	.object({
		organizationId: z.ulid().openapi({
			description: "The organization's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		websiteId: z.ulid().openapi({
			description: "The website's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		data: websiteUpdateDataSchema.openapi({
			description: "The fields to update on the website.",
		}),
	})
	.openapi({
		description: "Payload to update website settings.",
	});

export type UpdateWebsiteRequest = z.infer<typeof updateWebsiteRequestSchema>;

export const deleteWebsiteRequestSchema = z
	.object({
		websiteSlug: z.string().openapi({
			description: "The website slug.",
			example: "my-website",
		}),
	})
	.openapi({
		description: "Payload to permanently delete a website.",
	});

export type DeleteWebsiteRequest = z.infer<typeof deleteWebsiteRequestSchema>;

export const deleteWebsiteResponseSchema = z
	.object({
		id: z.ulid().openapi({
			description: "The deleted website's unique identifier.",
			example: "01JG000000000000000000000",
		}),
		slug: z.string().openapi({
			description: "The deleted website's slug.",
			example: "my-website",
		}),
	})
	.openapi({
		description: "Response returned after successful website deletion.",
	});

export type DeleteWebsiteResponse = z.infer<typeof deleteWebsiteResponseSchema>;

/**
 * Website creation response schema
 */
export const createWebsiteResponseSchema = z.object({
	id: z.ulid().openapi({
		description: "The website's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	name: z.string().openapi({
		description: "The website's name.",
		example: "Dub",
	}),
	slug: z.string().openapi({
		description: "The website's slug.",
		example: "dubdotco",
	}),
	whitelistedDomains: z.array(z.url()).openapi({
		description: "The website's whitelisted domains.",
		example: ["http://localhost:3000", "https://dub.co"],
	}),
	organizationId: z.ulid().openapi({
		description: "The organization's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	apiKeys: z.array(websiteApiKeySchema).openapi({
		description: "The website's API keys.",
		example: [
			{
				id: "01JG000000000000000000000",
				key: "pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				createdAt: "2021-01-01T00:00:00.000Z",
				isTest: true,
				isActive: true,
				keyType: APIKeyType.PUBLIC,
				lastUsedAt: null,
				revokedAt: null,
			},
		],
	}),
});

export type CreateWebsiteResponse = z.infer<typeof createWebsiteResponseSchema>;

/**
 * Website domain validation request schema
 */
export const checkWebsiteDomainRequestSchema = z.object({
	domain: z
		.string()
		.regex(/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*$/)
		.openapi({
			description: "The website's domain.",
			example: "dub.co",
		}),
});

export type CheckWebsiteDomainRequest = z.infer<
	typeof checkWebsiteDomainRequestSchema
>;

export const availableHumanAgentSchema = z.object({
	/** The agent's unique identifier. */
	id: z.ulid().openapi({
		description: "The human agent's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	/** The agent's display name. */
	name: z.string().nullable().openapi({
		description: "The agent's name.",
		example: "John Doe",
	}),
	/** The agent's email address, used as a fallback avatar identity. */
	email: z.email().nullable().openapi({
		description: "The agent's email address.",
		example: "john@example.com",
	}),
	/** URL to the agent's avatar image. */
	image: z.string().nullable().openapi({
		description: "The agent's avatar URL.",
		example: "https://cossistant.com/avatar.png",
	}),
	/** Timestamp used to determine whether the agent is online. */
	lastSeenAt: nullableApiTimestampSchema.openapi({
		description:
			"The agent's last online timestamp, used to determine if the agent is online. If the agent is offline, this will be null or more than 5 minutes ago.",
		example: "2021-01-01T00:00:00.000Z",
	}),
});

export const AvailableAIAgentSchema = z.object({
	/** The AI agent's unique identifier. */
	id: z.ulid().openapi({
		description: "The AI agent's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	/** The AI agent's display name. */
	name: z.string().openapi({
		description: "The AI agent's name.",
		example: "John Doe",
	}),
	/** URL to the AI agent's avatar image. */
	image: z.string().nullable().openapi({
		description: "The AI agent's avatar URL.",
		example: "https://cossistant.com/avatar.png",
	}),
});

/**
 * Website information response schema
 */
export const publicWebsiteResponseSchema = z.object({
	/** The website's unique identifier. */
	id: z.ulid().openapi({
		description: "The website's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	/** The website's name. */
	name: z.string().openapi({
		description: "The website's name.",
		example: "Dub",
	}),
	/** The website's domain. */
	domain: z.string().openapi({
		description: "The website's domain.",
		example: "dub.co",
	}),
	/** The website's public description. */
	description: z.string().nullable().openapi({
		description: "The website's description.",
		example: "Link management for modern marketing teams.",
	}),
	/** URL to the website's logo. */
	logoUrl: z.string().nullable().openapi({
		description: "The website's logo URL.",
		example: "https://dub.co/logo.png",
	}),
	/** The owning organization's unique identifier. */
	organizationId: z.ulid().openapi({
		description: "The organization's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	defaultLanguage: z.string().default("en").openapi({
		description: "The website's default working language.",
		example: "en",
	}),
	/** Current website status. */
	status: z.string().openapi({
		description: "The website's status.",
		example: "active",
	}),
	/** When support was last online for this website. */
	lastOnlineAt: nullableApiTimestampSchema.openapi({
		description: "The website's support last online date.",
		example: "2021-01-01T00:00:00.000Z",
	}),
	/**
	 * List of currently available human agents.
	 *
	 * @remarks `HumanAgent[]`
	 * @fumadocsType `HumanAgent[]`
	 * @fumadocsHref #humanagent
	 */
	availableHumanAgents: z.array(availableHumanAgentSchema),
	/**
	 * List of currently available AI agents.
	 *
	 * @remarks `AIAgent[]`
	 * @fumadocsType `AIAgent[]`
	 * @fumadocsHref #aiagent
	 */
	availableAIAgents: z.array(AvailableAIAgentSchema),
	/**
	 * Current visitor information for the active session.
	 *
	 * @remarks `PublicVisitor`
	 * @fumadocsType `PublicVisitor`
	 * @fumadocsHref #publicvisitor
	 */
	visitor: publicVisitorResponseSchema.openapi({
		description:
			"The visitor information. Either existing visitor data or newly created visitor.",
	}),
});

export type PublicWebsiteResponse = z.infer<typeof publicWebsiteResponseSchema>;
export type AvailableHumanAgent = z.infer<typeof availableHumanAgentSchema>;
export type AvailableAIAgent = z.infer<typeof AvailableAIAgentSchema>;
export type HumanAgent = AvailableHumanAgent;
export type AIAgent = AvailableAIAgent;

/**
 * List websites by organization request schema
 */
export const listByOrganizationRequestSchema = z.object({
	organizationId: z.ulid().openapi({
		description: "The organization's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	defaultLanguage: z.string().default("en").openapi({
		description: "The website's default working language.",
		example: "en",
	}),
});

export type ListByOrganizationRequest = z.infer<
	typeof listByOrganizationRequestSchema
>;

/**
 * Website list item schema - simplified website info for listing
 */
export const websiteListItemSchema = z.object({
	id: z.ulid().openapi({
		description: "The website's unique identifier.",
		example: "01JG000000000000000000000",
	}),
	name: z.string().openapi({
		description: "The website's name.",
		example: "Dub",
	}),
	slug: z.string().openapi({
		description: "The website's slug.",
		example: "dub-co",
	}),
	logoUrl: z.url().nullable().openapi({
		description: "Public URL to the website's logo.",
		example: "https://cdn.example.com/logo.png",
	}),
	domain: z.string().openapi({
		description: "The website's domain.",
		example: "dub.co",
	}),
	organizationId: z.ulid().openapi({
		description: "The owning organization's unique identifier.",
		example: "01JG000000000000000000000",
	}),
});

export type WebsiteListItem = z.infer<typeof websiteListItemSchema>;
