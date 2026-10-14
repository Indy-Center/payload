import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_course_versions_status" AS ENUM('draft', 'published');
  CREATE TABLE "courses" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"current_version_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "courses_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "course_versions_modules" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar
  );
  
  CREATE TABLE "course_versions" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"course_id" uuid NOT NULL,
  	"number" numeric NOT NULL,
  	"status" "enum_course_versions_status" DEFAULT 'draft' NOT NULL,
  	"description" varchar,
  	"time" numeric,
  	"academy_required" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "course_versions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"lesson_plans_id" uuid
  );
  
  CREATE TABLE "lesson_plans" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"course_version_id" uuid NOT NULL,
  	"code" varchar,
  	"title" varchar,
  	"description" varchar,
  	"body" jsonb,
  	"time" numeric,
  	"is_exam" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "courses_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "course_versions_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lesson_plans_id" uuid;
  ALTER TABLE "courses" ADD CONSTRAINT "courses_current_version_id_course_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."course_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "courses_texts" ADD CONSTRAINT "courses_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "course_versions_modules" ADD CONSTRAINT "course_versions_modules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."course_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "course_versions" ADD CONSTRAINT "course_versions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "course_versions_rels" ADD CONSTRAINT "course_versions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."course_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "course_versions_rels" ADD CONSTRAINT "course_versions_rels_lesson_plans_fk" FOREIGN KEY ("lesson_plans_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_course_version_id_course_versions_id_fk" FOREIGN KEY ("course_version_id") REFERENCES "public"."course_versions"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "courses_code_idx" ON "courses" USING btree ("code");
  CREATE INDEX "courses_current_version_idx" ON "courses" USING btree ("current_version_id");
  CREATE INDEX "courses_updated_at_idx" ON "courses" USING btree ("updated_at");
  CREATE INDEX "courses_created_at_idx" ON "courses" USING btree ("created_at");
  CREATE INDEX "courses_texts_order_parent" ON "courses_texts" USING btree ("order","parent_id");
  CREATE INDEX "course_versions_modules_order_idx" ON "course_versions_modules" USING btree ("_order");
  CREATE INDEX "course_versions_modules_parent_id_idx" ON "course_versions_modules" USING btree ("_parent_id");
  CREATE INDEX "course_versions_course_idx" ON "course_versions" USING btree ("course_id");
  CREATE INDEX "course_versions_status_idx" ON "course_versions" USING btree ("status");
  CREATE INDEX "course_versions_updated_at_idx" ON "course_versions" USING btree ("updated_at");
  CREATE INDEX "course_versions_created_at_idx" ON "course_versions" USING btree ("created_at");
  CREATE INDEX "course_versions_rels_order_idx" ON "course_versions_rels" USING btree ("order");
  CREATE INDEX "course_versions_rels_parent_idx" ON "course_versions_rels" USING btree ("parent_id");
  CREATE INDEX "course_versions_rels_path_idx" ON "course_versions_rels" USING btree ("path");
  CREATE INDEX "course_versions_rels_lesson_plans_id_idx" ON "course_versions_rels" USING btree ("lesson_plans_id");
  CREATE INDEX "lesson_plans_course_version_idx" ON "lesson_plans" USING btree ("course_version_id");
  CREATE INDEX "lesson_plans_updated_at_idx" ON "lesson_plans" USING btree ("updated_at");
  CREATE INDEX "lesson_plans_created_at_idx" ON "lesson_plans" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_course_versions_fk" FOREIGN KEY ("course_versions_id") REFERENCES "public"."course_versions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lesson_plans_fk" FOREIGN KEY ("lesson_plans_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_courses_id_idx" ON "payload_locked_documents_rels" USING btree ("courses_id");
  CREATE INDEX "payload_locked_documents_rels_course_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("course_versions_id");
  CREATE INDEX "payload_locked_documents_rels_lesson_plans_id_idx" ON "payload_locked_documents_rels" USING btree ("lesson_plans_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "courses" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "courses_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "course_versions_modules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "course_versions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "course_versions_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_plans" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "courses" CASCADE;
  DROP TABLE "courses_texts" CASCADE;
  DROP TABLE "course_versions_modules" CASCADE;
  DROP TABLE "course_versions" CASCADE;
  DROP TABLE "course_versions_rels" CASCADE;
  DROP TABLE "lesson_plans" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_courses_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_course_versions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_lesson_plans_fk";
  
  DROP INDEX "payload_locked_documents_rels_courses_id_idx";
  DROP INDEX "payload_locked_documents_rels_course_versions_id_idx";
  DROP INDEX "payload_locked_documents_rels_lesson_plans_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "courses_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "course_versions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lesson_plans_id";
  DROP TYPE "public"."enum_course_versions_status";`)
}
