import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(join(process.cwd(), 'src', p), 'utf8')

describe('brand copy (ZAV-96)', () => {
  it('no longer promises that every source is listed', () => {
    for (const f of ['components/layout/SiteFooter.tsx', 'app/(frontend)/[locale]/p/[slug]/page.tsx', 'lib/seo.ts']) {
      expect(read(f)).not.toMatch(/every source listed|with sources|ذرائع کے ساتھ/)
    }
  })
  it('gives /about a branded 120-160 character description', () => {
    const m = /about: \['([^']+)'/.exec(read('app/(frontend)/[locale]/p/[slug]/page.tsx'))
    expect(m?.[1]).toMatch(/^Zaviya/)
    expect(m![1]!.length).toBeGreaterThanOrEqual(120)
    expect(m![1]!.length).toBeLessThanOrEqual(160)
  })
})
