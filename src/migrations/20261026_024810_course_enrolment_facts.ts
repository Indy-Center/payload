import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A course gains its enrolment facts: a prerequisites note, consolidation hours and position
 * types, its rating and VATUSA Academy exams, estimated weeks, whether its exam is optional, and
 * its Moodle link. A course version gains its completion standard.
 *
 * A course version's "Academy required" is dropped and its data is not carried over: no real
 * course has been entered yet, and the Training Admin sets each course's Academy exam instead.
 * Going down brings the column back unticked.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_courses_consolidation_position_types" AS ENUM('DEL', 'GND', 'TWR', 'APP', 'DEP', 'CTR', 'FSS');
  CREATE TYPE "public"."enum_courses_rating_exam" AS ENUM('none', 'S1', 'S2', 'S3', 'C1');
  CREATE TYPE "public"."enum_courses_academy_exam" AS ENUM('none', 'S2', 'S3', 'C1');
  CREATE TABLE "courses_consolidation_position_types" (
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"value" "enum_courses_consolidation_position_types",
  	"id" uuid PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "courses" ADD COLUMN "prerequisites_note" varchar;
  ALTER TABLE "courses" ADD COLUMN "consolidation_hours" numeric;
  ALTER TABLE "courses" ADD COLUMN "rating_exam" "enum_courses_rating_exam" DEFAULT 'none';
  ALTER TABLE "courses" ADD COLUMN "academy_exam" "enum_courses_academy_exam" DEFAULT 'none';
  ALTER TABLE "courses" ADD COLUMN "estimated_weeks_min" numeric;
  ALTER TABLE "courses" ADD COLUMN "estimated_weeks_max" numeric;
  ALTER TABLE "courses" ADD COLUMN "exam_optional" boolean DEFAULT false;
  ALTER TABLE "courses" ADD COLUMN "moodle_url" varchar;
  ALTER TABLE "course_versions" ADD COLUMN "completion_standard" varchar;
  ALTER TABLE "courses_consolidation_position_types" ADD CONSTRAINT "courses_consolidation_position_types_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "courses_consolidation_position_types_order_idx" ON "courses_consolidation_position_types" USING btree ("order");
  CREATE INDEX "courses_consolidation_position_types_parent_idx" ON "courses_consolidation_position_types" USING btree ("parent_id");
  ALTER TABLE "course_versions" DROP COLUMN "academy_required";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "courses_consolidation_position_types" CASCADE;
  ALTER TABLE "course_versions" ADD COLUMN "academy_required" boolean DEFAULT false;
  ALTER TABLE "courses" DROP COLUMN "prerequisites_note";
  ALTER TABLE "courses" DROP COLUMN "consolidation_hours";
  ALTER TABLE "courses" DROP COLUMN "rating_exam";
  ALTER TABLE "courses" DROP COLUMN "academy_exam";
  ALTER TABLE "courses" DROP COLUMN "estimated_weeks_min";
  ALTER TABLE "courses" DROP COLUMN "estimated_weeks_max";
  ALTER TABLE "courses" DROP COLUMN "exam_optional";
  ALTER TABLE "courses" DROP COLUMN "moodle_url";
  ALTER TABLE "course_versions" DROP COLUMN "completion_standard";
  DROP TYPE "public"."enum_courses_consolidation_position_types";
  DROP TYPE "public"."enum_courses_rating_exam";
  DROP TYPE "public"."enum_courses_academy_exam";`)
}
