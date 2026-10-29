import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { randomBytes } from 'node:crypto'

/**
 * The certifications and endorsements Indy issues, as training-tools lists them today
 * (`src/lib/certifications.ts`), so the CMS can become the list it reads (decision 0054). Their
 * prerequisites are not copied: those belong to the courses that issue them.
 */
export const CREDENTIALS = [
  {
    code: 'S-GC',
    kind: 'certification',
    name: 'Simple Ground Control',
    description: 'Clearance delivery and ground control at our simpler fields.',
    rank: 1,
    grantedOnArrival: ['S1'],
  },
  {
    code: 'A-GC',
    kind: 'certification',
    name: 'Advanced Ground Control',
    description: 'Ground control at Indianapolis and our busier terminal fields.',
    rank: 2,
    grantedOnArrival: [],
  },
  {
    code: 'A-LC',
    kind: 'certification',
    name: 'Advanced Local Control',
    description: 'Tower and local control at Indianapolis and our busier fields.',
    rank: 3,
    grantedOnArrival: ['S2'],
  },
  {
    code: 'T-RC',
    kind: 'certification',
    name: 'Terminal Radar Control',
    description: 'Approach and departure control in our terminal airspace.',
    rank: 4,
    grantedOnArrival: ['S3'],
  },
  {
    code: 'E-RC',
    kind: 'certification',
    name: 'Enroute Radar Control',
    description: 'Enroute control on Indy Center sectors.',
    rank: 5,
    grantedOnArrival: ['C1', 'C3', 'I1', 'I3'],
  },
  {
    code: 'S-LC',
    kind: 'endorsement',
    name: 'Simple Local Control',
    description: 'Tower and local control at our simpler fields.',
    rank: null,
    grantedOnArrival: [],
  },
  {
    code: 'T2-CTR',
    kind: 'endorsement',
    name: 'Tier 2 Center',
    description: 'Tier 2 enroute sectors, earned through a self-led course.',
    rank: null,
    grantedOnArrival: [],
  },
]

/** A version 7 UUID, as Payload gives every record here: the time in milliseconds, then random. */
function uuidv7(): string {
  const bytes = randomBytes(16)
  bytes.writeUIntBE(Date.now(), 0, 6)
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** The Credentials collection, filled with the list training-tools keeps. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_credentials_granted_on_arrival" AS ENUM('S1', 'S2', 'S3', 'C1', 'C3', 'I1', 'I3');
  CREATE TYPE "public"."enum_credentials_kind" AS ENUM('certification', 'endorsement');
  CREATE TABLE "credentials_granted_on_arrival" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_credentials_granted_on_arrival",
  	"id" uuid PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "credentials" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"kind" "enum_credentials_kind" NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"rank" numeric,
  	"retired" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "credentials_id" uuid;
  ALTER TABLE "credentials_granted_on_arrival" ADD CONSTRAINT "credentials_granted_on_arrival_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "credentials_granted_on_arrival_order_idx" ON "credentials_granted_on_arrival" USING btree ("order");
  CREATE INDEX "credentials_granted_on_arrival_parent_idx" ON "credentials_granted_on_arrival" USING btree ("parent_id");
  CREATE UNIQUE INDEX "credentials_code_idx" ON "credentials" USING btree ("code");
  CREATE UNIQUE INDEX "credentials_rank_idx" ON "credentials" USING btree ("rank");
  CREATE INDEX "credentials_retired_idx" ON "credentials" USING btree ("retired");
  CREATE INDEX "credentials_updated_at_idx" ON "credentials" USING btree ("updated_at");
  CREATE INDEX "credentials_created_at_idx" ON "credentials" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_credentials_fk" FOREIGN KEY ("credentials_id") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_credentials_id_idx" ON "payload_locked_documents_rels" USING btree ("credentials_id");`)

  for (const { code, kind, name, description, rank, grantedOnArrival } of CREDENTIALS) {
    const id = uuidv7()
    await db.execute(sql`
      INSERT INTO "credentials" ("id", "code", "kind", "name", "description", "rank")
      VALUES (${id}, ${code}, ${kind}, ${name}, ${description}, ${rank})`)
    for (const [index, rating] of grantedOnArrival.entries()) {
      await db.execute(sql`
        INSERT INTO "credentials_granted_on_arrival" ("order", "parent_id", "value", "id")
        VALUES (${index + 1}, ${id}, ${rating}, ${uuidv7()})`)
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "credentials_granted_on_arrival" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "credentials" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "credentials_granted_on_arrival" CASCADE;
  DROP TABLE "credentials" CASCADE;
  DROP INDEX "payload_locked_documents_rels_credentials_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "credentials_id";
  DROP TYPE "public"."enum_credentials_granted_on_arrival";
  DROP TYPE "public"."enum_credentials_kind";`)
}
