import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * References become sources, and a source loses its "Indy document" upload (decision 0053).
 * The tables are renamed rather than recreated, so every source and citation keeps its id.
 * A source with an uploaded document stops the migration, so no file is dropped silently, and
 * so does one with no link at all, which a source now needs. Each is named.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const names = async (where: ReturnType<typeof sql>) =>
    (
      await db.execute<{ name: string }>(
        sql`SELECT "name" FROM "references" WHERE ${where} ORDER BY "name"`,
      )
    ).rows.map((row) => row.name)
  const withDocuments = await names(sql`"document_id" IS NOT NULL`)
  const withoutLinks = await names(sql`"document_id" IS NULL AND coalesce("url", '') = ''`)

  const faults = []
  if (withDocuments.length > 0) {
    faults.push(
      `These sources have an uploaded Indy document, which sources no longer keep: ` +
        `${withDocuments.join(', ')}. ` +
        `Give each an https link in place of its document and clear the upload, then migrate again.`,
    )
  }
  if (withoutLinks.length > 0) {
    faults.push(
      `These sources have no link, which sources now need: ${withoutLinks.join(', ')}. ` +
        `Give each an https link, then migrate again.`,
    )
  }
  if (faults.length > 0) throw new Error(faults.join(' '))

  await db.execute(sql`
  ALTER TABLE "references" DROP CONSTRAINT "references_document_id_media_id_fk";
  DROP INDEX "references_document_idx";
  ALTER TABLE "references" DROP COLUMN "document_id";
  ALTER TABLE "references" ALTER COLUMN "url" SET NOT NULL;
  ALTER TABLE "references" RENAME TO "sources";
  ALTER TABLE "sources" RENAME CONSTRAINT "references_pkey" TO "sources_pkey";
  ALTER INDEX "references_updated_at_idx" RENAME TO "sources_updated_at_idx";
  ALTER INDEX "references_created_at_idx" RENAME TO "sources_created_at_idx";
  ALTER TABLE "tasks_citations" RENAME COLUMN "reference_id" TO "source_id";
  ALTER TABLE "tasks_citations" RENAME CONSTRAINT "tasks_citations_reference_id_references_id_fk" TO "tasks_citations_source_id_sources_id_fk";
  ALTER INDEX "tasks_citations_reference_idx" RENAME TO "tasks_citations_source_idx";
  ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "references_id" TO "sources_id";
  ALTER TABLE "payload_locked_documents_rels" RENAME CONSTRAINT "payload_locked_documents_rels_references_fk" TO "payload_locked_documents_rels_sources_fk";
  ALTER INDEX "payload_locked_documents_rels_references_id_idx" RENAME TO "payload_locked_documents_rels_sources_id_idx";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER INDEX "payload_locked_documents_rels_sources_id_idx" RENAME TO "payload_locked_documents_rels_references_id_idx";
  ALTER TABLE "payload_locked_documents_rels" RENAME CONSTRAINT "payload_locked_documents_rels_sources_fk" TO "payload_locked_documents_rels_references_fk";
  ALTER TABLE "payload_locked_documents_rels" RENAME COLUMN "sources_id" TO "references_id";
  ALTER INDEX "tasks_citations_source_idx" RENAME TO "tasks_citations_reference_idx";
  ALTER TABLE "tasks_citations" RENAME CONSTRAINT "tasks_citations_source_id_sources_id_fk" TO "tasks_citations_reference_id_references_id_fk";
  ALTER TABLE "tasks_citations" RENAME COLUMN "source_id" TO "reference_id";
  ALTER INDEX "sources_created_at_idx" RENAME TO "references_created_at_idx";
  ALTER INDEX "sources_updated_at_idx" RENAME TO "references_updated_at_idx";
  ALTER TABLE "sources" RENAME CONSTRAINT "sources_pkey" TO "references_pkey";
  ALTER TABLE "sources" RENAME TO "references";
  ALTER TABLE "references" ALTER COLUMN "url" DROP NOT NULL;
  ALTER TABLE "references" ADD COLUMN "document_id" uuid;
  ALTER TABLE "references" ADD CONSTRAINT "references_document_id_media_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "references_document_idx" ON "references" USING btree ("document_id");`)
}
