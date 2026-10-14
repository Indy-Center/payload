import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "tasks" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"_order" varchar,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"parent_id" uuid,
  	"retired" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "lesson_plans_theory_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"task_id" uuid NOT NULL,
  	"teacher_notes" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tasks_id" uuid;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_plans_theory_items" ADD CONSTRAINT "lesson_plans_theory_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_plans_theory_items" ADD CONSTRAINT "lesson_plans_theory_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tasks__order_idx" ON "tasks" USING btree ("_order");
  CREATE INDEX "tasks_parent_idx" ON "tasks" USING btree ("parent_id");
  CREATE INDEX "tasks_retired_idx" ON "tasks" USING btree ("retired");
  CREATE INDEX "tasks_updated_at_idx" ON "tasks" USING btree ("updated_at");
  CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");
  CREATE INDEX "lesson_plans_theory_items_order_idx" ON "lesson_plans_theory_items" USING btree ("_order");
  CREATE INDEX "lesson_plans_theory_items_parent_id_idx" ON "lesson_plans_theory_items" USING btree ("_parent_id");
  CREATE INDEX "lesson_plans_theory_items_task_idx" ON "lesson_plans_theory_items" USING btree ("task_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tasks_fk" FOREIGN KEY ("tasks_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("tasks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tasks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lesson_plans_theory_items" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tasks" CASCADE;
  DROP TABLE "lesson_plans_theory_items" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tasks_fk";
  
  DROP INDEX "payload_locked_documents_rels_tasks_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tasks_id";`)
}
