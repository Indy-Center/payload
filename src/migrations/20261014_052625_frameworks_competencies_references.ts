import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "frameworks" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"edition" varchar NOT NULL,
  	"label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "competencies" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"framework_id" uuid NOT NULL,
  	"source_id" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar,
  	"parent_id" uuid,
  	"source_reference" varchar,
  	"rubric_theory" varchar,
  	"rubric_practical" varchar,
  	"paired_gcap_code" varchar,
  	"label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "references" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"edition" varchar,
  	"url" varchar,
  	"document_id" uuid,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tasks_mappings" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"competency_id" uuid NOT NULL
  );
  
  CREATE TABLE "tasks_citations" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"reference_id" uuid NOT NULL,
  	"section" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "frameworks_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "competencies_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "references_id" uuid;
  ALTER TABLE "competencies" ADD CONSTRAINT "competencies_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "competencies" ADD CONSTRAINT "competencies_parent_id_competencies_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."competencies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "references" ADD CONSTRAINT "references_document_id_media_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks_mappings" ADD CONSTRAINT "tasks_mappings_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks_mappings" ADD CONSTRAINT "tasks_mappings_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tasks_citations" ADD CONSTRAINT "tasks_citations_reference_id_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."references"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks_citations" ADD CONSTRAINT "tasks_citations_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "frameworks_updated_at_idx" ON "frameworks" USING btree ("updated_at");
  CREATE INDEX "frameworks_created_at_idx" ON "frameworks" USING btree ("created_at");
  CREATE UNIQUE INDEX "name_edition_idx" ON "frameworks" USING btree ("name","edition");
  CREATE INDEX "competencies_framework_idx" ON "competencies" USING btree ("framework_id");
  CREATE INDEX "competencies_parent_idx" ON "competencies" USING btree ("parent_id");
  CREATE INDEX "competencies_updated_at_idx" ON "competencies" USING btree ("updated_at");
  CREATE INDEX "competencies_created_at_idx" ON "competencies" USING btree ("created_at");
  CREATE UNIQUE INDEX "framework_sourceId_idx" ON "competencies" USING btree ("framework_id","source_id");
  CREATE INDEX "references_document_idx" ON "references" USING btree ("document_id");
  CREATE INDEX "references_updated_at_idx" ON "references" USING btree ("updated_at");
  CREATE INDEX "references_created_at_idx" ON "references" USING btree ("created_at");
  CREATE INDEX "tasks_mappings_order_idx" ON "tasks_mappings" USING btree ("_order");
  CREATE INDEX "tasks_mappings_parent_id_idx" ON "tasks_mappings" USING btree ("_parent_id");
  CREATE INDEX "tasks_mappings_competency_idx" ON "tasks_mappings" USING btree ("competency_id");
  CREATE INDEX "tasks_citations_order_idx" ON "tasks_citations" USING btree ("_order");
  CREATE INDEX "tasks_citations_parent_id_idx" ON "tasks_citations" USING btree ("_parent_id");
  CREATE INDEX "tasks_citations_reference_idx" ON "tasks_citations" USING btree ("reference_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_frameworks_fk" FOREIGN KEY ("frameworks_id") REFERENCES "public"."frameworks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_competencies_fk" FOREIGN KEY ("competencies_id") REFERENCES "public"."competencies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_references_fk" FOREIGN KEY ("references_id") REFERENCES "public"."references"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_frameworks_id_idx" ON "payload_locked_documents_rels" USING btree ("frameworks_id");
  CREATE INDEX "payload_locked_documents_rels_competencies_id_idx" ON "payload_locked_documents_rels" USING btree ("competencies_id");
  CREATE INDEX "payload_locked_documents_rels_references_id_idx" ON "payload_locked_documents_rels" USING btree ("references_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "frameworks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "competencies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "references" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tasks_mappings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tasks_citations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "frameworks" CASCADE;
  DROP TABLE "competencies" CASCADE;
  DROP TABLE "references" CASCADE;
  DROP TABLE "tasks_mappings" CASCADE;
  DROP TABLE "tasks_citations" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_frameworks_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_competencies_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_references_fk";
  
  DROP INDEX "payload_locked_documents_rels_frameworks_id_idx";
  DROP INDEX "payload_locked_documents_rels_competencies_id_idx";
  DROP INDEX "payload_locked_documents_rels_references_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "frameworks_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "competencies_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "references_id";`)
}
