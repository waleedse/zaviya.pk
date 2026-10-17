import { describe, it, expect } from 'vitest'
import { writeEnSystemPrompt } from './write_en.js'

describe('writeEnSystemPrompt', () => {
  it('forbids pasting search phrases and source meta-text', () => {
    const p = writeEnSystemPrompt()
    expect(p).toMatch(/Search phrases are never copy/)
    expect(p).toMatch(/the report does not say/)
  })
})
