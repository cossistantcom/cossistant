CREATE TYPE "public"."conversation_field_source" AS ENUM('ai', 'user');--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "priority_source" "conversation_field_source";--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "sentiment_source" "conversation_field_source";
