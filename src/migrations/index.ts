import * as migration_20261002_192649_initial from './20261002_192649_initial';
import * as migration_20261002_202523_r2_storage from './20261002_202523_r2_storage';

export const migrations = [
  {
    up: migration_20261002_192649_initial.up,
    down: migration_20261002_192649_initial.down,
    name: '20261002_192649_initial',
  },
  {
    up: migration_20261002_202523_r2_storage.up,
    down: migration_20261002_202523_r2_storage.down,
    name: '20261002_202523_r2_storage'
  },
];
