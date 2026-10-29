import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The CMS now refuses data that would confuse the training app (ticket 23): a certification with
 * no rank, two certifications granted on arrival for one rating, a course naming a credential
 * twice among its prerequisites or requiring the credential it issues, fewest estimated weeks
 * under 1, and a minimum that is not a point on its edition's grading scale. No table changes.
 *
 * Saved data is not rewritten to fit. If any of it breaks a rule, the migration stops and names
 * each credential, course, edition or lesson plan, so someone can correct it and migrate again.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const names = async (query: ReturnType<typeof sql>) =>
    (await db.execute<{ name: string }>(query)).rows.map((row) => row.name)

  const faults: string[] = []
  const report = (found: string[], message: string) => {
    if (found.length > 0) faults.push(`${message}: ${found.join(', ')}.`)
  }

  report(
    await names(sql`
      SELECT "code" AS "name" FROM "credentials"
      WHERE "kind" = 'certification' AND "rank" IS NULL ORDER BY "code"`),
    'These certifications have no rank, which a certification needs',
  )
  report(
    await names(sql`
      SELECT "granted"."value" || ' (' || string_agg("credentials"."code", ' and ' ORDER BY "credentials"."code") || ')' AS "name"
      FROM "credentials_granted_on_arrival" AS "granted"
      JOIN "credentials" ON "credentials"."id" = "granted"."parent_id"
      GROUP BY "granted"."value" HAVING count(*) > 1
      ORDER BY "granted"."value"`),
    'These ratings are granted on arrival for more than one certification, and each brings one',
  )
  report(
    await names(sql`
      SELECT "courses"."code" || ' names ' || "credentials"."code" AS "name"
      FROM "courses_rels"
      JOIN "courses" ON "courses"."id" = "courses_rels"."parent_id"
      JOIN "credentials" ON "credentials"."id" = "courses_rels"."credentials_id"
      WHERE "courses_rels"."path" LIKE 'prerequisites.%.anyOf'
      GROUP BY "courses"."code", "credentials"."code"
      HAVING count(*) > 1
      ORDER BY "courses"."code", "credentials"."code"`),
    'These courses name a credential more than once in their prerequisites',
  )
  report(
    await names(sql`
      SELECT "courses"."code" || ' requires ' || "credentials"."code" AS "name"
      FROM "courses"
      JOIN "credentials" ON "credentials"."id" = "courses"."credential_issued_id"
      WHERE EXISTS (
        SELECT 1 FROM "courses_rels"
        WHERE "courses_rels"."parent_id" = "courses"."id"
          AND "courses_rels"."path" LIKE 'prerequisites.%.anyOf'
          AND "courses_rels"."credentials_id" = "courses"."credential_issued_id")
      ORDER BY "courses"."code"`),
    'These courses require the credential they issue',
  )
  report(
    await names(sql`
      SELECT "code" || ' (' || "estimated_weeks_min" || ')' AS "name" FROM "courses"
      WHERE "estimated_weeks_min" < 1 ORDER BY "code"`),
    'These courses have fewest estimated weeks under 1',
  )
  report(
    await names(sql`
      SELECT "courses"."code" || ' edition ' || "course_versions"."number" || ' default minimum ' || "course_versions"."default_minimum" AS "name"
      FROM "course_versions"
      JOIN "courses" ON "courses"."id" = "course_versions"."course_id"
      JOIN "grading_scales" ON "grading_scales"."id" = "course_versions"."grading_scale_id"
      WHERE "course_versions"."default_minimum" IS NOT NULL AND NOT (
        "course_versions"."default_minimum" = floor("course_versions"."default_minimum")
        AND "course_versions"."default_minimum" BETWEEN 1 AND (
          SELECT count(*) FROM "grading_scales_points" WHERE "grading_scales_points"."_parent_id" = "grading_scales"."id"))
      ORDER BY "courses"."code", "course_versions"."number"`),
    'These editions have a default minimum that is not a point on their grading scale',
  )
  report(
    await names(sql`
      SELECT coalesce("lesson_plans"."code", "lesson_plans"."title", "lesson_plans"."id"::text)
        || ' in ' || "courses"."code" || ' edition ' || "course_versions"."number"
        || ' minimum ' || "lesson_plans"."minimum" AS "name"
      FROM "lesson_plans"
      JOIN "course_versions" ON "course_versions"."id" = "lesson_plans"."course_version_id"
      JOIN "courses" ON "courses"."id" = "course_versions"."course_id"
      JOIN "grading_scales" ON "grading_scales"."id" = "course_versions"."grading_scale_id"
      WHERE "lesson_plans"."minimum" IS NOT NULL AND NOT (
        "lesson_plans"."minimum" = floor("lesson_plans"."minimum")
        AND "lesson_plans"."minimum" BETWEEN 1 AND (
          SELECT count(*) FROM "grading_scales_points" WHERE "grading_scales_points"."_parent_id" = "grading_scales"."id"))
      ORDER BY "courses"."code", "course_versions"."number", "lesson_plans"."code"`),
    'These lesson plans have a minimum that is not a point on their edition’s grading scale',
  )

  if (faults.length > 0) {
    throw new Error(`${faults.join(' ')} Correct each, then migrate again.`)
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing was changed.
}
