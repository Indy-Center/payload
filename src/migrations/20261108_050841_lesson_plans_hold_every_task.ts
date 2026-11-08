import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A lesson plan holds every task; a scenario holds none (decision 0065). Each theory item carries
 * over as a lesson plan task in its place, keeping its id and teacher notes, required, and grading
 * neither statement: no task has statements yet, so the next save of that lesson plan asks for
 * them. Scenarios' practical tasks are dropped without checking for them (none are real yet).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "lesson_plans_tasks" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"task_id" uuid NOT NULL,
  	"required" boolean DEFAULT true,
  	"grades_knowledge" boolean,
  	"grades_skill" boolean,
  	"teacher_notes" varchar
  );

  INSERT INTO "lesson_plans_tasks"
    ("_order", "_parent_id", "id", "task_id", "required", "grades_knowledge", "grades_skill", "teacher_notes")
    SELECT "_order", "_parent_id", "id", "task_id", true, false, false, "teacher_notes"
    FROM "lesson_plans_theory_items";

  ALTER TABLE "lesson_plans_tasks" ADD CONSTRAINT "lesson_plans_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_plans_tasks" ADD CONSTRAINT "lesson_plans_tasks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lesson_plans_tasks_order_idx" ON "lesson_plans_tasks" USING btree ("_order");
  CREATE INDEX "lesson_plans_tasks_parent_id_idx" ON "lesson_plans_tasks" USING btree ("_parent_id");
  CREATE INDEX "lesson_plans_tasks_task_idx" ON "lesson_plans_tasks" USING btree ("task_id");

  DROP TABLE "lesson_plans_theory_items" CASCADE;
  DROP TABLE "scenarios_practical_tasks" CASCADE;`)
}

/** Lesson plan tasks go back to theory items, losing required and grades; practical tasks stay lost. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "lesson_plans_theory_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"task_id" uuid NOT NULL,
  	"teacher_notes" varchar
  );

  CREATE TABLE "scenarios_practical_tasks" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"task_id" uuid NOT NULL,
  	"teacher_notes" varchar,
  	"required" boolean DEFAULT true
  );

  INSERT INTO "lesson_plans_theory_items" ("_order", "_parent_id", "id", "task_id", "teacher_notes")
    SELECT "_order", "_parent_id", "id", "task_id", "teacher_notes" FROM "lesson_plans_tasks";

  ALTER TABLE "lesson_plans_theory_items" ADD CONSTRAINT "lesson_plans_theory_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_plans_theory_items" ADD CONSTRAINT "lesson_plans_theory_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lesson_plans"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "scenarios_practical_tasks" ADD CONSTRAINT "scenarios_practical_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scenarios_practical_tasks" ADD CONSTRAINT "scenarios_practical_tasks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lesson_plans_theory_items_order_idx" ON "lesson_plans_theory_items" USING btree ("_order");
  CREATE INDEX "lesson_plans_theory_items_parent_id_idx" ON "lesson_plans_theory_items" USING btree ("_parent_id");
  CREATE INDEX "lesson_plans_theory_items_task_idx" ON "lesson_plans_theory_items" USING btree ("task_id");
  CREATE INDEX "scenarios_practical_tasks_order_idx" ON "scenarios_practical_tasks" USING btree ("_order");
  CREATE INDEX "scenarios_practical_tasks_parent_id_idx" ON "scenarios_practical_tasks" USING btree ("_parent_id");
  CREATE INDEX "scenarios_practical_tasks_task_idx" ON "scenarios_practical_tasks" USING btree ("task_id");

  DROP TABLE "lesson_plans_tasks" CASCADE;`)
}
