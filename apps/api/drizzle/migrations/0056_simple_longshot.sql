CREATE TYPE "public"."knowledge_clarification_signal_source_kind" AS ENUM('conversation', 'faq');--> statement-breakpoint
CREATE TABLE "knowledge_clarification_signal" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"request_id" varchar(26) NOT NULL,
	"source_kind" "knowledge_clarification_signal_source_kind" NOT NULL,
	"conversation_id" varchar(18),
	"knowledge_id" varchar(26),
	"trigger_message_id" text,
	"summary" text NOT NULL,
	"search_evidence" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_clarification_request" ADD COLUMN "topic_embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "knowledge_clarification_signal" ADD CONSTRAINT "knowledge_clarification_signal_request_id_knowledge_clarification_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."knowledge_clarification_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_clarification_signal" ADD CONSTRAINT "knowledge_clarification_signal_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_clarification_signal" ADD CONSTRAINT "knowledge_clarification_signal_knowledge_id_knowledge_id_fk" FOREIGN KEY ("knowledge_id") REFERENCES "public"."knowledge"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_clarification_signal_request_idx" ON "knowledge_clarification_signal" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_signal_conversation_idx" ON "knowledge_clarification_signal" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_signal_knowledge_idx" ON "knowledge_clarification_signal" USING btree ("knowledge_id");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_signal_source_kind_idx" ON "knowledge_clarification_signal" USING btree ("source_kind");--> statement-breakpoint
CREATE INDEX "knowledge_clarification_signal_trigger_message_idx" ON "knowledge_clarification_signal" USING btree ("trigger_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_clarification_signal_request_conv_trigger_unique" ON "knowledge_clarification_signal" USING btree ("request_id","conversation_id","trigger_message_id") WHERE "knowledge_clarification_signal"."source_kind" = 'conversation' and "knowledge_clarification_signal"."conversation_id" is not null and "knowledge_clarification_signal"."trigger_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_clarification_signal_request_conv_unique" ON "knowledge_clarification_signal" USING btree ("request_id","conversation_id") WHERE "knowledge_clarification_signal"."source_kind" = 'conversation' and "knowledge_clarification_signal"."conversation_id" is not null and "knowledge_clarification_signal"."trigger_message_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_clarification_signal_request_faq_unique" ON "knowledge_clarification_signal" USING btree ("request_id","knowledge_id") WHERE "knowledge_clarification_signal"."source_kind" = 'faq' and "knowledge_clarification_signal"."knowledge_id" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_clarification_request_topic_embedding_idx" ON "knowledge_clarification_request" USING hnsw ("topic_embedding" vector_cosine_ops);