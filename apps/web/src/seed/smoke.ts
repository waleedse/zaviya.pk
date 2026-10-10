import { getPayload } from 'payload'
import config from '@payload-config'
import { runClusterMatch } from '../endpoints/pipeline/clusterMatch'

function randomEmbedding(dim = 768): number[] {
  const v = Array.from({ length: dim }, () => Math.random() * 2 - 1)
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return v.map((x) => x / norm)
}

async function main() {
  const payload = await getPayload({ config })

  const en = await payload.find({
    collection: 'articles',
    locale: 'en',
    where: { _status: { equals: 'published' } },
    limit: 5,
    overrideAccess: true,
  })
  const ur = await payload.find({
    collection: 'articles',
    locale: 'ur',
    where: { _status: { equals: 'published' } },
    limit: 5,
    overrideAccess: true,
  })
  console.log('Published articles en:', en.totalDocs, 'ur:', ur.totalDocs)
  if (en.totalDocs === 0 || ur.totalDocs === 0) {
    throw new Error('Expected published articles in both locales')
  }

  const source = await payload.find({ collection: 'sources', limit: 1, overrideAccess: true })
  if (!source.docs[0]) throw new Error('No sources seeded')
  const item = await payload.create({
    collection: 'source-items',
    data: {
      source: source.docs[0].id,
      externalId: `smoke-${Date.now()}`,
      url: 'https://example.com/smoke',
      title: 'Smoke test cluster item',
      publishedAt: new Date().toISOString(),
      lang: 'en',
      hash: 'smoke',
    },
    overrideAccess: true,
  })

  const result = await runClusterMatch(payload, {
    sourceItemId: String(item.id),
    embedding: randomEmbedding(),
  })
  console.log('cluster-match:', result)

  console.log('Smoke OK')
}

try {
  await main()
} catch (e) {
  console.error(e)
  process.exit(1)
}
