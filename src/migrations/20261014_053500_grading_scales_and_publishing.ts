import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "grading_scales_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"description" varchar
  );
  
  CREATE TABLE "grading_scales" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "course_versions" ADD COLUMN "grading_scale_id" uuid;
  ALTER TABLE "course_versions" ADD COLUMN "default_minimum" numeric;
  ALTER TABLE "lesson_plans" ADD COLUMN "minimum" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "grading_scales_id" uuid;
  ALTER TABLE "grading_scales_points" ADD CONSTRAINT "grading_scales_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."grading_scales"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "grading_scales_points_order_idx" ON "grading_scales_points" USING btree ("_order");
  CREATE INDEX "grading_scales_points_parent_id_idx" ON "grading_scales_points" USING btree ("_parent_id");
  CREATE INDEX "grading_scales_updated_at_idx" ON "grading_scales" USING btree ("updated_at");
  CREATE INDEX "grading_scales_created_at_idx" ON "grading_scales" USING btree ("created_at");
  ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_grading_scale_id_grading_scales_id_fk" FOREIGN KEY ("grading_scale_id") REFERENCES "public"."grading_scales"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_grading_scales_fk" FOREIGN KEY ("grading_scales_id") REFERENCES "public"."grading_scales"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "course_versions_grading_scale_idx" ON "course_versions" USING btree ("grading_scale_id");
  CREATE INDEX "payload_locked_documents_rels_grading_scales_id_idx" ON "payload_locked_documents_rels" USING btree ("grading_scales_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "grading_scales_points" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "grading_scales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "grading_scales_points" CASCADE;
  DROP TABLE "grading_scales" CASCADE;
  ALTER TABLE "course_versions" DROP CONSTRAINT "course_versions_grading_scale_id_grading_scales_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_grading_scales_fk";
  
  DROP INDEX "course_versions_grading_scale_idx";
  DROP INDEX "payload_locked_documents_rels_grading_scales_id_idx";
  ALTER TABLE "course_versions" DROP COLUMN "grading_scale_id";
  ALTER TABLE "course_versions" DROP COLUMN "default_minimum";
  ALTER TABLE "lesson_plans" DROP COLUMN "minimum";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "grading_scales_id";`)
}
