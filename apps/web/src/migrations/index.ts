import * as migration_20261011_162439_initial from './20261011_162439_initial';
import * as migration_20261011_191032_r2_object_key from './20261011_191032_r2_object_key';
import * as migration_20261011_210826_media_alt_nullable from './20261011_210826_media_alt_nullable';
import * as migration_20261012_200348_add_ai_category from './20261012_200348_add_ai_category';

export const migrations = [
  {
    up: migration_20261011_162439_initial.up,
    down: migration_20261011_162439_initial.down,
    name: '20261011_162439_initial',
  },
  {
    up: migration_20261011_191032_r2_object_key.up,
    down: migration_20261011_191032_r2_object_key.down,
    name: '20261011_191032_r2_object_key',
  },
  {
    up: migration_20261011_210826_media_alt_nullable.up,
    down: migration_20261011_210826_media_alt_nullable.down,
    name: '20261011_210826_media_alt_nullable',
  },
  {
    up: migration_20261012_200348_add_ai_category.up,
    down: migration_20261012_200348_add_ai_category.down,
    name: '20261012_200348_add_ai_category'
  },
];
