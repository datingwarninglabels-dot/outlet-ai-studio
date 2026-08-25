CREATE TABLE "brand_kit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"logo_asset_id" uuid,
	"intro_asset_id" uuid,
	"outro_asset_id" uuid,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fonts" text,
	"caption_style" text,
	"watermark_enabled" boolean DEFAULT false NOT NULL,
	"watermark_text" text,
	"default_voice_id" text,
	"default_music_mood" text,
	"default_visual_style" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brand_kit_owner_id_unique" UNIQUE("owner_id")
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "visual_style_override" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "voice_id_override" text;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_logo_asset_id_media_asset_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_intro_asset_id_media_asset_id_fk" FOREIGN KEY ("intro_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_outro_asset_id_media_asset_id_fk" FOREIGN KEY ("outro_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;