import { describe, expect, it } from 'vitest'
import { isStuckApproved } from '../../src/lib/stuck-approved'

const NOW = Date.parse('2026-11-12T12:00:00Z')
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString()

describe('isStuckApproved', () => {
  it('releases an editor-approved writing cluster after the writing age', () => {
    expect(isStuckApproved({ id: 1, status: 'writing', updatedAt: ago(20), triage: { editorApproved: true } }, NOW, 15, 30)).toBe(true)
    expect(isStuckApproved({ id: 1, status: 'writing', updatedAt: ago(5), triage: { editorApproved: true } }, NOW, 15, 30)).toBe(false)
  })

  it('ZG-21: releases a writing cluster that triage itself decided to publish (no job, no article)', () => {
    expect(isStuckApproved({ id: 34011, status: 'writing', updatedAt: ago(20), triage: { codeOutcome: 'publish' } }, NOW, 15, 30)).toBe(true)
    expect(isStuckApproved({ id: 34011, status: 'writing', updatedAt: ago(5), triage: { codeOutcome: 'publish' } }, NOW, 15, 30)).toBe(false)
  })

  it('leaves a writing cluster that was only sent to review alone', () => {
    expect(isStuckApproved({ id: 2, status: 'writing', updatedAt: ago(600), triage: { codeOutcome: 'review' } }, NOW, 15, 30)).toBe(false)
  })
})
