import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Two editions of one course never share a number (decision 0056). If any course already has two
 * versions with one number, the migration stops and names each, rather than choosing which to
 * renumber. Each version's hidden title, shown in pickers and lists, becomes "S-GC edition 2".
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const { rows } = await db.execute<{ code: string; number: number; editions: number }>(sql`
    SELECT "courses"."code", "course_versions"."number", count(*)::int AS "editions"
    FROM "course_versions" JOIN "courses" ON "courses"."id" = "course_versions"."course_id"
    GROUP BY "courses"."code", "course_versions"."number"
    HAVING count(*) > 1
    ORDER BY "courses"."code", "course_versions"."number"`)
  if (rows.length > 0) {
    const named = rows.map(
      ({ code, number, editions }) => `${code} edition ${number} (${editions} editions)`,
    )
    throw new Error(
      `These courses have two or more editions with one number: ${named.join(', ')}. ` +
        `Renumber all but one of each, then migrate again.`,
    )
  }

  await db.execute(sql`
   CREATE UNIQUE INDEX "course_number_idx" ON "course_versions" USING btree ("course_id","number");
   UPDATE "course_versions" SET "title" = "courses"."code" || ' edition ' || "course_versions"."number"
     FROM "courses" WHERE "courses"."id" = "course_versions"."course_id";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "course_number_idx";
   UPDATE "course_versions" SET "title" = "courses"."code" || ' v' || "course_versions"."number"
     FROM "courses" WHERE "courses"."id" = "course_versions"."course_id";`)
}
