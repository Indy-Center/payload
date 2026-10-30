import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A course's "Exam optional" is dropped (decision 0059): its rating exam alone says whether it
 * ends in one. Its data is not carried over, since nothing reads it once the field is gone. Going
 * down brings the column back unticked.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "courses" DROP COLUMN "exam_optional";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "courses" ADD COLUMN "exam_optional" boolean DEFAULT false;`)
}
