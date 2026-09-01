CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_owner_id_unique" UNIQUE("owner_id"),
	CONSTRAINT "subscription_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "subscription_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_stripe_customer_id_idx" ON "subscription" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "subscription_stripe_subscription_id_idx" ON "subscription" USING btree ("stripe_subscription_id");
--> statement-breakpoint
-- Hand-edited from drizzle-kit's generated output: the raw generated
-- migration added owner_id as NOT NULL in a single statement, which fails
-- against any database that already has usage_cost rows (any deployment
-- that's already run a generation job). Split into three steps: add
-- nullable, backfill every existing row from the real owner via whichever
-- of project/character/world it's actually tied to (exactly one is always
-- set — see usage_cost_exactly_one_owner_chk), then enforce NOT NULL. This
-- resolves the REAL per-row owner rather than assuming a single Owner
-- account, since multi-tenancy (Phase 2 Milestone 2) is already real by
-- the time this migration exists.
ALTER TABLE "usage_cost" ADD COLUMN "owner_id" text;--> statement-breakpoint
UPDATE "usage_cost" SET "owner_id" = COALESCE(
	(SELECT "owner_id" FROM "project" WHERE "project"."id" = "usage_cost"."project_id"),
	(SELECT "owner_id" FROM "character" WHERE "character"."id" = "usage_cost"."character_id"),
	(SELECT "owner_id" FROM "world" WHERE "world"."id" = "usage_cost"."world_id")
) WHERE "owner_id" IS NULL;--> statement-breakpoint
ALTER TABLE "usage_cost" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_cost" ADD CONSTRAINT "usage_cost_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_cost_owner_id_created_at_idx" ON "usage_cost" USING btree ("owner_id","created_at");
