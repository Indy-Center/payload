import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_partners_social_links_platform" AS ENUM('twitch', 'youtube', 'discord', 'x', 'instagram', 'tiktok', 'facebook', 'github', 'web');
  CREATE TABLE "partners_calls_to_action" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"member_perk" boolean,
  	"perk_text" varchar
  );
  
  CREATE TABLE "partners_social_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"platform" "enum_partners_social_links_platform" NOT NULL,
  	"url" varchar NOT NULL
  );
  
  ALTER TABLE "partners_calls_to_action" ADD CONSTRAINT "partners_calls_to_action_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "partners_social_links" ADD CONSTRAINT "partners_social_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "partners_calls_to_action_order_idx" ON "partners_calls_to_action" USING btree ("_order");
  CREATE INDEX "partners_calls_to_action_parent_id_idx" ON "partners_calls_to_action" USING btree ("_parent_id");
  CREATE INDEX "partners_social_links_order_idx" ON "partners_social_links" USING btree ("_order");
  CREATE INDEX "partners_social_links_parent_id_idx" ON "partners_social_links" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "partners_calls_to_action" CASCADE;
  DROP TABLE "partners_social_links" CASCADE;
  DROP TYPE "public"."enum_partners_social_links_platform";`)
}
