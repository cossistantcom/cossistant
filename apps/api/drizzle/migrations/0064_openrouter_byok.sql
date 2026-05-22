CREATE TABLE "website_openrouter_key" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"organization_id" varchar(26) NOT NULL,
	"website_id" varchar(26) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"masked_key" varchar(80) NOT NULL,
	"last_connection_status" varchar(24) DEFAULT 'unchecked' NOT NULL,
	"last_error_code" text,
	"last_checked_at" timestamp,
	"created_by" varchar(26) NOT NULL,
	"updated_by" varchar(26),
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "website_openrouter_key" ADD CONSTRAINT "website_openrouter_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "website_openrouter_key" ADD CONSTRAINT "website_openrouter_key_website_id_website_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."website"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "website_openrouter_key" ADD CONSTRAINT "website_openrouter_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "website_openrouter_key" ADD CONSTRAINT "website_openrouter_key_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "website_openrouter_key_website_unique_idx" ON "website_openrouter_key" USING btree ("website_id");
--> statement-breakpoint
CREATE INDEX "website_openrouter_key_org_idx" ON "website_openrouter_key" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "website_openrouter_key_enabled_idx" ON "website_openrouter_key" USING btree ("enabled");
