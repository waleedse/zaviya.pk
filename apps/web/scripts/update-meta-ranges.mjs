#!/usr/bin/env node
// Regenerates src/lib/meta-ranges.ts from Meta's published routes (AS32934, via RADb).
//   node scripts/update-meta-ranges.mjs
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const out = execFileSync('whois', ['-h', 'whois.radb.net', '--', '-i origin AS32934'], { encoding: 'utf8', maxBuffer: 1 << 24 })
const prefixes = [...new Set(out.split('\n').map((l) => /^route6?:\s+(\S+)/.exec(l)?.[1]).filter(Boolean))].sort()
if (prefixes.length < 100) throw new Error(`only ${prefixes.length} prefixes: refusing to write`)
writeFileSync(
  new URL('../src/lib/meta-ranges.ts', import.meta.url),
  `/** Meta (Facebook) network, AS32934, from RADb on ${new Date().toISOString().slice(0, 10)}. Regenerate: node scripts/update-meta-ranges.mjs */\nexport const META_RANGES: readonly string[] = ${JSON.stringify(prefixes, null, 0).replace(/","/g, '",\n  "').replace('["', '[\n  "').replace('"]', '",\n]')}\n`,
)
console.log(`wrote ${prefixes.length} prefixes`)
