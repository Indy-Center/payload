import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

const ZID = { id: 'ZID', name: 'Indianapolis ARTCC' }
const SDF = { id: 'SDF', name: 'Louisville ATCT/TRACON' }
const IND = { id: 'IND', name: 'Indianapolis ATCT/TRACON' }
const CVG = { id: 'CVG', name: 'Cincinnati ATCT/TRACON' }
const EVV = { id: 'EVV', name: 'Evansville ATCT/TRACON' }
const HUF = { id: 'HUF', name: 'Hulman ATCT/TRACON' }
const CMH = { id: 'CMH', name: 'Columbus ATCT/TRACON' }

/**
 * Each of ZID's facilities and the one it sits under, from vNAS's tree as of 2026-11-02: null for
 * ZID itself. The sync keeps the parent current after this; the migration fills only what is
 * already stored.
 */
const PARENTS: Record<string, { id: string; name: string } | null> = {
  ZID: null,
  ...Object.fromEntries(
    ['PKB', 'SDF', 'IND', 'LEX', 'CVG', 'EVV', 'HTS', 'HUF', 'CMH', 'CRW'].map((id) => [id, ZID]),
  ),
  LOU: SDF,
  FTK: SDF,
  BAK: IND,
  MIE: IND,
  AID: IND,
  HBE: IND,
  LUK: CVG,
  OWB: EVV,
  BMG: HUF,
  DAY: CMH,
  LCK: CMH,
  TZR: CMH,
  OSU: CMH,
  FFO: CMH,
  ILN: CMH,
}

/**
 * Each position now stores its facility's parent facility (payload decision 0005), so the public
 * positions can be grouped by vNAS's facility tree. Saved positions, retired ones included (the
 * sync never touches those again), are filled from their facility by the table above.
 *
 * If a saved position's facility is not in the table, the migration stops before changing
 * anything, naming each such position, so the table can be extended from vNAS and run again. An
 * empty list (before the first sync) has nothing to fill.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const known = sql.join(
    Object.keys(PARENTS).map((id) => sql`${id}`),
    sql`, `,
  )
  const { rows: unknown } = await db.execute<{ callsign: string; facility_id: string }>(sql`
    SELECT "callsign", "facility_id" FROM "positions"
    WHERE "facility_id" NOT IN (${known}) ORDER BY "callsign"`)
  if (unknown.length > 0)
    throw new Error(
      `These positions are in a facility this migration has no parent for: ` +
        `${unknown.map((row) => `${row.callsign} (${row.facility_id})`).join(', ')}. ` +
        `Nothing was changed. Add the facility to the migration from vNAS’s tree and migrate again.`,
    )

  await db.execute(sql`
   ALTER TABLE "positions" ADD COLUMN "parent_facility_id" varchar;
  ALTER TABLE "positions" ADD COLUMN "parent_facility_name" varchar;`)

  const parented = sql.join(
    Object.entries(PARENTS).flatMap(([id, parent]) =>
      parent ? [sql`(${id}, ${parent.id}, ${parent.name})`] : [],
    ),
    sql`, `,
  )
  await db.execute(sql`
    UPDATE "positions" SET "parent_facility_id" = "parents"."parent_id",
      "parent_facility_name" = "parents"."parent_name"
    FROM (VALUES ${parented}) AS "parents" ("facility_id", "parent_id", "parent_name")
    WHERE "positions"."facility_id" = "parents"."facility_id"`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "positions" DROP COLUMN "parent_facility_id";
  ALTER TABLE "positions" DROP COLUMN "parent_facility_name";`)
}
