import { OpenAPIHono } from "@hono/zod-openapi";
import { aiAgentRouter } from "./ai-agent";
import { contactRouter } from "./contact";
import { conversationRouter } from "./conversation";
import { feedbackRouter } from "./feedback";
import { knowledgeRouter } from "./knowledge";
import { messagesRouter } from "./messages";
import { organizationRouter } from "./organization";
import { supportRouter } from "./support";
import { uploadRouter } from "./upload";
import { visitorRouter } from "./visitor";
import { websiteRouter } from "./website";

const routers = new OpenAPIHono()
	.route("/ai-agents", aiAgentRouter)
	.route("/organizations", organizationRouter)
	.route("/websites", websiteRouter)
	.route("/messages", messagesRouter)
	.route("/conversations", conversationRouter)
	.route("/visitors", visitorRouter)
	.route("/contacts", contactRouter)
	.route("/support", supportRouter)
	.route("/uploads", uploadRouter)
	.route("/knowledge", knowledgeRouter)
	.route("/feedback", feedbackRouter);

export { routers };
