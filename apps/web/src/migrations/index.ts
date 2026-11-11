import * as migration_20261011_162439_initial from './20261011_162439_initial';
import * as migration_20261011_191032_r2_object_key from './20261011_191032_r2_object_key';
import * as migration_20261011_210826_media_alt_nullable from './20261011_210826_media_alt_nullable';
import * as migration_20261012_200348_add_ai_category from './20261012_200348_add_ai_category';
import * as migration_20261015_220642_front_page_plan from './20261015_220642_front_page_plan';
import * as migration_20261103_192624_mobile_prices from './20261103_192624_mobile_prices';
import * as migration_20261104_043222_results_vacations_closures from './20261104_043222_results_vacations_closures';
import * as migration_20261105_064505_appliance_prices from './20261105_064505_appliance_prices';
import * as migration_20261105_222249_price_engine from './20261105_222249_price_engine';
import * as migration_20261111_201829_youtube_social_posts from './20261111_201829_youtube_social_posts';

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
    name: '20261012_200348_add_ai_category',
  },
  {
    up: migration_20261015_220642_front_page_plan.up,
    down: migration_20261015_220642_front_page_plan.down,
    name: '20261015_220642_front_page_plan',
  },
  {
    up: migration_20261103_192624_mobile_prices.up,
    down: migration_20261103_192624_mobile_prices.down,
    name: '20261103_192624_mobile_prices',
  },
  {
    up: migration_20261104_043222_results_vacations_closures.up,
    down: migration_20261104_043222_results_vacations_closures.down,
    name: '20261104_043222_results_vacations_closures',
  },
  {
    up: migration_20261105_064505_appliance_prices.up,
    down: migration_20261105_064505_appliance_prices.down,
    name: '20261105_064505_appliance_prices',
  },
  {
    up: migration_20261105_222249_price_engine.up,
    down: migration_20261105_222249_price_engine.down,
    name: '20261105_222249_price_engine',
  },
  {
    up: migration_20261111_201829_youtube_social_posts.up,
    down: migration_20261111_201829_youtube_social_posts.down,
    name: '20261111_201829_youtube_social_posts'
  },
];
