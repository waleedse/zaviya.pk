import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('REQUIRE_HERO_IMAGE', () => {
  const original = process.env.REQUIRE_HERO_IMAGE
  afterEach(() => {
    if (original === undefined) delete process.env.REQUIRE_HERO_IMAGE
    else process.env.REQUIRE_HERO_IMAGE = original
  })

  it.each([
    [undefined, true],
    ['', true],
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('%s -> %s', (value, expected) => {
    if (value === undefined) delete process.env.REQUIRE_HERO_IMAGE
    else process.env.REQUIRE_HERO_IMAGE = value
    expect(loadConfig().REQUIRE_HERO_IMAGE).toBe(expected)
  })
})

describe('subscriptionChain', () => {
  it('puts each Cursor model before Claude, in order', async () => {
    const { subscriptionChain } = await import('./config.js')
    const chain = subscriptionChain({
      CURSOR_API_KEY: 'k',
      CURSOR_MODEL: 'auto, gemini-3.7-flash-high',
      CLAUDE_CODE_OAUTH_TOKEN: 't',
      CLAUDE_WRITER_MODEL: 'haiku',
      CLAUDE_WRITER_MAX_CALLS_5H: 40,
      SUBSCRIPTION_TASKS: 'write_en,write_ur',
    } as never)
    expect(chain.map((e) => `${e.provider.id}:${e.model}`)).toEqual(['cursor:auto', 'cursor:gemini-3.7-flash-high', 'claude:haiku'])
  })
})

describe('FLUX_IMAGES', () => {
  const original = process.env.FLUX_IMAGES
  afterEach(() => {
    if (original === undefined) delete process.env.FLUX_IMAGES
    else process.env.FLUX_IMAGES = original
  })

  it('is on by default and off with false', () => {
    delete process.env.FLUX_IMAGES
    expect(loadConfig().FLUX_IMAGES).toBe(true)
    process.env.FLUX_IMAGES = 'false'
    expect(loadConfig().FLUX_IMAGES).toBe(false)
  })

  it('hands out no Workers AI credentials for pictures when off', async () => {
    const { fluxCreds } = await import('./config.js')
    const creds = { CLOUDFLARE_ACCOUNT_ID: 'acc', CLOUDFLARE_AI_TOKEN: 'tok' }
    expect(fluxCreds({ ...creds, FLUX_IMAGES: true })).toEqual({ accountId: 'acc', token: 'tok' })
    expect(fluxCreds({ ...creds, FLUX_IMAGES: false })).toEqual({})
  })
})
