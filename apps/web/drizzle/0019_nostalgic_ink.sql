-- Production-readiness audit fixes (M1: indexes, M2: CHECK constraints).
-- All 16 index creations are purely additive/safe against any existing
-- data. The two CHECK constraints at the end validate against EXISTING
-- rows when applied — per the audit, generation_job/usage_cost's "exactly
-- one of project/character/world" invariant has always been enforced by
-- requestJob() (lib/jobs.ts), the sole insert path for both tables, so
-- this is expected to succeed cleanly. If it ever fails to apply, that
-- means a real pre-existing data-integrity violation exists and should be
-- investigated (not just retried past).
CREATE INDEX "character_reference_character_id_idx" ON "character_reference" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "character_owner_id_idx" ON "character" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "generation_job_project_id_idx" ON "generation_job" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "generation_job_character_id_idx" ON "generation_job" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "generation_job_world_id_idx" ON "generation_job" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "job_step_job_id_idx" ON "job_step" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "media_asset_owner_id_idx" ON "media_asset" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "media_asset_project_id_idx" ON "media_asset" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_owner_id_idx" ON "project" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "scene_project_id_idx" ON "scene" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "script_project_id_idx" ON "script" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "thumbnail_project_id_idx" ON "thumbnail" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "usage_cost_project_id_idx" ON "usage_cost" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "usage_cost_character_id_idx" ON "usage_cost" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "usage_cost_world_id_idx" ON "usage_cost" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_reference_world_id_idx" ON "world_reference" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "world_owner_id_idx" ON "world" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "generation_job" ADD CONSTRAINT "generation_job_exactly_one_owner_chk" CHECK (num_nonnulls("generation_job"."project_id", "generation_job"."character_id", "generation_job"."world_id") = 1);--> statement-breakpoint
ALTER TABLE "usage_cost" ADD CONSTRAINT "usage_cost_exactly_one_owner_chk" CHECK (num_nonnulls("usage_cost"."project_id", "usage_cost"."character_id", "usage_cost"."world_id") = 1);
