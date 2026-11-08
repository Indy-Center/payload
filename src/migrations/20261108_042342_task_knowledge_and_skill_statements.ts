import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tasks" ADD COLUMN "knowledge_statement" varchar;
  ALTER TABLE "tasks" ADD COLUMN "skill_statement" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tasks" DROP COLUMN "knowledge_statement";
  ALTER TABLE "tasks" DROP COLUMN "skill_statement";`)
}
