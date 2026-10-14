import * as migration_20261002_214737_initial from './20261002_214737_initial';
import * as migration_20261014_051732_courses_versions_lesson_plans from './20261014_051732_courses_versions_lesson_plans';
import * as migration_20261014_052113_task_tree_and_theory_items from './20261014_052113_task_tree_and_theory_items';
import * as migration_20261014_052312_scenarios from './20261014_052312_scenarios';
import * as migration_20261014_052625_frameworks_competencies_references from './20261014_052625_frameworks_competencies_references';
import * as migration_20261014_053500_grading_scales_and_publishing from './20261014_053500_grading_scales_and_publishing';
import * as migration_20261014_053903_courseware_permissions from './20261014_053903_courseware_permissions';

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
    name: '20261014_053903_courseware_permissions'
  },
];
