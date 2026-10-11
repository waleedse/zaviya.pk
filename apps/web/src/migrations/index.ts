import * as migration_20261011_162439_initial from './20261011_162439_initial';
import * as migration_20261011_191032_r2_object_key from './20261011_191032_r2_object_key';

export const migrations = [
  {
    up: migration_20261011_162439_initial.up,
    down: migration_20261011_162439_initial.down,
    name: '20261011_162439_initial',
  },
  {
    up: migration_20261011_191032_r2_object_key.up,
    down: migration_20261011_191032_r2_object_key.down,
    name: '20261011_191032_r2_object_key'
  },
];
