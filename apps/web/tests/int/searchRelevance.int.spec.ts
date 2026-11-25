import { describe, expect, it } from 'vitest'
import { droppedWords, matchingStrategyFor, noteText, tokenize } from '@/lib/search/relevance'

const top = (matchingWords: number, maxMatchingWords: number) => ({ _rankingScoreDetails: { words: { matchingWords, maxMatchingWords } } })

describe('product search relevance', () => {
  it('splits a query into lower-case words', () => {
    expect(tokenize('MacBook  Speakers, USB-C')).toEqual(['macbook', 'speakers', 'usb', 'c'])
  })
  it('needs every word when the query names a part or accessory', () => {
    for (const q of ['macbook speakers', 'macbook speaker replacement', 'iphone 15 charger', 'samsung s24 case', 'dell laptop battery']) expect(matchingStrategyFor(q)).toBe('all')
  })
  it('keeps the forgiving default for product names and single words', () => {
    for (const q of ['macbook pro m3', 'samsung galaxy s24', 'charger', 'atta 20kg']) expect(matchingStrategyFor(q)).toBe('last')
  })
  it('reports the words Meilisearch dropped from the end', () => {
    expect(droppedWords('macbook speakers', top(1, 2))).toEqual({ kind: 'dropped', used: ['macbook'], dropped: ['speakers'] })
    expect(droppedWords('samsung galaxy s24 ultra', top(2, 4))).toEqual({ kind: 'dropped', used: ['samsung', 'galaxy'], dropped: ['s24', 'ultra'] })
  })
  it('says nothing when every word matched or the detail does not fit the query', () => {
    expect(droppedWords('macbook pro', top(2, 2))).toBeNull()
    expect(droppedWords('macbook', top(1, 1))).toBeNull()
    expect(droppedWords('macbook speakers', top(1, 3))).toBeNull()
    expect(droppedWords('macbook speakers', undefined)).toBeNull()
  })
  it('writes the note the reader sees', () => {
    expect(noteText({ kind: 'dropped', used: ['macbook'], dropped: ['speakers'] })).toBe('No exact match for ‘speakers’, showing ‘macbook’.')
    expect(noteText({ kind: 'none', words: ['macbook', 'speakers'] })).toContain('No product matches all of ‘macbook’, ‘speakers’')
  })
})
