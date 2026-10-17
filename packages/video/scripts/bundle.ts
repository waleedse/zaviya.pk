/** Bundles the composition once (used at docker build time): build/bundle */
import { bundle } from '@remotion/bundler'
import { rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(ROOT, 'build', 'bundle')
rmSync(out, { recursive: true, force: true })
const dir = await bundle({
  entryPoint: path.join(ROOT, 'src/remotion/index.ts'),
  publicDir: path.join(ROOT, 'public'),
  outDir: out,
})
console.log('bundle written to', dir)
