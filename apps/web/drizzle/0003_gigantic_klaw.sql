CREATE TABLE "chapter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"title" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_step" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"step_index" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"output" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"estimated_cost_cents" integer NOT NULL,
	"confirmed_at" timestamp,
	"actual_cost_cents" integer,
	"currency" text DEFAULT 'usd' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_cost_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "idempotency_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "last_heartbeat_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_job" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "scene" ADD COLUMN "chapter_id" uuid;--> statement-breakpoint
ALTER TABLE "scene" ADD COLUMN "audio_direction" text;--> statement-breakpoint
ALTER TABLE "scene" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "chapter" ADD CONSTRAINT "chapter_script_id_script_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."script"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_step" ADD CONSTRAINT "job_step_job_id_generation_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_cost" ADD CONSTRAINT "usage_cost_job_id_generation_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_cost" ADD CONSTRAINT "usage_cost_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene" ADD CONSTRAINT "scene_chapter_id_chapter_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapter"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_idempotency_key_unique" UNIQUE("idempotency_key");