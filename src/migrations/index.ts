import * as migration_20261002_192649_initial from './20261002_192649_initial';

export const migrations = [
  {
    up: migration_20261002_192649_initial.up,
    down: migration_20261002_192649_initial.down,
    name: '20261002_192649_initial'
  },
];
