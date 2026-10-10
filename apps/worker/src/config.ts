import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PAYLOAD_URL: z.string().url().default('http://localhost:3000'),
  PAYLOAD_API_KEY: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_IMAGE_MODEL: z.string().default('gemini-2.5-flash-image'),
  SEARXNG_URL: z.string().url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ADMIN_CHAT_ID: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_PAGE_TOKEN: z.string().optional(),
  IG_USER_ID: z.string().optional(),
  X_BEARER_TOKEN: z.string().optional(),
  X_API_KEY: z.string().optional(),
  X_API_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_SECRET: z.string().optional(),
  X_CURATED_USER_IDS: z.string().optional(),
  BRIDGE_PORT: z.coerce.number().default(8787),
  BRIDGE_TOKEN: z.string().optional(),
  GOLD_API_URL: z.string().url().optional(),
  WORKER_VERSION: z.string().default('0.1.0'),
  LOG_LEVEL: z.string().optional(),
})

export type WorkerEnv = z.infer<typeof envSchema>

export function loadConfig(): WorkerEnv {
  return envSchema.parse(process.env)
}

export function integrationStatus(env: WorkerEnv) {
  return {
    payload: Boolean(env.PAYLOAD_API_KEY),
    gemini: Boolean(env.GEMINI_API_KEY),
    searxng: Boolean(env.SEARXNG_URL),
    telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID),
    meta: Boolean(env.META_PAGE_ID && env.META_PAGE_TOKEN && env.IG_USER_ID),
    xApi: Boolean(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET),
    xReader: Boolean(env.X_BEARER_TOKEN),
    bridge: Boolean(env.BRIDGE_TOKEN),
    goldRates: Boolean(env.GOLD_API_URL),
  }
}
