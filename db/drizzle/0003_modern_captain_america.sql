ALTER TYPE "public"."source_status" ADD VALUE 'reference';--> statement-breakpoint
ALTER TABLE "metrics_snapshots" DROP CONSTRAINT "uq_snapshot_date_account_post";--> statement-breakpoint
ALTER TABLE "metrics_snapshots" ADD COLUMN "source_video_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "metrics_snapshots" ADD CONSTRAINT "metrics_snapshots_source_video_id_source_videos_id_fk" FOREIGN KEY ("source_video_id") REFERENCES "public"."source_videos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "metrics_snapshots" ADD CONSTRAINT "uq_snapshot_date_account_post" UNIQUE NULLS NOT DISTINCT("snapshot_date","account_id","post_id","source_video_id");