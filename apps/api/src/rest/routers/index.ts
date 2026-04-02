import { OpenAPIHono } from "@hono/zod-openapi";
import { channelsRouter } from "./channels";
import { contactRouter } from "./contact";
import { conversationRouter } from "./conversation";
import { feedbackRouter } from "./feedback";
import { knowledgeRouter } from "./knowledge";
import { messagesRouter } from "./messages";
import { organizationRouter } from "./organization";
import { uploadRouter } from "./upload";
import { visitorRouter } from "./visitor";
import { voiceRouter } from "./voice";
import { websiteRouter } from "./website";

const routers = new OpenAPIHono()
  .route("/organizations", organizationRouter)
  .route("/websites", websiteRouter)
  .route("/messages", messagesRouter)
  .route("/conversations", conversationRouter)
  .route("/visitors", visitorRouter)
  .route("/contacts", contactRouter)
  .route("/uploads", uploadRouter)
  .route("/knowledge", knowledgeRouter)
  .route("/feedback", feedbackRouter)
  .route("/voice", voiceRouter)
  .route("/channels", channelsRouter);

export { routers };
