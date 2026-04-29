ALTER TABLE "contact" ADD COLUMN "feature_flags" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "onboarding_state" jsonb;--> statement-breakpoint
ALTER TABLE "contact_organization" ADD COLUMN "feature_flags" text;--> statement-breakpoint
ALTER TABLE "visitor" ADD COLUMN "feature_flags" text;--> statement-breakpoint
ALTER TABLE "visitor" ADD COLUMN "onboarding_state" jsonb;