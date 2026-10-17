/**
 * Post one rendered video as an Instagram and/or Facebook Reel, and record each attempt as a social post.
 * Runs inside the worker container, so the Meta token never leaves the server:
 *   node --import tsx scripts/post-reel.ts --file /tmp/v.mp4 --captions /tmp/v-captions.json \
 *     --key 2026-10-17-night --article 1059 --platforms instagram,facebook
 * The captions file is the `<name>-captions.json` written by packages/video (platform -> { text, title? }).
 */
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { loadConfig } from '../src/config.js'
import { PayloadClient } from '../src/payload-client.js'
import { sha1Hex } from '../src/lib/idempotency.js'
import { postFacebookReel, postInstagramReel, type ReelResult } from '../src/social/reels.js'

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    captions: { type: 'string' },
    key: { type: 'string' },
    article: { type: 'string' },
    platforms: { type: 'string', default: 'instagram,facebook' },
  },
})
if (!values.file || !values.captions || !values.key || !values.article) {
  console.error('usage: post-reel.ts --file <mp4> --captions <json> --key <edition-key> --article <lead article id> [--platforms instagram,facebook]')
  process.exit(2)
}

const env = loadConfig()
const payload = new PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY)
const captions = JSON.parse(await readFile(values.captions, 'utf8')) as Record<string, { text: string; title?: string }>
const token = env.META_PAGE_TOKEN
if (!token) throw new Error('META_PAGE_TOKEN is not set')

let failed = 0
for (const platform of values.platforms!.split(',').map((p) => p.trim())) {
  const copy = captions[platform]?.text
  if (!copy) {
    console.error(`${platform}: no caption in ${values.captions}`)
    failed++
    continue
  }
  let result: ReelResult
  if (platform === 'instagram' && env.IG_USER_ID) {
    result = await postInstagramReel({ file: values.file, caption: copy, thumbOffsetMs: 1200 }, { igUserId: env.IG_USER_ID, token })
  } else if (platform === 'facebook' && env.META_PAGE_ID) {
    result = await postFacebookReel({ file: values.file, description: copy, title: captions[platform]?.title }, { pageId: env.META_PAGE_ID, token })
  } else {
    result = { ok: false, error: `${platform}: not supported or not configured` }
  }
  await payload
    .upsertSocialPost({
      idempotencyKey: sha1Hex(`video:${values.key}:${platform}`),
      article: values.article,
      platform,
      format: 'reel',
      copy,
      mediaUrls: [],
      status: result.ok ? 'posted' : 'failed',
      externalId: result.id,
      via: 'api',
      error: result.error,
      postedAt: result.ok ? new Date().toISOString() : undefined,
    })
    .catch((e) => console.error(`${platform}: could not record social post: ${(e as Error).message}`))
  console.log(`${platform}: ${result.ok ? `posted ${result.id}` : `FAILED ${result.error}`}`)
  if (!result.ok) failed++
}
process.exit(failed ? 1 : 0)
