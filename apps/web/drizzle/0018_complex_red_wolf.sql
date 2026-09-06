CREATE TABLE "rate_limit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_event_scope_key_created_at_idx" ON "rate_limit_event" USING btree ("scope","key","created_at");