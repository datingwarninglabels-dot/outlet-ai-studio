ALTER TABLE "media_asset" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "media_asset" ADD COLUMN "deleted_at" timestamp;