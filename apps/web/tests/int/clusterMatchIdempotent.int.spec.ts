import { describe, expect, it } from 'vitest'
import { existingClusterId } from '../../src/endpoints/pipeline/clusterMatch'

describe('existingClusterId: a re-run embed job must not open a new cluster for an item that already has one', () => {
  it('reads the id, a populated document, or nothing', () => {
    expect(existingClusterId(36224)).toBe('36224')
    expect(existingClusterId({ id: 7 })).toBe('7')
    expect(existingClusterId(null)).toBeNull()
    expect(existingClusterId(undefined)).toBeNull()
    expect(existingClusterId('')).toBeNull()
  })
})
