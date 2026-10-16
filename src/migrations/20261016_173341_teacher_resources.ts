import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "teacher_resources_resources" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"new_tab" boolean DEFAULT true
  );
  
  CREATE TABLE "teacher_resources" (
  	"id" uuid PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "teacher_resources_resources" ADD CONSTRAINT "teacher_resources_resources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."teacher_resources"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "teacher_resources_resources_order_idx" ON "teacher_resources_resources" USING btree ("_order");
  CREATE INDEX "teacher_resources_resources_parent_id_idx" ON "teacher_resources_resources" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "teacher_resources_resources" CASCADE;
  DROP TABLE "teacher_resources" CASCADE;`)
}
