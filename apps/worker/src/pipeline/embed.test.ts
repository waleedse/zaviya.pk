import { describe, expect, it, vi } from 'vitest'
import { processEmbedJob } from './embed.js'

describe('processEmbedJob', () => {
  it('tags the vector with the embedding model and passes the match threshold', async () => {
    const clusterMatch = vi.fn(async () => ({ clusterId: '7', isNew: false }))
    const payload = { clusterMatch, getCluster: vi.fn(async () => ({ distinctSources: 1, maxTier: 3, status: 'new', itemCount: 1 })) }
    const router = { embed: vi.fn(async () => [[0.1, 0.2]]), embedModelId: () => 'local-embed:m' }
    await processEmbedJob({ sourceItemId: '5', title: 'Headline' }, { router, payload, triageQueue: { add: vi.fn() }, matchThreshold: 0.77 } as never)
    expect(clusterMatch).toHaveBeenCalledWith({ sourceItemId: '5', embedding: [0.1, 0.2], model: 'local-embed:m', threshold: 0.77 })
  })

  it('leaves the default threshold to the server when none is given', async () => {
    const clusterMatch = vi.fn(async () => ({ clusterId: '7', isNew: false }))
    const payload = { clusterMatch, getCluster: vi.fn(async () => null) }
    const router = { embed: vi.fn(async () => [[0.1]]), embedModelId: () => 'm' }
    await processEmbedJob({ sourceItemId: '5', title: 'H' }, { router, payload, triageQueue: { add: vi.fn() } } as never)
    expect(clusterMatch).toHaveBeenCalledWith({ sourceItemId: '5', embedding: [0.1], model: 'm' })
  })
})
