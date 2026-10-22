import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { sql } from '@payloadcms/db-postgres'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Articles } from './collections/Articles'
import { Categories } from './collections/Categories'
import { Tags } from './collections/Tags'
import { Authors } from './collections/Authors'
import { Pages } from './collections/Pages'
import { DataPages } from './collections/DataPages'
import { DataPoints } from './collections/DataPoints'
import { Sources } from './collections/Sources'
import { SourceItems } from './collections/SourceItems'
import { StoryClusters } from './collections/StoryClusters'
import { ReviewQueue } from './collections/ReviewQueue'
import { SocialPosts } from './collections/SocialPosts'
import { AuditLog } from './collections/AuditLog'
import { PromptVersions } from './collections/PromptVersions'
import { MetricsDaily } from './collections/MetricsDaily'
import { PushSubscriptions } from './collections/PushSubscriptions'
import { Settings } from './globals/Settings'
import { FrontPage } from './globals/FrontPage'
import { pipelineEndpointsExport } from './endpoints/pipeline'
import { ANALYTICS_DDL } from './lib/analytics'
import { LEARNING_DDL } from './lib/learning'
import { migrations } from './migrations'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const r2Enabled =
  Boolean(process.env.R2_ACCOUNT_ID) &&
  Boolean(process.env.R2_ACCESS_KEY_ID) &&
  Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
  Boolean(process.env.R2_BUCKET)

const plugins = r2Enabled
  ? [
      s3Storage({
        collections: { media: true },
        bucket: process.env.R2_BUCKET!,
        config: {
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
          },
          region: 'auto',
          endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        },
      }),
    ]
  : []

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      title: 'Zaviya Admin',
    },
    components: {
      beforeDashboard: ['/components/admin/ControlRoom#ControlRoom'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Media,
    Articles,
    Categories,
    Tags,
    Authors,
    Pages,
    DataPages,
    DataPoints,
    Sources,
    SourceItems,
    StoryClusters,
    ReviewQueue,
    SocialPosts,
    AuditLog,
    PromptVersions,
    MetricsDaily,
    PushSubscriptions,
  ],
  globals: [Settings, FrontPage],
  localization: {
    locales: [
      { label: 'English', code: 'en' },
      { label: 'اردو', code: 'ur', rtl: true },
    ],
    defaultLocale: 'en',
    fallback: false,
  },
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  serverURL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3100',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
      // ZAV-169: fail fast instead of queueing forever. A request waits at most 15 s for a free connection,
      // and no single statement may run longer than 2 minutes (it would hold a pool slot while the API hangs).
      // `next build` pre-renders pages against the live DB while the worker and video service are busy: it may wait longer.
      connectionTimeoutMillis: process.env.NEXT_PHASE === 'phase-production-build' ? 120_000 : 15_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 120_000,
    },
    // Keep false: onInit owns the pgvector `embedding` column; Drizzle push
    // would otherwise prompt to drop it and hang the non-interactive server.
    push: process.env.PAYLOAD_DATABASE_PUSH === 'true',
    // Production applies pending migrations on boot (not during `next build`, whose parallel
    // page workers would race each other). After changing a collection:
    //   pnpm --filter @zaviya/web payload migrate:create <name>
    prodMigrations: process.env.NEXT_PHASE === 'phase-production-build' ? undefined : migrations,
  }),
  sharp,
  plugins,
  endpoints: pipelineEndpointsExport,
  onInit: async (payload) => {
    try {
      const drizzle = payload.db.drizzle
      await drizzle.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`)
      await drizzle.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`)

      await drizzle.execute(sql`
        DO $$ BEGIN
          ALTER TABLE source_items ADD COLUMN embedding vector(768);
        EXCEPTION
          WHEN duplicate_column THEN NULL;
        END $$
      `)

      await drizzle.execute(sql`ALTER TYPE enum_sources_type ADD VALUE IF NOT EXISTS 'instagram'`)
      for (const stmt of [...ANALYTICS_DDL, ...LEARNING_DDL]) await drizzle.execute(stmt)

      await drizzle.execute(sql`
        CREATE INDEX IF NOT EXISTS source_items_embedding_hnsw_idx
        ON source_items USING hnsw (embedding vector_cosine_ops)
      `)

      await drizzle.execute(sql`
        CREATE INDEX IF NOT EXISTS articles_locales_title_trgm_idx
        ON articles_locales USING gin (title gin_trgm_ops)
      `)
    } catch (err) {
      payload.logger.error({ err }, 'onInit vector/trgm setup failed (may retry on next boot)')
    }
  },
})
