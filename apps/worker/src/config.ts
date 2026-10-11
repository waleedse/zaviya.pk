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
  /**
   * Publish without waiting for a human: "safe" auto-approves everything except blasphemy and
   * stories about minors (legal/safety risk in Pakistan); "all" approves those too; "off" keeps the review queue.
   */
  AUTO_APPROVE: z.enum(['off', 'safe', 'all']).default('safe'),
  /** Also write the Urdu version (off while the site runs English-only) */
  WRITE_URDU: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
  /** Distinct outlets a story needs before it is triaged */
  TRIAGE_MIN_SOURCES: z.coerce.number().min(1).default(2),
  /** OpenAI-compatible API (DeepSeek: https://api.deepseek.com/v1, Qwen intl: https://dashscope-intl.aliyuncs.com/compatible-mode/v1) */
  LLM_API_BASE_URL: optionalUrl,
  LLM_API_KEY: optionalStr,
  /** Model on that API used when Gemini's free quota runs out, e.g. deepseek-flash or qwen3.7-flash */
  LLM_API_FALLBACK_MODEL: optionalStr,
  /** Cheap model on that API for triage/SEO/QA when LOCAL_MODEL=off, e.g. qwen/qwen3.7-flash */
  LLM_API_LIGHT_MODEL: optionalStr,
  /** Local Ollama model for triage/SEO/QA and as the writing fallback ("off" to disable) */
  LOCAL_MODEL: z.string().default('qwen3:8b'),
  DISCOVERY_INTERVAL_MIN: z.coerce.number().min(5).default(20),
  /** X search queries separated by `||` (overrides the built-in list) */
  DISCOVERY_X_QUERIES: optionalStr,
  /** Instagram usernames, comma separated (overrides the built-in list) */
  DISCOVERY_IG_PROFILES: optionalStr,
  /** Google account on gemini.google.com when Chrome has several: the /u/N/ number (e.g. 4) or the email */
  GEMINI_WEB_ACCOUNT: optionalStr,
  /** Never publish with only the branded text card: wait for a real Gemini illustration (default on) */
  REQUIRE_HERO_IMAGE: z.preprocess((v) => (typeof v === 'boolean' ? v : v === undefined || v === '' ? true : v === 'true' || v === '1'), z.boolean()).default(true),
  /** How often to retry the image before giving up (retries are 15 min apart) */
  HERO_IMAGE_MAX_TRIES: z.coerce.number().min(1).default(8),
  BRIDGE_PORT: z.coerce.number().default(8787),
  /** Interface the bridge listens on: keep 127.0.0.1 natively, 0.0.0.0 in Docker */
  BRIDGE_HOST: z.string().default('127.0.0.1'),
  /** Base URL the browser can open for uploaded media (differs from PAYLOAD_URL inside Docker) */
  PUBLIC_MEDIA_URL: optionalUrl,
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
