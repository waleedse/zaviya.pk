import { describe, it, expect } from 'vitest'
import { BridgeJobSchema, BridgeMessageSchema } from '@zaviya/shared'

describe('bridge protocol', () => {
  it('parses outbound job', () => {
    const job = BridgeJobSchema.parse({
      id: 'job_123',
      type: 'x.post',
      payload: { text: 'hi', mediaUrls: [] },
    })
    expect(job.type).toBe('x.post')
  })

  it('parses inbound result', () => {
    const msg = BridgeMessageSchema.parse({ id: 'job_123', ok: true, result: { externalId: '1' } })
    expect('ok' in msg && msg.ok).toBe(true)
  })

  it('parses heartbeat', () => {
    const msg = BridgeMessageSchema.parse({ type: 'heartbeat', tabs: { x: true } })
    expect('type' in msg && msg.type).toBe('heartbeat')
  })
})
