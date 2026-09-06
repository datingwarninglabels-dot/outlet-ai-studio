CREATE TABLE "waitlist_signup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"creator_type" text,
	"ip_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_signup_email_unique" UNIQUE("email")
);
