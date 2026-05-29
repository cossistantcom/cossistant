ALTER TABLE "organization" ADD COLUMN "timezone" varchar(100) DEFAULT 'UTC' NOT NULL;
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "weekly_digest_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE "lifecycle_email_event" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"dedupe_key" varchar(255) NOT NULL,
	"email_key" varchar(100) NOT NULL,
	"status" varchar(30) DEFAULT 'scheduled' NOT NULL,
	"recipient_user_id" varchar(26),
	"recipient_member_id" varchar(26),
	"recipient_email" varchar(255) NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"website_id" varchar(26),
	"scheduled_at" timestamp NOT NULL,
	"claimed_at" timestamp,
	"sent_at" timestamp,
	"failed_at" timestamp,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lifecycle_email_event" ADD CONSTRAINT "lifecycle_email_event_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lifecycle_email_event" ADD CONSTRAINT "lifecycle_email_event_recipient_member_id_member_id_fk" FOREIGN KEY ("recipient_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lifecycle_email_event" ADD CONSTRAINT "lifecycle_email_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "lifecycle_email_event" ADD CONSTRAINT "lifecycle_email_event_website_id_website_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."website"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "lifecycle_email_event_dedupe_key_idx" ON "lifecycle_email_event" USING btree ("dedupe_key");
--> statement-breakpoint
CREATE INDEX "lifecycle_email_event_status_scheduled_idx" ON "lifecycle_email_event" USING btree ("status","scheduled_at");
--> statement-breakpoint
CREATE INDEX "lifecycle_email_event_org_idx" ON "lifecycle_email_event" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "lifecycle_email_event_website_idx" ON "lifecycle_email_event" USING btree ("website_id");
--> statement-breakpoint
CREATE INDEX "lifecycle_email_event_recipient_user_idx" ON "lifecycle_email_event" USING btree ("recipient_user_id");
--> statement-breakpoint
CREATE INDEX "lifecycle_email_event_email_key_idx" ON "lifecycle_email_event" USING btree ("email_key");
