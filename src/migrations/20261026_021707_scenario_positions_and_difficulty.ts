import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A scenario's position becomes its student position, and it gains an optional teacher
 * position. Its free-text difficulty becomes Easy, Medium or Hard: text that is one of them,
 * ignoring case and surrounding spaces, is kept, and empty text becomes none. Any other text
 * stops the migration, naming each scenario, so that nothing is dropped silently.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const { rows } = await db.execute<{ code: string | null; name: string; difficulty: string }>(sql`
    SELECT "courses"."code", "scenarios"."name", "scenarios"."difficulty"
    FROM "scenarios" LEFT JOIN "courses" ON "courses"."id" = "scenarios"."course_id"
    WHERE nullif(trim("scenarios"."difficulty"), '') IS NOT NULL
      AND lower(trim("scenarios"."difficulty")) NOT IN ('easy', 'medium', 'hard')
    ORDER BY "courses"."code", "scenarios"."name"`)
  if (rows.length > 0) {
    const named = rows.map(
      ({ code, name, difficulty }) => `${code ? `${code} ` : ''}${name} ("${difficulty}")`,
    )
    throw new Error(
      `These scenarios have a difficulty other than Easy, Medium or Hard: ${named.join(', ')}. ` +
        `Change each to Easy, Medium or Hard, or clear it, then migrate again.`,
    )
  }

  await db.execute(sql`
  CREATE TYPE "public"."enum_scenarios_difficulty" AS ENUM('easy', 'medium', 'hard');
  ALTER TABLE "scenarios" ALTER COLUMN "difficulty" SET DATA TYPE "public"."enum_scenarios_difficulty"
    USING nullif(lower(trim("difficulty")), '')::"public"."enum_scenarios_difficulty";
  ALTER TABLE "scenarios" RENAME COLUMN "position" TO "student_position";
  ALTER TABLE "scenarios" ADD COLUMN "teacher_position" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "scenarios" DROP COLUMN "teacher_position";
  ALTER TABLE "scenarios" RENAME COLUMN "student_position" TO "position";
  ALTER TABLE "scenarios" ALTER COLUMN "difficulty" SET DATA TYPE varchar;
  DROP TYPE "public"."enum_scenarios_difficulty";`)
}
