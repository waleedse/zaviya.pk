import { describe, expect, it } from 'vitest'
import { findReplacementHref, type FindApi } from '../../src/lib/duplicate-redirect'

const api = (gone: Record<string, unknown>[], live: Record<string, unknown>[]): FindApi => {
  let call = 0
  return { find: async () => ({ docs: call++ === 0 ? gone : live }) }
}

describe('findReplacementHref', () => {
  it('redirects a removed duplicate to the live article of the same story', async () => {
    const href = await findReplacementHref(
      api([{ id: 1, storyCluster: 7 }], [{ id: 2, slug: 'kept-story', category: { slug: 'pakistan' } }]),
      'en',
      'dup',
    )
    expect(href).toBe('/pakistan/kept-story')
  })
  it('prefixes Urdu URLs', async () => {
    const href = await findReplacementHref(api([{ id: 1, storyCluster: { id: 7 } }], [{ id: 2, slug: 'k', category: { slug: 'world' } }]), 'ur', 'dup')
    expect(href).toBe('/ur/world/k')
  })
  it('404s (null) when nothing live shares the cluster', async () => {
    expect(await findReplacementHref(api([{ id: 1, storyCluster: 7 }], []), 'en', 'dup')).toBeNull()
  })
  it('404s for an unknown slug, an article without a cluster, and a retracted one', async () => {
    expect(await findReplacementHref(api([], []), 'en', 'x')).toBeNull()
    expect(await findReplacementHref(api([{ id: 1 }], [{ slug: 'a', category: { slug: 'b' } }]), 'en', 'x')).toBeNull()
    expect(await findReplacementHref(api([{ id: 1, storyCluster: 7, workflow: 'retracted' }], [{ slug: 'a', category: { slug: 'b' } }]), 'en', 'x')).toBeNull()
  })
})
