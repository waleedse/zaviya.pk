import { afterEach, describe, expect, it } from 'vitest'
import { genericScene, m3Generator } from './m3-hero.js'

describe('M3 hero scenes', () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
  })

  it('drops names so the model never draws a real person', () => {
    const s = genericScene('Imran Khan seeks urgent care from court as Bushra Bibi waits', 'pakistan')
    expect(s).not.toMatch(/Imran|Khan|Bushra|Bibi/)
    expect(s).toContain('Pakistani city')
    expect(s).toContain('urgent care court')
  })

  it('uses the desk scene when nothing ordinary is left', () => {
    expect(genericScene('PSX KSE-100 Surges', 'business')).toBe('a Pakistani market and office district, trade and money')
  })

  it('is off without COMFY_URL or with AI heroes off', () => {
    delete process.env.COMFY_URL
    process.env.AI_HERO_IMAGES = 'true'
    expect(m3Generator('a field', '1')).toBeUndefined()
    process.env.COMFY_URL = 'http://m3'
    process.env.AI_HERO_IMAGES = 'false'
    expect(m3Generator('a field', '1')).toBeUndefined()
    process.env.AI_HERO_IMAGES = 'true'
    expect(typeof m3Generator('a field', '1')).toBe('function')
  })
})
