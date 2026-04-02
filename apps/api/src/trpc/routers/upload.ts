import { db } from "@api/db";
import { getWebsiteByIdWithAccess } from "@api/db/queries/website";
import { generateUploadUrl } from "@api/services/upload";
import {
	generateUploadUrlRequestSchema,
	generateUploadUrlResponseSchema,
} from "@plasma/types/api/upload";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";

export const uploadRouter = createTRPCRouter({
	createSignedUrl: protectedProcedure
		.input(generateUploadUrlRequestSchema)
		.output(generateUploadUrlResponseSchema)
		.mutation(async ({ ctx, input }) => {
			const websiteData = await getWebsiteByIdWithAccess(db, {
				userId: ctx.user.id,
				websiteId: input.websiteId,
			});

			if (!websiteData) {
				throw new TRPCError({ code: "NOT_FOUND" });
			}

			if (input.scope.organizationId !== websiteData.organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Scope organization does not match the authenticated organization context.",
				});
			}

			const result = await generateUploadUrl({
				contentType: input.contentType,
				fileName: input.fileName,
				fileExtension: input.fileExtension,
				path: input.path,
				scope: input.scope,
				useCdn: input.useCdn,
				expiresInSeconds: input.expiresInSeconds,
			});

			return result;
		}),
});
