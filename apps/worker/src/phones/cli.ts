// Mobile prices CLI (run from apps/worker):
//   tsx src/phones/cli.ts collect [--brand=samsung,vivo] [--out=phones.json]   read the official sites, print a summary, optionally save the catalogue
//   tsx src/phones/cli.ts import  [--from=phones.json] [--brand=...] [--mode=seed|prices] [--dry-run]
//        send phones to PAYLOAD_URL (needs PAYLOAD_API_KEY); without --from it reads the sites first
import { readFileSync, writeFileSync } from 'node:fs'
import type { PhoneImportInput } from '@zaviya/shared'
import { loadConfig } from '../config.js'
import { PayloadClient } from '../payload-client.js'
import { collectCatalog, makeCtx } from './catalog.js'
import { postPhones } from './refresh.js'

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const cmd = process.argv[2]
const only = arg('brand')?.split(',')

async function main() {
  if (cmd === 'collect' || (cmd === 'import' && !arg('from'))) {
    const { phones, failed, dropped } = await collectCatalog(makeCtx({ log: (o, m) => console.error(m, o) }), only)
    const byBrand: Record<string, { phones: number; priced: number }> = {}
    for (const p of phones) {
      const b = (byBrand[p.brand] ??= { phones: 0, priced: 0 })
      b.phones++
      if (p.variants?.some((v) => v.pricePkr)) b.priced++
    }
    console.error(JSON.stringify({ total: phones.length, byBrand, failed, dropped }, null, 2))
    const out = arg('out')
    if (out) writeFileSync(out, JSON.stringify(phones, null, 1))
    if (cmd === 'collect') return
    return send(phones)
  }
  if (cmd === 'import') return send(JSON.parse(readFileSync(arg('from')!, 'utf8')) as PhoneImportInput[])
  console.error('usage: collect | import')
  process.exit(2)
}

async function send(phones: PhoneImportInput[]) {
  const list = only ? phones.filter((p) => only.includes(p.brand)) : phones
  if (process.argv.includes('--dry-run')) {
    console.error(`dry run: ${list.length} phones would be sent`)
    return
  }
  const env = loadConfig()
  const payload = new PayloadClient(env.PAYLOAD_URL, env.PAYLOAD_API_KEY)
  const res = await postPhones((m, p, b, o) => payload.request(m, p, b, o), list, (arg('mode') as 'seed' | 'prices') ?? 'seed')
  console.log(JSON.stringify({ sent: list.length, created: res.created, updated: res.updated, changes: res.changes.length, skipped: res.skipped }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
