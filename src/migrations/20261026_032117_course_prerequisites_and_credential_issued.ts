import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A course gains its prerequisite credentials, as rows of "holds one of these", and the
 * credential it issues. A unique index keeps each credential to one issuing course. Every course
 * starts with neither.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "courses_prerequisites" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "courses_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"credentials_id" uuid
  );
  
  ALTER TABLE "courses" ADD COLUMN "credential_issued_id" uuid;
  ALTER TABLE "courses_prerequisites" ADD CONSTRAINT "courses_prerequisites_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_rels" ADD CONSTRAINT "courses_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "courses_rels" ADD CONSTRAINT "courses_rels_credentials_fk" FOREIGN KEY ("credentials_id") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "courses_prerequisites_order_idx" ON "courses_prerequisites" USING btree ("_order");
  CREATE INDEX "courses_prerequisites_parent_id_idx" ON "courses_prerequisites" USING btree ("_parent_id");
  CREATE INDEX "courses_rels_order_idx" ON "courses_rels" USING btree ("order");
  CREATE INDEX "courses_rels_parent_idx" ON "courses_rels" USING btree ("parent_id");
  CREATE INDEX "courses_rels_path_idx" ON "courses_rels" USING btree ("path");
  CREATE INDEX "courses_rels_credentials_id_idx" ON "courses_rels" USING btree ("credentials_id");
  ALTER TABLE "courses" ADD CONSTRAINT "courses_credential_issued_id_credentials_id_fk" FOREIGN KEY ("credential_issued_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "courses_credential_issued_idx" ON "courses" USING btree ("credential_issued_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "courses_prerequisites" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "courses_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "courses_prerequisites" CASCADE;
  DROP TABLE "courses_rels" CASCADE;
  ALTER TABLE "courses" DROP CONSTRAINT "courses_credential_issued_id_credentials_id_fk";
  
  DROP INDEX "courses_credential_issued_idx";
  ALTER TABLE "courses" DROP COLUMN "credential_issued_id";`)
}
