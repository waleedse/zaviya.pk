#!/usr/bin/env node
// Crawl the sitemap and check every page's SEO basics.
//   node scripts/seo-check.mjs [baseUrl] [maxPages]
// Exits 1 if any page has errors (handy before/after a deploy).
const base = (process.argv[2] ?? 'http://localhost:3100').replace(/\/$/, '')
const max = Number(process.argv[3] ?? 60)

const get = async (url) => {
  const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'ZaviyaSeoCheck/1.0' } })
  return { status: res.status, text: res.status < 300 ? await res.text() : '', headers: res.headers }
}
const one = (html, re) => re.exec(html)?.[1]
const all = (html, re) => [...html.matchAll(re)].map((m) => m[1])
const decode = (s) => s?.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'")

const robots = await get(`${base}/robots.txt`)
const sitemap = await get(`${base}/sitemap.xml`)
const issues = []
if (robots.status !== 200) issues.push(['/robots.txt', 'error', `status ${robots.status}`])
if (sitemap.status !== 200) issues.push(['/sitemap.xml', 'error', `status ${sitemap.status}`])

// Sitemap URLs carry the production host; crawl the same paths on `base`.
const paths = [...new Set(all(sitemap.text, /<loc>([^<]+)<\/loc>/g).map((u) => new URL(u).pathname))].slice(0, max)
let ok = 0
for (const path of paths) {
  const { status, text: html } = await get(base + path)
  const add = (level, msg) => issues.push([path, level, msg])
  if (status !== 200) {
    add('error', `status ${status}`)
    continue
  }
  const title = decode(one(html, /<title>([^<]*)<\/title>/))
  const desc = decode(one(html, /<meta name="description" content="([^"]*)"/))
  const canonical = one(html, /<link rel="canonical" href="([^"]*)"/)
  const robotsMeta = one(html, /<meta name="robots" content="([^"]*)"/) ?? ''
  const h1s = all(html, /<h1[\s>]/g).length
  const hreflangs = all(html, /hrefLang="([^"]+)"/g)
  const ld = all(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)
  if (!title) add('error', 'missing <title>')
  else if (title.length > 70) add('warn', `title ${title.length} chars (keep ≤ 65)`)
  if (!desc) add('error', 'missing meta description')
  else if (desc.length < 70 || desc.length > 170) add('warn', `description ${desc.length} chars (aim 120-160)`)
  if (!canonical) add('error', 'missing canonical')
  else if (new URL(canonical).pathname.replace(/\/$/, '') !== path.replace(/\/$/, '')) add('error', `canonical points elsewhere: ${canonical}`)
  if (h1s !== 1) add(h1s === 0 ? 'error' : 'warn', `${h1s} <h1> tags`)
  if (!hreflangs.includes('x-default')) add('warn', 'no hreflang x-default')
  if (/noindex/.test(robotsMeta)) add('info', 'noindex')
  for (const block of ld) {
    try {
      JSON.parse(block)
    } catch {
      add('error', 'invalid JSON-LD')
    }
  }
  const segs = path.split('/').filter(Boolean).filter((s) => s !== 'ur')
  const isArticle = segs.length === 2 && !['p', 'tag', 'author', 'stories', 'namaz-timings'].includes(segs[0])
  if (isArticle && !ld.some((b) => b.includes('"NewsArticle"'))) add('error', 'article without NewsArticle schema')
  if (!issues.some(([p, l]) => p === path && l === 'error')) ok++
}

const icon = { error: '✗', warn: '!', info: '·' }
for (const [p, level, msg] of issues) console.log(`${icon[level]} ${p}  ${msg}`)
const errors = issues.filter(([, l]) => l === 'error').length
console.log(`\n${ok}/${paths.length} pages without errors · ${errors} errors · ${issues.filter(([, l]) => l === 'warn').length} warnings`)
process.exit(errors ? 1 : 0)
