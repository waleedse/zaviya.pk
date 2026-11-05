// Appliance prices CLI (run from apps/worker):
//   tsx src/appliances/cli.ts collect [--brand=nasgas,samsung] [--out=appliances.json]   read the brand stores and print a summary
//   tsx src/appliances/cli.ts import  [--brand=...]                                      read and send to PAYLOAD_URL (needs PAYLOAD_API_KEY)
import { writeFileSync } from 'node:fs'
import { loadConfig } from '../config.js'
import { PayloadClient } from '../payload-client.js'
import { makeCtx } from '../phones/catalog.js'
import { collectAppliances, runAppliancePrices } from './collect.js'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const only = arg('brand')?.split(',')

async function main() {
  const cmd = process.argv[2]
  if (cmd === 'collect') {
    const { items, failed, dropped } = await collectAppliances(makeCtx({ log: (o, m) => console.error(m, o), concurrency: 2 }), only)
    const by: Record<string, { items: number; priced: number }> = {}
    for (const it of items) {
      const k = `${it.brand}/${it.category}`
      const b = (by[k] ??= { items: 0, priced: 0 })
      b.items++
      if (it.pricePkr) b.priced++
    }
    console.error(JSON.stringify({ total: items.length, by, failed, dropped: dropped.length }, null, 2))
    const out = arg('out')
    if (out) writeFileSync(out, JSON.stringify(items, null, 1))
    return
  }
  if (cmd === 'import') {
    const env = loadConfig()
    const payload = new PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY)
    console.log(JSON.stringify(await runAppliancePrices((m, p, b, o) => payload.request(m, p, b, o), only), null, 2))
    return
  }
  console.error('usage: collect | import')
  process.exit(2)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
