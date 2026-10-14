import * as migration_20261002_214737_initial from './20261002_214737_initial';
import * as migration_20261014_051732_courses_versions_lesson_plans from './20261014_051732_courses_versions_lesson_plans';

export const migrations = [
  {
    up: migration_20261002_214737_initial.up,
    down: migration_20261002_214737_initial.down,
    name: '20261002_214737_initial',
  },
  {
    up: migration_20261014_051732_courses_versions_lesson_plans.up,
    down: migration_20261014_051732_courses_versions_lesson_plans.down,
    name: '20261014_051732_courses_versions_lesson_plans'
  },
];
