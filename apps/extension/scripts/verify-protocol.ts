import { BridgeJobSchema, BridgeMessageSchema, XPostSchema } from '@zaviya/shared'

const samples = [
  { type: 'hello', token: 'zaviya-dev-bridge', version: '0.1.0' },
  { type: 'heartbeat', tabs: { x: true, instagram: false, facebook: true } },
  { id: 'job_1', ok: true as const, result: { externalId: '123' } },
  { id: 'job_1', ok: false as const, error: 'checkpoint_detected' },
  {
    id: 'job_2',
    type: 'x.readList',
    payload: { listUrl: 'https://x.com/i/lists/1', sinceId: '100' },
  },
  {
    id: 'job_3',
    type: 'x.post',
    payload: { text: 'hello', mediaUrls: [] },
  },
  {
    id: 'job_4',
    type: 'instagram.post',
    payload: { caption: 'cap', mediaUrls: ['https://example.com/a.jpg'] },
  },
  {
    id: 'job_5',
    type: 'gemini.image',
    payload: { prompt: 'news card' },
  },
]

let failed = false
for (const s of samples) {
  const job = BridgeJobSchema.safeParse(s)
  const msg = BridgeMessageSchema.safeParse(s)
  if (!job.success && !msg.success) {
    console.error('Neither job nor message:', s, job.error?.message, msg.error?.message)
    failed = true
  }
}

const post = XPostSchema.parse({
  id: '1',
  author: 'zaviya',
  text: 't',
  url: 'https://x.com/i/web/status/1',
  createdAt: new Date().toISOString(),
  mediaUrls: [],
})
if (!post.id) failed = true

if (failed) process.exit(1)
console.log('Bridge protocol samples OK')
