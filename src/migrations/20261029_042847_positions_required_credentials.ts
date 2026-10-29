import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "positions_indy_required_credentials_generated" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "positions_indy_required_credentials_override" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "positions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"credentials_id" uuid
  );
  
  ALTER TABLE "positions_indy_required_credentials_generated" ADD CONSTRAINT "positions_indy_required_credentials_generated_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "positions_indy_required_credentials_override" ADD CONSTRAINT "positions_indy_required_credentials_override_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "positions_rels" ADD CONSTRAINT "positions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "positions_rels" ADD CONSTRAINT "positions_rels_credentials_fk" FOREIGN KEY ("credentials_id") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "positions_indy_required_credentials_generated_order_idx" ON "positions_indy_required_credentials_generated" USING btree ("_order");
  CREATE INDEX "positions_indy_required_credentials_generated_parent_id_idx" ON "positions_indy_required_credentials_generated" USING btree ("_parent_id");
  CREATE INDEX "positions_indy_required_credentials_override_order_idx" ON "positions_indy_required_credentials_override" USING btree ("_order");
  CREATE INDEX "positions_indy_required_credentials_override_parent_id_idx" ON "positions_indy_required_credentials_override" USING btree ("_parent_id");
  CREATE INDEX "positions_rels_order_idx" ON "positions_rels" USING btree ("order");
  CREATE INDEX "positions_rels_parent_idx" ON "positions_rels" USING btree ("parent_id");
  CREATE INDEX "positions_rels_path_idx" ON "positions_rels" USING btree ("path");
  CREATE INDEX "positions_rels_credentials_id_idx" ON "positions_rels" USING btree ("credentials_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "positions_indy_required_credentials_generated" CASCADE;
  DROP TABLE "positions_indy_required_credentials_override" CASCADE;
  DROP TABLE "positions_rels" CASCADE;`)
}
