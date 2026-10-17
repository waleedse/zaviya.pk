import { describe, expect, it } from 'vitest'
import { layoutStory, LAYOUT } from './layout'

describe('layoutStory', () => {
  it('short headline only gives a big photo', () => {
    const l = layoutStory({ headlineH: 3 * 96 * 1.02, hasCredit: true })
    expect(l.photoHeight).toBeGreaterThanOrEqual(1100)
    expect(l.overlayOpacity).toBeGreaterThanOrEqual(0.55)
    expect(l.textTop + l.textHeight).toBe(LAYOUT.bottom)
  })
  it('long headline + figure + urdu + dek gives the smallest photo and drops the dek', () => {
    const l = layoutStory({ headlineH: 4 * 60 * 1.02 + 150, figureH: 175, urduH: 182, dekH: 146, hasCredit: true })
    expect(l.photoHeight).toBe(760)
    expect(l.dekShown).toBe(false)
  })
  it('keeps the dek when the photo stays at 900 or more', () => {
    const l = layoutStory({ headlineH: 3 * 80, dekH: 100, hasCredit: true })
    expect(l.dekShown).toBe(true)
    expect(l.photoHeight).toBeGreaterThanOrEqual(900)
  })
  it('dekAlways keeps the dek even on the smallest photo', () => {
    const l = layoutStory({ headlineH: 500, figureH: 175, urduH: 182, dekH: 146, dekAlways: true, hasCredit: true })
    expect(l.dekShown).toBe(true)
    expect(l.photoHeight).toBe(760)
  })
  it('clamps the photo to 1240 and the opacity to 0.55-0.85', () => {
    const none = layoutStory({ headlineH: 10 })
    expect(none.photoHeight).toBe(1240)
    expect(none.overlayOpacity).toBeGreaterThanOrEqual(0.55)
    expect(none.overlayOpacity).toBeLessThan(0.6)
    const huge = layoutStory({ headlineH: 1500, hasCredit: true })
    expect(huge.overlayOpacity).toBe(0.85)
  })
  it('opacity grows with text', () => {
    const a = layoutStory({ headlineH: 200 }).overlayOpacity
    const b = layoutStory({ headlineH: 500 }).overlayOpacity
    expect(b).toBeGreaterThan(a)
  })
  it('gradient starts 160px above the text', () => {
    const l = layoutStory({ headlineH: 300 })
    expect(l.gradientStart).toBe(l.textTop - 160)
  })
  it('stacks blocks top to bottom without overlap, ticker first', () => {
    const l = layoutStory({ headlineH: 300, figureH: 150, urduH: 100, dekH: 100, dekAlways: true, hasCredit: true, ticker: true })
    const o = l.offsets
    expect(o.ticker).toBe(0)
    expect(o.badge).toBeGreaterThan(o.ticker + 56 - 1)
    expect(o.figure).toBeGreaterThanOrEqual(o.badge + 60)
    expect(o.headline).toBeGreaterThanOrEqual(o.figure + 150)
    expect(o.urdu).toBeGreaterThanOrEqual(o.headline + 300)
    expect(o.dek).toBeGreaterThanOrEqual(o.urdu + 100)
    expect(o.credit).toBeGreaterThanOrEqual(o.dek + 100)
  })
})
