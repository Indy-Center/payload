import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_teacher_resources_resources_icon" AS ENUM('link-variant', 'file-document', 'book-open-variant', 'google-drive', 'table', 'form-select', 'video', 'youtube', 'calendar', 'headset', 'discord', 'map', 'radar', 'airplane', 'school', 'clipboard-text', 'web', 'help-circle');
  ALTER TABLE "teacher_resources_resources" ADD COLUMN "description" varchar;
  ALTER TABLE "teacher_resources_resources" ADD COLUMN "icon" "enum_teacher_resources_resources_icon" DEFAULT 'link-variant' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "teacher_resources_resources" DROP COLUMN "description";
  ALTER TABLE "teacher_resources_resources" DROP COLUMN "icon";
  DROP TYPE "public"."enum_teacher_resources_resources_icon";`)
}
