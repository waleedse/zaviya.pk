import { BridgeJobSchema, BridgeMessageSchema, HealActionMessageSchema, XPostSchema } from '@zaviya/shared'

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
  { id: 'job_6', type: 'x.search', payload: { query: 'Pakistan petrol', limit: 10 } },
  { id: 'job_7', type: 'x.trending', payload: {} },
  {
    type: 'heal.request',
    id: 'heal_1',
    jobId: 'job_3',
    jobType: 'x.post',
    platform: 'x',
    error: 'post_not_sent: Post button stayed disabled',
    url: 'https://x.com/home',
    elements: [{ i: 0, tag: 'button', text: 'Not now', x: 100, y: 200, inDialog: true }],
    dialogs: ['Turn on notifications?'],
  },
  {
    type: 'heal.report',
    id: 'heal_1',
    jobId: 'job_3',
    jobType: 'x.post',
    platform: 'x',
    error: 'composer_not_found',
    diagnosis: 'A dialog is in the way',
    action: 'click "Not now"',
    result: 'retry_ok',
  },
  { id: 'job_8', type: 'instagram.readProfile', payload: { username: 'geonews', limit: 6 } },
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

// The worker's answer is not a bridge message the extension sends; it has its own schema
const action = HealActionMessageSchema.safeParse({ type: 'heal.action', id: 'heal_1', diagnosis: 'dialog', action: 'click', elementIndex: 0, needsHuman: false, source: 'llm' })
if (!action.success) {
  console.error('heal.action does not parse', action.error.message)
  failed = true
}
// Unknown actions must be rejected
if (HealActionMessageSchema.safeParse({ type: 'heal.action', id: 'x', diagnosis: 'd', action: 'type_text', needsHuman: false }).success) {
  console.error('heal.action accepted an action outside the list')
  failed = true
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
