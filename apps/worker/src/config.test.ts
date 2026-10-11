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
