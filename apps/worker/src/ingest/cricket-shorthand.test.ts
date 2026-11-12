import { describe, expect, it } from 'vitest'
import { expandCricketShorthand, swapSides, termTokens, titleMatchesTopic, searchUrls } from './trend-gap.js'

describe('cricket shorthand (ZG-21)', () => {
  it('spells out team codes, women and age groups, and searches both orders plus the PCB site', () => {
    expect(expandCricketShorthand('banw vs pakw')).toBe('Bangladesh women vs Pakistan women')
    expect(expandCricketShorthand('pak u19 v ban u19')).toBe('Pakistan U19 vs Bangladesh U19')
    expect(swapSides('Bangladesh women vs Pakistan women')).toBe('Pakistan women vs Bangladesh women')
    expect(swapSides('petrol price')).toBeNull()
    expect(termTokens('banw vs pakw')).toEqual(['bangladesh', 'women', 'pakistan'])
    expect(titleMatchesTopic('banw vs pakw', 'Pakistan Women beat Bangladesh Women by 5 wickets')).toBe(true)
    const urls = searchUrls('banw vs pakw').map((s) => decodeURIComponent(s.url))
    expect(urls.some((u) => u.includes('q=Bangladesh women vs Pakistan women when:1d'))).toBe(true)
    expect(urls.some((u) => u.includes('q=Pakistan women vs Bangladesh women when:1d'))).toBe(true)
    expect(urls.some((u) => u.includes('site:pcb.com.pk') && u.includes('Bangladesh women vs Pakistan women'))).toBe(true)
  })
})
