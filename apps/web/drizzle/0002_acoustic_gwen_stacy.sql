CREATE TABLE "scene" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"narration" text NOT NULL,
	"visual_description" text NOT NULL,
	"duration_seconds" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"provider" text,
	"model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scene" ADD CONSTRAINT "scene_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;