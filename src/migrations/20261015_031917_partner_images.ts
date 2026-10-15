import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "partners_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" uuid
  );
  
  ALTER TABLE "media" ADD COLUMN "sizes_logo_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_logo_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_logo_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_logo_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_logo_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_logo_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_banner_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_banner_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_banner_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_banner_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_banner_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_banner_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_thumbnail_filename" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_large_url" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_large_width" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_large_height" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_large_mime_type" varchar;
  ALTER TABLE "media" ADD COLUMN "sizes_large_filesize" numeric;
  ALTER TABLE "media" ADD COLUMN "sizes_large_filename" varchar;
  ALTER TABLE "partners" ADD COLUMN "logo_id" uuid;
  ALTER TABLE "partners" ADD COLUMN "banner_id" uuid;
  ALTER TABLE "partners_rels" ADD CONSTRAINT "partners_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partners_rels" ADD CONSTRAINT "partners_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partners_rels_order_idx" ON "partners_rels" USING btree ("order");
  CREATE INDEX "partners_rels_parent_idx" ON "partners_rels" USING btree ("parent_id");
  CREATE INDEX "partners_rels_path_idx" ON "partners_rels" USING btree ("path");
  CREATE INDEX "partners_rels_media_id_idx" ON "partners_rels" USING btree ("media_id");
  ALTER TABLE "partners" ADD CONSTRAINT "partners_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "partners" ADD CONSTRAINT "partners_banner_id_media_id_fk" FOREIGN KEY ("banner_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "media_sizes_logo_sizes_logo_filename_idx" ON "media" USING btree ("sizes_logo_filename");
  CREATE INDEX "media_sizes_banner_sizes_banner_filename_idx" ON "media" USING btree ("sizes_banner_filename");
  CREATE INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX "media_sizes_large_sizes_large_filename_idx" ON "media" USING btree ("sizes_large_filename");
  CREATE INDEX "partners_logo_idx" ON "partners" USING btree ("logo_id");
  CREATE INDEX "partners_banner_idx" ON "partners" USING btree ("banner_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "partners_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "partners_rels" CASCADE;
  ALTER TABLE "partners" DROP CONSTRAINT "partners_logo_id_media_id_fk";
  
  ALTER TABLE "partners" DROP CONSTRAINT "partners_banner_id_media_id_fk";
  
  DROP INDEX "media_sizes_logo_sizes_logo_filename_idx";
  DROP INDEX "media_sizes_banner_sizes_banner_filename_idx";
  DROP INDEX "media_sizes_thumbnail_sizes_thumbnail_filename_idx";
  DROP INDEX "media_sizes_large_sizes_large_filename_idx";
  DROP INDEX "partners_logo_idx";
  DROP INDEX "partners_banner_idx";
  ALTER TABLE "media" DROP COLUMN "sizes_logo_url";
  ALTER TABLE "media" DROP COLUMN "sizes_logo_width";
  ALTER TABLE "media" DROP COLUMN "sizes_logo_height";
  ALTER TABLE "media" DROP COLUMN "sizes_logo_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_logo_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_logo_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_banner_url";
  ALTER TABLE "media" DROP COLUMN "sizes_banner_width";
  ALTER TABLE "media" DROP COLUMN "sizes_banner_height";
  ALTER TABLE "media" DROP COLUMN "sizes_banner_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_banner_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_banner_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_url";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_width";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_height";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_thumbnail_filename";
  ALTER TABLE "media" DROP COLUMN "sizes_large_url";
  ALTER TABLE "media" DROP COLUMN "sizes_large_width";
  ALTER TABLE "media" DROP COLUMN "sizes_large_height";
  ALTER TABLE "media" DROP COLUMN "sizes_large_mime_type";
  ALTER TABLE "media" DROP COLUMN "sizes_large_filesize";
  ALTER TABLE "media" DROP COLUMN "sizes_large_filename";
  ALTER TABLE "partners" DROP COLUMN "logo_id";
  ALTER TABLE "partners" DROP COLUMN "banner_id";`)
}
