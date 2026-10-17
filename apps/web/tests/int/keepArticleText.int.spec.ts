import { describe, expect, it } from 'vitest'
import { keepArticleText } from '../../src/hooks/articles'

const run = (data: Record<string, unknown>, originalDoc: Record<string, unknown> | undefined, operation = 'update') =>
  keepArticleText({ data, originalDoc, operation } as never) as Record<string, unknown>

const saved = { dek: 'Dek', body: { root: { children: [1] } }, whatItMeans: { root: {} }, keyPoints: [{ point: 'a' }], faqs: [{ q: 1 }] }

describe('keepArticleText', () => {
  it('keeps the text when a partial edit leaves it out', () => {
    const out = run({ title: 'New', priority: 'high' }, saved)
    expect(out.body).toBe(saved.body)
    expect(out.dek).toBe('Dek')
    expect(out.keyPoints).toBe(saved.keyPoints)
  })
  it('keeps the text when an edit sends it null or empty', () => {
    const out = run({ body: null, dek: '', keyPoints: [] }, saved)
    expect(out.body).toBe(saved.body)
    expect(out.dek).toBe('Dek')
    expect(out.keyPoints).toBe(saved.keyPoints)
  })
  it('lets an edit replace the text', () => {
    expect(run({ dek: 'Better' }, saved).dek).toBe('Better')
  })
  it('does nothing on create', () => {
    expect('body' in run({ title: 'x' }, undefined, 'create')).toBe(false)
  })
  it('does not invent fields the saved article lacks', () => {
    expect('body' in run({ title: 'x' }, { dek: 'd' })).toBe(false)
  })
})
