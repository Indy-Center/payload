import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partners_status" AS ENUM('draft', 'published');
  ALTER TYPE "public"."enum_users_roles" ADD VALUE 'partners:editor';
  CREATE TABLE "partner_categories" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"blurb" varchar NOT NULL,
  	"order" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "partners" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar,
  	"category_id" uuid NOT NULL,
  	"status" "enum_partners_status" DEFAULT 'draft' NOT NULL,
  	"order" numeric,
  	"tagline" varchar,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "partner_categories_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "partners_id" uuid;
  ALTER TABLE "partners" ADD CONSTRAINT "partners_category_id_partner_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."partner_categories"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "partner_categories_updated_at_idx" ON "partner_categories" USING btree ("updated_at");
  CREATE INDEX "partner_categories_created_at_idx" ON "partner_categories" USING btree ("created_at");
  CREATE UNIQUE INDEX "partners_slug_idx" ON "partners" USING btree ("slug");
  CREATE INDEX "partners_category_idx" ON "partners" USING btree ("category_id");
  CREATE INDEX "partners_status_idx" ON "partners" USING btree ("status");
  CREATE INDEX "partners_updated_at_idx" ON "partners" USING btree ("updated_at");
  CREATE INDEX "partners_created_at_idx" ON "partners" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_partner_categories_fk" FOREIGN KEY ("partner_categories_id") REFERENCES "public"."partner_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_partners_fk" FOREIGN KEY ("partners_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_partner_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("partner_categories_id");
  CREATE INDEX "payload_locked_documents_rels_partners_id_idx" ON "payload_locked_documents_rels" USING btree ("partners_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partner_categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "partners" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "partner_categories" CASCADE;
  DROP TABLE "partners" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_partner_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_partners_fk";
  
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_roles";
  CREATE TYPE "public"."enum_users_roles" AS ENUM('training:admin', 'training:lead');
  ALTER TABLE "users_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_roles" USING "value"::"public"."enum_users_roles";
  DROP INDEX "payload_locked_documents_rels_partner_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_partners_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "partner_categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "partners_id";
  DROP TYPE "public"."enum_partners_status";`)
}
