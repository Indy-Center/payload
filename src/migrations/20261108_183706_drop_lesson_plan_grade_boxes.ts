import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lesson_plans_tasks" DROP COLUMN "grades_knowledge";
  ALTER TABLE "lesson_plans_tasks" DROP COLUMN "grades_skill";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lesson_plans_tasks" ADD COLUMN "grades_knowledge" boolean;
  ALTER TABLE "lesson_plans_tasks" ADD COLUMN "grades_skill" boolean;`)
}
