import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { randomBytes } from 'node:crypto'
import { positionTitle } from '../collections/courseware/Positions'
import { fetchZidPositions, type VnasPosition } from '../positions/vnas'

type Db = MigrateUpArgs['db']

/**
 * A scenario's student and teacher positions, typed text until now, become required picks from
 * Positions (decision 0060). Each scenario's text is linked to the position with that callsign.
 *
 * If any scenario exists, Positions is first filled from vNAS, as the sync would fill it (the
 * list is empty until the first sync after a deploy). If vNAS can't be read, or any scenario
 * names a position no position has the callsign of, or has no teacher position, the migration
 * stops, naming each, before changing the scenarios.
 *
 * It writes positions with SQL rather than through the sync, so that fields a later migration
 * adds to Positions don't have to exist yet.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const { rows } = await db.execute<{ count: string }>(
    sql`SELECT count(*) AS "count" FROM "scenarios"`,
  )
  if (Number(rows[0].count) > 0) {
    await fillPositions(db)
    await refuseUnlinked(db)
  }

  await db.execute(sql`
  ALTER TABLE "scenarios" ADD COLUMN "student_position_id" uuid;
  ALTER TABLE "scenarios" ADD COLUMN "teacher_position_id" uuid;
  UPDATE "scenarios" SET "student_position_id" = "positions"."id" FROM "positions"
    WHERE "positions"."callsign" = upper(trim("scenarios"."student_position"));
  UPDATE "scenarios" SET "teacher_position_id" = "positions"."id" FROM "positions"
    WHERE "positions"."callsign" = upper(trim("scenarios"."teacher_position"));
  ALTER TABLE "scenarios" ALTER COLUMN "student_position_id" SET NOT NULL;
  ALTER TABLE "scenarios" ALTER COLUMN "teacher_position_id" SET NOT NULL;
  ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_student_position_id_positions_id_fk" FOREIGN KEY ("student_position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_teacher_position_id_positions_id_fk" FOREIGN KEY ("teacher_position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "scenarios_student_position_idx" ON "scenarios" USING btree ("student_position_id");
  CREATE INDEX "scenarios_teacher_position_idx" ON "scenarios" USING btree ("teacher_position_id");
  ALTER TABLE "scenarios" DROP COLUMN "student_position";
  ALTER TABLE "scenarios" DROP COLUMN "teacher_position";`)
}

/** Adds every position vNAS lists that Positions doesn't hold yet (by vNAS id or callsign). */
async function fillPositions(db: Db): Promise<void> {
  let fromVnas: VnasPosition[]
  try {
    fromVnas = await fetchZidPositions()
  } catch (error) {
    throw new Error(
      `Scenarios now pick their positions from Positions, which is filled from vNAS first, and ` +
        `vNAS could not be used: ${(error as Error).message} Nothing was changed. Deploy again.`,
    )
  }
  for (const fromVnasPosition of fromVnas) {
    // Positions has one `short_name` column at this point, vNAS's; the next migration splits it.
    const position = { ...fromVnasPosition, shortName: fromVnasPosition.vnasShortName }
    await db.execute(sql`
    INSERT INTO "positions" ("id", "title", "callsign", "name", "short_name", "radio_name",
      "frequency", "facility_id", "facility_name", "vnas_id", "starred", "retired")
    VALUES (${uuidv7()}, ${positionTitle(position)}, ${position.callsign}, ${position.name},
      ${position.shortName}, ${position.radioName}, ${position.frequency}, ${position.facilityId},
      ${position.facilityName}, ${position.vnasId}, ${position.starred}, false)
    ON CONFLICT DO NOTHING`)
  }
}

/** Stops, naming them, if a scenario's text matches no position's callsign or it has no teacher. */
async function refuseUnlinked(db: Db): Promise<void> {
  const { rows } = await db.execute<{
    code: string | null
    name: string
    student: string | null
    teacher: string | null
    studentFound: boolean
    teacherFound: boolean
  }>(sql`
    SELECT "courses"."code", "scenarios"."name",
      "scenarios"."student_position" AS "student", "scenarios"."teacher_position" AS "teacher",
      "student"."id" IS NOT NULL AS "studentFound", "teacher"."id" IS NOT NULL AS "teacherFound"
    FROM "scenarios"
      LEFT JOIN "courses" ON "courses"."id" = "scenarios"."course_id"
      LEFT JOIN "positions" "student"
        ON "student"."callsign" = upper(trim("scenarios"."student_position"))
      LEFT JOIN "positions" "teacher"
        ON "teacher"."callsign" = upper(trim("scenarios"."teacher_position"))
    WHERE "student"."id" IS NULL OR "teacher"."id" IS NULL
    ORDER BY "courses"."code", "scenarios"."name"`)
  if (rows.length === 0) return

  const scenario = ({ code, name }: { code: string | null; name: string }) =>
    `${code ? `${code} ` : ''}${name}`
  const blank = (text: string | null) => !text?.trim()
  const unmatched = rows.flatMap((row) => {
    const texts = [
      ...(row.studentFound ? [] : [row.student ?? '']),
      ...(row.teacherFound || blank(row.teacher) ? [] : [row.teacher!]),
    ]
    return texts.length === 0
      ? []
      : [`${scenario(row)} (${texts.map((text) => `"${text}"`).join(', ')})`]
  })
  const noTeacher = rows.filter((row) => blank(row.teacher)).map(scenario)

  const faults = [
    ...(unmatched.length > 0
      ? [`These scenarios name a position no position has the callsign of: ${unmatched.join(', ')}.`]
      : []),
    ...(noTeacher.length > 0
      ? [`These scenarios have no teacher position: ${noTeacher.join(', ')}.`]
      : []),
  ]
  throw new Error(
    `${faults.join(' ')} Give each a student and a teacher position that vNAS lists, by its ` +
      `callsign, then deploy again.`,
  )
}

/** A version 7 UUID, as Payload gives every record here: the time in milliseconds, then random. */
function uuidv7(): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(Date.now(), 0, 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Back to text: each scenario's positions by callsign. The positions stay. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "scenarios" ADD COLUMN "student_position" varchar;
  ALTER TABLE "scenarios" ADD COLUMN "teacher_position" varchar;
  UPDATE "scenarios" SET "student_position" = "positions"."callsign" FROM "positions"
    WHERE "positions"."id" = "scenarios"."student_position_id";
  UPDATE "scenarios" SET "teacher_position" = "positions"."callsign" FROM "positions"
    WHERE "positions"."id" = "scenarios"."teacher_position_id";
  ALTER TABLE "scenarios" ALTER COLUMN "student_position" SET NOT NULL;
  ALTER TABLE "scenarios" DROP CONSTRAINT "scenarios_student_position_id_positions_id_fk";
  ALTER TABLE "scenarios" DROP CONSTRAINT "scenarios_teacher_position_id_positions_id_fk";
  DROP INDEX "scenarios_student_position_idx";
  DROP INDEX "scenarios_teacher_position_idx";
  ALTER TABLE "scenarios" DROP COLUMN "student_position_id";
  ALTER TABLE "scenarios" DROP COLUMN "teacher_position_id";`)
}
