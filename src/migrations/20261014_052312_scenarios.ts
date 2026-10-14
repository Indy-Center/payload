import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_scenarios_mode" AS ENUM('sim', 'live');
  CREATE TABLE "lesson_plans_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"scenarios_id" uuid
  );
  
  CREATE TABLE "scenarios_practical_tasks" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"task_id" uuid NOT NULL,
  	"teacher_notes" varchar,
  	"required" boolean DEFAULT true
  );
  
  CREATE TABLE "scenarios" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"course_id" uuid NOT NULL,
  	"name" varchar NOT NULL,
  	"airport" varchar NOT NULL,
  	"position" varchar NOT NULL,
  	"difficulty" varchar,
  	"mode" "enum_scenarios_mode" DEFAULT 'sim' NOT NULL,
  	"retired" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "scenarios_id" uuid;
  ALTER TABLE "lesson_plans_rels" ADD CONSTRAINT "lesson_plans_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lesson_plans_rels" ADD CONSTRAINT "lesson_plans_rels_scenarios_fk" FOREIGN KEY ("scenarios_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "scenarios_practical_tasks" ADD CONSTRAINT "scenarios_practical_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scenarios_practical_tasks" ADD CONSTRAINT "scenarios_practical_tasks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lesson_plans_rels_order_idx" ON "lesson_plans_rels" USING btree ("order");
  CREATE INDEX "lesson_plans_rels_parent_idx" ON "lesson_plans_rels" USING btree ("parent_id");
  CREATE INDEX "lesson_plans_rels_path_idx" ON "lesson_plans_rels" USING btree ("path");
  CREATE INDEX "lesson_plans_rels_scenarios_id_idx" ON "lesson_plans_rels" USING btree ("scenarios_id");
  CREATE INDEX "scenarios_practical_tasks_order_idx" ON "scenarios_practical_tasks" USING btree ("_order");
  CREATE INDEX "scenarios_practical_tasks_parent_id_idx" ON "scenarios_practical_tasks" USING btree ("_parent_id");
  CREATE INDEX "scenarios_practical_tasks_task_idx" ON "scenarios_practical_tasks" USING btree ("task_id");
  CREATE INDEX "scenarios_course_idx" ON "scenarios" USING btree ("course_id");
  CREATE INDEX "scenarios_retired_idx" ON "scenarios" USING btree ("retired");
  CREATE INDEX "scenarios_updated_at_idx" ON "scenarios" USING btree ("updated_at");
  CREATE INDEX "scenarios_created_at_idx" ON "scenarios" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_scenarios_fk" FOREIGN KEY ("scenarios_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_scenarios_id_idx" ON "payload_locked_documents_rels" USING btree ("scenarios_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lesson_plans_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "scenarios_practical_tasks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "scenarios" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "lesson_plans_rels" CASCADE;
  DROP TABLE "scenarios_practical_tasks" CASCADE;
  DROP TABLE "scenarios" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_scenarios_fk";
  
  DROP INDEX "payload_locked_documents_rels_scenarios_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "scenarios_id";
  DROP TYPE "public"."enum_scenarios_mode";`)
}
