import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createTRPCRouter } from "../init";
import { adminRouter } from "./admin";
import { aiAgentRouter } from "./ai-agent";
import { contactRouter } from "./contact";
import { conversationRouter } from "./conversation";
import { knowledgeRouter } from "./knowledge";
import { knowledgeClarificationRouter } from "./knowledge-clarification";
import { linkSourceRouter } from "./link-source";
import { notificationRouter } from "./notification";
import { openSourceProgramRouter } from "./open-source-program";
import { organizationRouter } from "./organization";
import { planRouter } from "./plan";
import { resendRouter } from "./resend";
import { teamRouter } from "./team";
import { uploadRouter } from "./upload";
import { userRouter } from "./user";
import { viewRouter } from "./view";
import { visitorRouter } from "./visitor";
import { websiteRouter } from "./website";

export const origamiTRPCRouter = createTRPCRouter({
	admin: adminRouter,
	aiAgent: aiAgentRouter,
	resend: resendRouter,
	team: teamRouter,
	user: userRouter,
	website: websiteRouter,
	conversation: conversationRouter,
	view: viewRouter,
	visitor: visitorRouter,
	contact: contactRouter,
	upload: uploadRouter,
	plan: planRouter,
	notification: notificationRouter,
	organization: organizationRouter,
	openSourceProgram: openSourceProgramRouter,
	knowledge: knowledgeRouter,
	knowledgeClarification: knowledgeClarificationRouter,
	linkSource: linkSourceRouter,
});

// export type definition of API
export type OrigamiTRPCRouter = typeof origamiTRPCRouter;
export type OrigamiTRPCRouterOutputs = inferRouterOutputs<OrigamiTRPCRouter>;
export type OrigamiTRPCRouterInputs = inferRouterInputs<OrigamiTRPCRouter>;

export type RouterInputs = inferRouterInputs<OrigamiTRPCRouter>;
export type RouterOutputs = inferRouterOutputs<OrigamiTRPCRouter>;
