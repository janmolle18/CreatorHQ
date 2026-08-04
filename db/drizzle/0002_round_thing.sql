CREATE TYPE "public"."email_token_purpose" AS ENUM('verify', 'reset');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "email_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_email_token_hash" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_email_token_user" ON "email_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_calendar_tenant_start" ON "calendar_items" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_clips_tenant_status" ON "clips" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_ideas_tenant" ON "ideas" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ix_membership_user" ON "memberships" USING btree ("user_id");