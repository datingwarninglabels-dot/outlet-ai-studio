-- Hand-edited from drizzle-kit's generated output: the raw generated
-- migration added owner_id as NOT NULL in a single statement, which fails
-- against any database that already has media_asset rows (every one did,
-- pre-Milestone-2, since this was a single-Owner app). Split into three
-- steps: add nullable, backfill every existing row to the sole Owner
-- account (safe by construction — every row that could exist before
-- customer registration shipped belongs to that one account), then
-- enforce NOT NULL.
ALTER TABLE "media_asset" ADD COLUMN "owner_id" text;--> statement-breakpoint
UPDATE "media_asset" SET "owner_id" = (SELECT "id" FROM "user" WHERE "role" = 'owner' LIMIT 1) WHERE "owner_id" IS NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
