import { describe, expect, it, vi } from 'vitest'
import { findOpenversePhoto, openverseCandidateOk, openverseLicenceOk, rankCandidates, topicQueries, type OpenverseResult, type TopicQuery } from './openverse.js'

const policeQ: TopicQuery = { q: 'Pakistan police', must: /police/i, common: true }

const good = (over: Partial<OpenverseResult> = {}): OpenverseResult => ({
  id: 'a',
  title: 'Pakistan police on patrol in Peshawar',
  creator: 'Jane Doe',
  url: 'https://live.staticflickr.com/1/2_b.jpg',
  foreign_landing_url: 'https://www.flickr.com/photos/1/2',
  license: 'by',
  license_version: '2.0',
  provider: 'flickr',
  source: 'flickr',
  width: 1600,
  height: 1000,
  tags: [{ name: 'police' }, { name: 'pakistan' }],
  ...over,
})

describe('topicQueries', () => {
  it('maps headlines to topic queries with Pakistani context', () => {
    expect(topicQueries({ title: 'Eleven policemen, including a DSP, killed in Kohat militant attack' }).map((q) => q.q)).toEqual(['Pakistan police', 'Kohat'])
    expect(topicQueries({ title: 'PSX gains 1,200 points as KSE-100 hits record' })[0]?.q).toBe('Pakistan Stock Exchange')
    expect(topicQueries({ title: 'Wheat support price raised ahead of harvest' })[0]?.q).toBe('wheat harvest Pakistan')
    expect(topicQueries({ title: 'Peshawar traffic plan announced' }).map((q) => q.q)).toContain('Peshawar')
    expect(topicQueries({ title: 'Petrol price cut by Rs5' }).map((q) => q.q)).toEqual(['petrol pump Pakistan'])
    expect(topicQueries({ title: 'Tomato prices surge in markets' })[0]?.q).toBe('Pakistan bazaar market')
  })
  it('falls back to the story keywords with Pakistan, and to nothing when there are none', () => {
    expect(topicQueries({ title: 'Zorblax summit ends', tags: ['Zorblax', 'AI'] })[0]?.q).toBe('Zorblax Pakistan')
    expect(topicQueries({ title: 'Summit ends', tags: [] })).toEqual([])
  })
})

describe('licence filter', () => {
  it('accepts CC0, public domain, CC BY, CC BY-SA', () => {
    for (const l of ['cc0', 'pdm', 'by', 'by-sa']) expect(openverseLicenceOk({ license: l, license_version: '2.0' })).toBe(true)
  })
  it('never accepts NC or ND variants or unknown licences', () => {
    for (const l of ['by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd', 'sampling+', '', undefined]) expect(openverseLicenceOk({ license: l, license_version: '2.0' })).toBe(false)
    expect(openverseCandidateOk(good({ license: 'by-nd' }), policeQ)).toEqual({ ok: false, reason: 'licence by-nd not allowed' })
  })
})

describe('candidate checks', () => {
  it('passes a wide Pakistani topic photo', () => {
    expect(openverseCandidateOk(good(), policeQ)).toEqual({ ok: true })
  })
  it('rejects small, portrait, non-photo, off-topic and non-Pakistani photos', () => {
    expect(openverseCandidateOk(good({ width: 500, height: 330 }), policeQ).ok).toBe(false)
    expect(openverseCandidateOk(good({ width: 1024, height: 1400 }), policeQ).ok).toBe(false)
    expect(openverseCandidateOk(good({ title: 'Pakistan police logo' }), policeQ).ok).toBe(false)
    expect(openverseCandidateOk(good({ title: 'Karachi beach', tags: [] }), policeQ).ok).toBe(false)
    expect(openverseCandidateOk(good({ title: 'Police in Sydney', tags: [{ name: 'police' }] }), policeQ)).toEqual({ ok: false, reason: 'common topic, photo not from Pakistan' })
    expect(openverseCandidateOk(good({ url: 'https://x.org/a.svg' }), policeQ).ok).toBe(false)
    expect(openverseCandidateOk(good({ mature: true }), policeQ).ok).toBe(false)
  })
  it('a named place needs no Pakistan word besides the place itself', () => {
    expect(openverseCandidateOk(good({ title: 'Peshawar old city', tags: [] }), { q: 'Peshawar', must: /Peshawar/i, common: false })).toEqual({ ok: true })
  })
  it('prefers Commons/Flickr, 1200 px and up', () => {
    const ranked = rankCandidates([
      { r: good({ id: 'small', width: 1024, height: 700 }), rank: 0 },
      { r: good({ id: 'big', width: 2400, height: 1600, source: 'wikimedia', provider: 'wikimedia' }), rank: 3 },
    ])
    expect(ranked[0]?.r.id).toBe('big')
  })
})

describe('findOpenversePhoto', () => {
  const jpeg = Buffer.alloc(40_000, 7)
  function fakeFetch(results: OpenverseResult[], opts: { failSearch?: number } = {}) {
    let failures = opts.failSearch ?? 0
    const urls: string[] = []
    const fn = vi.fn(async (input: string | URL | Request) => {
      const u = String(input)
      urls.push(u)
      if (u.startsWith('https://api.openverse.org/')) {
        if (failures-- > 0) return new Response('error code: 504', { status: 504 })
        return new Response(JSON.stringify({ results }), { status: 200 })
      }
      return new Response(jpeg, { status: 200, headers: { 'content-type': 'image/jpeg' } })
    })
    return { fn: fn as unknown as typeof fetch, urls }
  }

  it('asks Openverse only for licences that allow edits, and credits the creator, licence and page', async () => {
    const { fn, urls } = fakeFetch([good()])
    const p = await findOpenversePhoto({ title: 'Police recruit 500 constables in Lahore', tags: [] }, { fetchFn: fn, pauseMs: 0 })
    const search = new URL(urls[0]!)
    expect(search.searchParams.get('license')).toBe('cc0,pdm,by,by-sa')
    expect(search.searchParams.get('mature')).toBe('false')
    expect(p?.meta).toMatchObject({ provider: 'openverse', licence: 'CC BY 2.0', author: 'Jane Doe', creditLine: 'Photo: Jane Doe / CC BY 2.0 / Flickr', mediaCredit: 'Photo: Jane Doe / CC BY 2.0 / Flickr | https://www.flickr.com/photos/1/2', fromCommons: false })
  })
  it('skips an ND result even if the API returned it', async () => {
    const { fn } = fakeFetch([good({ license: 'by-nd' })])
    expect(await findOpenversePhoto({ title: 'Police recruit 500 constables', tags: [] }, { fetchFn: fn, pauseMs: 0 })).toBeNull()
  })
  it('retries a 504 and moves on to the next candidate when the QA callback says no', async () => {
    const { fn } = fakeFetch([good({ id: 'one' }), good({ id: 'two', url: 'https://live.staticflickr.com/3/4_b.jpg', foreign_landing_url: 'https://www.flickr.com/photos/3/4' })], { failSearch: 2 })
    const seen: string[] = []
    const p = await findOpenversePhoto({ title: 'Police recruit 500 constables', tags: [] }, { fetchFn: fn, pauseMs: 0, accept: (ph) => (seen.push(ph.meta.sourceUrl), ph.meta.sourceUrl.endsWith('/3/4')) })
    expect(seen).toHaveLength(2)
    expect(p?.meta.sourceUrl).toBe('https://www.flickr.com/photos/3/4')
  })
  it('returns null when Openverse stays down', async () => {
    const { fn } = fakeFetch([good()], { failSearch: 99 })
    expect(await findOpenversePhoto({ title: 'Police recruit 500 constables', tags: [] }, { fetchFn: fn, pauseMs: 0 })).toBeNull()
  })
})
