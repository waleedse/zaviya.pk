import { CliProvider, WorkersAIProvider, WORKERS_AI_EMBED_MODEL, type LLMTask } from '@zaviya/llm'
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
  /** ZAV-111: Facebook posts carry the article link as the Page's first comment instead of in the caption (set 0 to switch back) */
  FB_LINK_IN_COMMENT: z.preprocess((v) => (typeof v === 'boolean' ? v : v === undefined || v === '' ? true : v === 'true' || v === '1'), z.boolean()).default(true),
  /** ZAV-132: reply to comments on our own Facebook and Instagram posts (kill switch: set 0) */
  COMMENT_REPLIES: z.preprocess((v) => (typeof v === 'boolean' ? v : v === undefined || v === '' ? true : v === 'true' || v === '1'), z.boolean()).default(true),
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
  /** Cursor plan via `cursor-agent` (first writing engine when set) */
  CURSOR_API_KEY: optionalStr,
  /** Cursor models in order, comma separated: when one hits its limit the next takes over */
  CURSOR_MODEL: z.string().default('auto,gemini-3.7-flash-high,composer-2.5'),
  /** Claude plan via `claude -p` (`claude setup-token`): writing engine after Cursor */
  CLAUDE_CODE_OAUTH_TOKEN: optionalStr,
  CLAUDE_WRITER_MODEL: z.string().default('haiku'),
  /** Writer calls allowed per 5 hours, so the agents keep their share of the Claude plan */
  CLAUDE_WRITER_MAX_CALLS_5H: z.coerce.number().min(0).default(40),
  /** Editor gate: written stories wait as drafts until the editor agent publishes or rejects them */
  EDITOR_GATE: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
  /** Gate fallback: publish the oldest waiting story when nothing went out for this many minutes */
  /** Normal stories go to the editor as a pitch and are written only once approved (needs EDITOR_GATE) */
  EDITOR_PITCH: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
  EDITOR_GATE_FALLBACK_MIN: z.coerce.number().min(10).default(40),
  /** Minimum characters of real source text before a story is written (headline-only items are skipped) */
  MIN_SOURCE_CHARS: z.coerce.number().min(0).default(500),
  /** Tasks the subscription engines take, comma separated */
  SUBSCRIPTION_TASKS: z.string().default('write_en,write_ur'),
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
  /** Hero images: `flux` = Cloudflare Workers AI first, Gemini (extension) as backup; `extension` = Gemini first; `zimage` = Z-Image Turbo (fal.ai) first, then FLUX, then Gemini */
  IMAGE_SOURCE: z.enum(['flux', 'extension', 'zimage']).catch('flux').default('flux'),
  /** fal.ai key for Z-Image Turbo (IMAGE_SOURCE=zimage): fast, about half a cent a picture */
  FAL_KEY: optionalStr,
  /** The video service's media hub: the explainer pictures are claimed from it (needs MEDIA_AGENT_TOKEN, the same token the Mac agent uses) */
  MEDIA_AGENT_TOKEN: optionalStr,
  VIDEO_HUB_URL: z.string().default('http://video:8790'),
  /** Cloudflare Workers AI (FLUX) for hero images: account id (same as R2) + API token */
  CLOUDFLARE_ACCOUNT_ID: optionalStr,
  CLOUDFLARE_AI_TOKEN: optionalStr,
  /** Gemini attempts before the FLUX fallback is used */
  GEMINI_IMAGE_TRIES_BEFORE_FALLBACK: z.coerce.number().min(1).default(3),
  HERO_IMAGE_MAX_TRIES: z.coerce.number().min(1).default(8),
  BRIDGE_PORT: z.coerce.number().default(8787),
  /** Interface the bridge listens on: keep 127.0.0.1 natively, 0.0.0.0 in Docker */
  BRIDGE_HOST: z.string().default('127.0.0.1'),
  /** Base URL the browser can open for uploaded media (differs from PAYLOAD_URL inside Docker) */
  PUBLIC_MEDIA_URL: optionalUrl,
  /** Public R2 domain for generated social cards: Instagram fetches these, so they must not go through the busy web app (ZAV-184) */
  MEDIA_CDN_URL: z.preprocess(emptyToUndef, z.string().url().default('https://media.zaviya.pk')),
  /** Headless Chromium for the social post cards (Urdu needs a real browser engine) */
  CHROMIUM_PATH: optionalStr,
  BRIDGE_TOKEN: optionalStr,
  GOLD_API_URL: optionalUrl,
  /** Email commands: Waleed mails ops@zaviya.pk and the worker carries it out (everything below is inert unless enabled) */
  MAIL_COMMANDS_ENABLED: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
  OPS_MAIL_USER: optionalStr,
  OPS_MAIL_PASSWORD: optionalStr,
  MAIL_HOST: z.string().default('mail.zaviya.pk'),
  /** TEST ONLY: extra sender addresses accepted besides waleed@zaviya.pk (comma separated) */
  MAIL_COMMANDS_ALLOW_FROM: optionalStr,
  /** Morning briefing and confirmation mails (ZAV-109 phase 2). Off until NEWSLETTER_SEND=true AND the news@ login is set. */
  NEWSLETTER_SEND: z.preprocess((v) => v === 'true' || v === '1', z.boolean()).default(false),
  NEWS_MAIL_USER: z.preprocess(emptyToUndef, z.string().default('news@zaviya.pk')),
  NEWS_MAIL_PASSWORD: optionalStr,
  /** Hand-offs to the agents are Linear issues */
  LINEAR_API_KEY: optionalStr,
  LINEAR_TEAM_KEY: z.string().default('ZAV'),
  /** Slot list of the video service (same value as the video container's) */
  VIDEO_SLOTS: optionalStr,
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
    cursor: Boolean(env.CURSOR_API_KEY),
    claude: Boolean(env.CLAUDE_CODE_OAUTH_TOKEN),
    searxng: Boolean(env.SEARXNG_URL),
    telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID),
    meta: Boolean(env.META_PAGE_ID && env.META_PAGE_TOKEN && env.IG_USER_ID),
    xApi: Boolean(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET),
    xReader: Boolean(env.X_BEARER_TOKEN),
    bridge: Boolean(env.BRIDGE_TOKEN),
    goldRates: Boolean(env.GOLD_API_URL),
    newsletter: env.NEWSLETTER_SEND && Boolean(env.NEWS_MAIL_PASSWORD),
    mailCommands: env.MAIL_COMMANDS_ENABLED && Boolean(env.OPS_MAIL_USER && env.OPS_MAIL_PASSWORD),
  }
}

/** Subscription engines for the LLM router, in order: Cursor first, then Claude. */
export function subscriptionChain(env: WorkerEnv) {
  const tasks = env.SUBSCRIPTION_TASKS.split(',').map((t) => t.trim()).filter(Boolean) as LLMTask[]
  const chain: { provider: CliProvider; model: string; tasks: LLMTask[] }[] = []
  if (env.CURSOR_API_KEY) {
    // One provider per model, so each model rests on its own when it hits a limit
    for (const model of env.CURSOR_MODEL.split(',').map((m) => m.trim()).filter(Boolean)) {
      chain.push({ provider: new CliProvider({ kind: 'cursor', env: { CURSOR_API_KEY: env.CURSOR_API_KEY } }), model, tasks })
    }
  }
  if (env.CLAUDE_CODE_OAUTH_TOKEN) {
    chain.push({
      provider: new CliProvider({
        kind: 'claude',
        env: { CLAUDE_CODE_OAUTH_TOKEN: env.CLAUDE_CODE_OAUTH_TOKEN },
        maxCallsPer5h: env.CLAUDE_WRITER_MAX_CALLS_5H,
      }),
      model: env.CLAUDE_WRITER_MODEL,
      tasks,
    })
  }
  return chain
}

/** Embeddings on Cloudflare Workers AI when its credentials are set (Gemini's free tier is 1,000/day). */
export function embedder(env: WorkerEnv) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_AI_TOKEN) return undefined
  return { provider: new WorkersAIProvider(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_AI_TOKEN), model: WORKERS_AI_EMBED_MODEL }
}
