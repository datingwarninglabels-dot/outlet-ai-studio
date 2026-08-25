ALTER TABLE "generation_job" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usage_cost" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_cost" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_cost" ADD CONSTRAINT "usage_cost_character_id_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."character"("id") ON DELETE cascade ON UPDATE no action;