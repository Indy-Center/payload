import * as migration_20261002_214737_initial from './20261002_214737_initial';
import * as migration_20261014_051732_courses_versions_lesson_plans from './20261014_051732_courses_versions_lesson_plans';
import * as migration_20261014_052113_task_tree_and_theory_items from './20261014_052113_task_tree_and_theory_items';

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
    name: '20261014_052113_task_tree_and_theory_items'
  },
];
