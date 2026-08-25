CREATE TABLE "thumbnail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"job_id" uuid,
	"platform" text NOT NULL,
	"style" text NOT NULL,
	"headline_text" text DEFAULT '' NOT NULL,
	"base_asset_id" uuid NOT NULL,
	"composited_asset_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thumbnail" ADD CONSTRAINT "thumbnail_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thumbnail" ADD CONSTRAINT "thumbnail_job_id_generation_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_job"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thumbnail" ADD CONSTRAINT "thumbnail_base_asset_id_media_asset_id_fk" FOREIGN KEY ("base_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thumbnail" ADD CONSTRAINT "thumbnail_composited_asset_id_media_asset_id_fk" FOREIGN KEY ("composited_asset_id") REFERENCES "public"."media_asset"("id") ON DELETE set null ON UPDATE no action;