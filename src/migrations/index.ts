import * as migration_20261002_214737_initial from './20261002_214737_initial';
import * as migration_20261014_051732_courses_versions_lesson_plans from './20261014_051732_courses_versions_lesson_plans';
import * as migration_20261014_052113_task_tree_and_theory_items from './20261014_052113_task_tree_and_theory_items';
import * as migration_20261014_052312_scenarios from './20261014_052312_scenarios';
import * as migration_20261014_052625_frameworks_competencies_references from './20261014_052625_frameworks_competencies_references';
import * as migration_20261014_053500_grading_scales_and_publishing from './20261014_053500_grading_scales_and_publishing';
import * as migration_20261014_053903_courseware_permissions from './20261014_053903_courseware_permissions';
import * as migration_20261015_025540_partners from './20261015_025540_partners';
import * as migration_20261015_031917_partner_images from './20261015_031917_partner_images';
import * as migration_20261015_040842_partner_links from './20261015_040842_partner_links';
import * as migration_20261016_173341_teacher_resources from './20261016_173341_teacher_resources';
import * as migration_20261016_180115_teacher_resource_descriptions_and_icons from './20261016_180115_teacher_resource_descriptions_and_icons';
import * as migration_20261017_194306_cms_admin_role from './20261017_194306_cms_admin_role';
import * as migration_20261026_014802_sources_replace_references from './20261026_014802_sources_replace_references';
import * as migration_20261026_021707_scenario_positions_and_difficulty from './20261026_021707_scenario_positions_and_difficulty';
import * as migration_20261026_024810_course_enrolment_facts from './20261026_024810_course_enrolment_facts';
import * as migration_20261026_030346_credentials from './20261026_030346_credentials';
import * as migration_20261026_032117_course_prerequisites_and_credential_issued from './20261026_032117_course_prerequisites_and_credential_issued';
import * as migration_20261026_034520_edition_numbers from './20261026_034520_edition_numbers';
import * as migration_20261028_143500_citation_place_and_title from './20261028_143500_citation_place_and_title';
import * as migration_20261028_194448_edition_published_date from './20261028_194448_edition_published_date';
import * as migration_20261028_200131_tighter_course_and_credential_rules from './20261028_200131_tighter_course_and_credential_rules';
import * as migration_20261028_204506_drop_exam_optional from './20261028_204506_drop_exam_optional';

export const migrations = [
  {
    up: migration_20261002_214737_initial.up,
    down: migration_20261002_214737_initial.down,
    name: '20261002_214737_initial',
  },
  {
    up: migration_20261014_051732_courses_versions_lesson_plans.up,
    down: migration_20261014_051732_courses_versions_lesson_plans.down,
    name: '20261014_051732_courses_versions_lesson_plans',
  },
  {
    up: migration_20261014_052113_task_tree_and_theory_items.up,
    down: migration_20261014_052113_task_tree_and_theory_items.down,
    name: '20261014_052113_task_tree_and_theory_items',
  },
  {
    up: migration_20261014_052312_scenarios.up,
    down: migration_20261014_052312_scenarios.down,
    name: '20261014_052312_scenarios',
  },
  {
    up: migration_20261014_052625_frameworks_competencies_references.up,
    down: migration_20261014_052625_frameworks_competencies_references.down,
    name: '20261014_052625_frameworks_competencies_references',
  },
  {
    up: migration_20261014_053500_grading_scales_and_publishing.up,
    down: migration_20261014_053500_grading_scales_and_publishing.down,
    name: '20261014_053500_grading_scales_and_publishing',
  },
  {
    up: migration_20261014_053903_courseware_permissions.up,
    down: migration_20261014_053903_courseware_permissions.down,
    name: '20261014_053903_courseware_permissions',
  },
  {
    up: migration_20261015_025540_partners.up,
    down: migration_20261015_025540_partners.down,
    name: '20261015_025540_partners',
  },
  {
    up: migration_20261015_031917_partner_images.up,
    down: migration_20261015_031917_partner_images.down,
    name: '20261015_031917_partner_images',
  },
  {
    up: migration_20261015_040842_partner_links.up,
    down: migration_20261015_040842_partner_links.down,
    name: '20261015_040842_partner_links',
  },
  {
    up: migration_20261016_173341_teacher_resources.up,
    down: migration_20261016_173341_teacher_resources.down,
    name: '20261016_173341_teacher_resources',
  },
  {
    up: migration_20261016_180115_teacher_resource_descriptions_and_icons.up,
    down: migration_20261016_180115_teacher_resource_descriptions_and_icons.down,
    name: '20261016_180115_teacher_resource_descriptions_and_icons',
  },
  {
    up: migration_20261017_194306_cms_admin_role.up,
    down: migration_20261017_194306_cms_admin_role.down,
    name: '20261017_194306_cms_admin_role',
  },
  {
    up: migration_20261026_014802_sources_replace_references.up,
    down: migration_20261026_014802_sources_replace_references.down,
    name: '20261026_014802_sources_replace_references',
  },
  {
    up: migration_20261026_021707_scenario_positions_and_difficulty.up,
    down: migration_20261026_021707_scenario_positions_and_difficulty.down,
    name: '20261026_021707_scenario_positions_and_difficulty',
  },
  {
    up: migration_20261026_024810_course_enrolment_facts.up,
    down: migration_20261026_024810_course_enrolment_facts.down,
    name: '20261026_024810_course_enrolment_facts',
  },
  {
    up: migration_20261026_030346_credentials.up,
    down: migration_20261026_030346_credentials.down,
    name: '20261026_030346_credentials',
  },
  {
    up: migration_20261026_032117_course_prerequisites_and_credential_issued.up,
    down: migration_20261026_032117_course_prerequisites_and_credential_issued.down,
    name: '20261026_032117_course_prerequisites_and_credential_issued',
  },
  {
    up: migration_20261026_034520_edition_numbers.up,
    down: migration_20261026_034520_edition_numbers.down,
    name: '20261026_034520_edition_numbers',
  },
  {
    up: migration_20261028_143500_citation_place_and_title.up,
    down: migration_20261028_143500_citation_place_and_title.down,
    name: '20261028_143500_citation_place_and_title',
  },
  {
    up: migration_20261028_194448_edition_published_date.up,
    down: migration_20261028_194448_edition_published_date.down,
    name: '20261028_194448_edition_published_date',
  },
  {
    up: migration_20261028_200131_tighter_course_and_credential_rules.up,
    down: migration_20261028_200131_tighter_course_and_credential_rules.down,
    name: '20261028_200131_tighter_course_and_credential_rules',
  },
  {
    up: migration_20261028_204506_drop_exam_optional.up,
    down: migration_20261028_204506_drop_exam_optional.down,
    name: '20261028_204506_drop_exam_optional'
  },
];
