// Upload the local media folder to the R2 bucket (same keys Payload's S3 adapter uses: the filename).
//   node infra/scripts/upload-media-r2.mjs apps/web/media   (R2_* from the root .env)
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

// The S3 client is a dependency of @payloadcms/storage-s3 inside apps/web (not hoisted by pnpm).
const webRequire = createRequire(path.resolve('apps/web/package.json'))
const s3Require = createRequire(webRequire.resolve('@payloadcms/storage-s3'))
const { S3Client, PutObjectCommand, HeadObjectCommand } = s3Require('@aws-sdk/client-s3')

const dir = process.argv[2] ?? 'apps/web/media'
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml' }

let up = 0, skip = 0
for (const name of fs.readdirSync(dir)) {
  const file = path.join(dir, name)
  if (!fs.statSync(file).isFile() || name.startsWith('.')) continue
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: name }))
    skip++
    continue
  } catch {}
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: name, Body: fs.readFileSync(file),
    ContentType: types[path.extname(name).toLowerCase()] ?? 'application/octet-stream',
  }))
  up++
}
console.log(`uploaded ${up}, already there ${skip}`)
