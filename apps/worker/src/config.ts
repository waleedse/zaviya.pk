import { z } from 'zod'

/** Treat blank env vars as unset so optional `.url()` fields don't fail. */
const emptyToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)
const optionalUrl = z.preprocess(emptyToUndef, z.string().url().optional())
const optionalStr = z.preprocess(emptyToUndef, z.string().optional())

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PAYLOAD_URL: z.string().url().default('http://localhost:3100'),
  PAYLOAD_API_KEY: optionalStr,
  REDIS_URL: z.string().default('redis://localhost:6379'),
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  GEMINI_API_KEY: optionalStr,
  GEMINI_IMAGE_MODEL: z.string().default('gemini-2.5-flash-image'),
  SEARXNG_URL: optionalUrl,
  TELEGRAM_BOT_TOKEN: optionalStr,
  TELEGRAM_ADMIN_CHAT_ID: optionalStr,
  META_PAGE_ID: optionalStr,
  META_PAGE_TOKEN: optionalStr,
  IG_USER_ID: optionalStr,
  X_BEARER_TOKEN: optionalStr,
  X_API_KEY: optionalStr,
  X_API_SECRET: optionalStr,
  X_ACCESS_TOKEN: optionalStr,
  X_ACCESS_SECRET: optionalStr,
  X_CURATED_USER_IDS: optionalStr,
  BRIDGE_PORT: z.coerce.number().default(8787),
  BRIDGE_TOKEN: optionalStr,
  GOLD_API_URL: optionalUrl,
  WORKER_VERSION: z.string().default('0.1.0'),
  LOG_LEVEL: optionalStr,
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
