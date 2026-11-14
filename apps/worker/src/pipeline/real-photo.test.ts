import { describe, expect, it } from 'vitest'
import { acceptable, isCommonTopic, localEnough, partOfLongerName, findHeroPhoto, findRealPhoto, heroSubjects, licenceOk, livingPeople, peopleFirst, plainAuthor, subjectsFor } from './real-photo.js'
import { topicSubjects } from './photo-topics.js'

describe('real photo subjects', () => {
  it('only tries entities named in the headline, most specific first', () => {
    expect(subjectsFor('Imran Khan meets IMF team in Lahore', ['IMF', 'Imran Khan', 'Karachi', 'Lahore'])).toEqual(['Imran Khan', 'Lahore', 'IMF'])
  })

  it('matches a person by given name in the headline, but not by a generic first word', () => {
    expect(subjectsFor('PM Shehbaz announces petrol cut', ['Shehbaz Sharif'])).toEqual(['Shehbaz Sharif'])
    expect(subjectsFor('Nawaz returns to Lahore', ['Shehbaz Sharif'])).toEqual([])
    expect(subjectsFor('State of the economy', ['State Bank of Pakistan'])).toEqual([])
  })

  it('ignores accents: a Kraków or Erdoğan tag matches a plain-ASCII headline', () => {
    expect(subjectsFor('Krakow mass shooting: six dead, 24-year-old gunman dies', ['Kraków'])).toEqual(['Kraków'])
    expect(subjectsFor('Erdogan meets Shehbaz in Ankara', ['Recep Tayyip Erdoğan'])).toEqual(['Recep Tayyip Erdoğan'])
  })

  it('maps indirect topics to a place: US election -> Capitol, Fed -> Eccles Building, PSX, SBP, cricket, OpenAI', () => {
    expect(topicSubjects('Midterm elections results: Democrats take Congress')).toEqual(['United States Capitol'])
    expect(topicSubjects('US election results live: Democrats win House as gas prices bite')).toContain('United States Capitol')
    expect(topicSubjects('Fed holds rates steady')[0]).toBe('Eccles Building')
    expect(topicSubjects('PSX closes 800 points higher')[0]).toBe('Pakistan Stock Exchange')
    expect(topicSubjects('SBP keeps policy rate at 11%')).toContain('State Bank of Pakistan')
    expect(topicSubjects('PCB names squad for the Karachi Test')).toContain('Gaddafi Stadium')
    expect(topicSubjects('ChatGPT gets a new voice mode')).toEqual(['OpenAI', 'Sam Altman'])
    expect(topicSubjects('National Assembly passes the budget, Pakistan')).toContain('Parliament House, Islamabad')
  })

  it('does not misapply a topic: Pakistan Senate is not the Capitol, Indian Congress is not Congress, UK parliament is not Islamabad', () => {
    expect(topicSubjects('Pakistan Senate elects new chairman')).not.toContain('United States Capitol')
    expect(topicSubjects('Congress party leader Rahul Gandhi in Kerala')).toEqual([])
    expect(topicSubjects('UK parliament votes on the bill')).not.toContain('Parliament House, Islamabad')
    expect(topicSubjects('Petrol price cut announced')).toEqual([])
  })

  it('hero order: named multi-word entity, then topic place, then single names', () => {
    expect(heroSubjects({ title: 'Sam Altman says OpenAI will double compute', tags: ['Sam Altman', 'OpenAI'] })).toEqual(['Sam Altman', 'OpenAI'])
    expect(heroSubjects({ title: 'Democrats take Congress in midterms', tags: ['Democrats', 'Congress', 'Midterms'] })[0]).toBe('United States Capitol')
    // an entity only the brief mentions is a last resort
    const s = heroSubjects({ title: 'Markets rally', brief: 'Shehbaz Sharif at a press conference', tags: ['Shehbaz Sharif'] })
    expect(s).toEqual(['Shehbaz Sharif'])
  })
})

describe('licence checks', () => {
  it('accepts free licences and rejects NC/ND and fair use', () => {
    for (const ok of ['Public domain', 'CC0', 'CC BY 2.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0']) expect(licenceOk(ok)).toBe(true)
    for (const bad of ['CC BY-NC 4.0', 'CC BY-ND 2.0', 'CC BY-NC-SA 3.0', 'Fair use', 'Copyrighted', 'GODL-India', '']) expect(licenceOk(bad)).toBe(false)
  })

  it('turns the Artist html into a short plain name', () => {
    expect(plainAuthor('<bdi>Martin Falbisoner</bdi>')).toBe('Martin Falbisoner')
    expect(plainAuthor('<a href="//commons.wikimedia.org/wiki/User:A" title="User:A">Alice &amp; Bob</a>')).toBe('Alice & Bob')
    expect(plainAuthor('Unknown author')).toBe('')
    expect(plainAuthor(undefined)).toBe('')
  })

  it('needs a Commons page, a jpeg/png and a landscape-enough size for a hero', () => {
    const o = { minWidth: 1000, minAspect: 1.0 }
    const info = { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:X.jpg', mime: 'image/jpeg', width: 3000, height: 2000, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' } } }
    expect(acceptable('X.jpg', info, o)).toBe(true)
    expect(acceptable('X.jpg', { ...info, width: 800, height: 500 }, o)).toBe(false)
    expect(acceptable('X.jpg', { ...info, width: 1200, height: 1800 }, o)).toBe(false)
    expect(acceptable('X.jpg', { ...info, descriptionurl: 'https://en.wikipedia.org/wiki/File:X.jpg', url: 'https://upload.wikimedia.org/wikipedia/en/a/ab/X.jpg' }, o)).toBe(false)
    expect(acceptable('X.jpg', { ...info, extmetadata: { LicenseShortName: { value: 'Fair use' } } }, o)).toBe(false)
    expect(acceptable('X.jpg', { ...info, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, NonFree: { value: 'true' } } }, o)).toBe(false)
  })
})

/** Fake Wikipedia API: a lead image for one page, its Commons file info, and image bytes */
function fakeWiki(opts: { leadWidth?: number; licence?: string; page?: string; searchFiles?: { title: string; width: number; height: number }[] } = {}) {
  const page = opts.page ?? 'United States Capitol'
  const info = (name: string, width: number, height: number) => ({
    url: `https://upload.wikimedia.org/wikipedia/commons/9/9f/${encodeURIComponent(name)}`,
    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/${encodeURIComponent(name)}/2000px-x.jpg`,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`,
    mime: 'image/jpeg',
    width,
    height,
    extmetadata: { LicenseShortName: { value: opts.licence ?? 'CC BY-SA 3.0' }, Artist: { value: '<bdi>Martin Falbisoner</bdi>' } },
  })
  const calls: string[] = []
  const fn = (async (u: string) => {
    const url = String(u)
    calls.push(url)
    if (!url.includes('api.php')) return new Response(new Uint8Array(40_000), { headers: { 'content-type': 'image/jpeg' } })
    if (url.includes('prop=pageimages')) {
      const w = opts.leadWidth ?? 4515
      return new Response(JSON.stringify({ query: { pages: { 1: { title: page, index: 1, pageimage: 'Lead.JPG', original: { source: 'https://upload.wikimedia.org/wikipedia/commons/9/9f/Lead.JPG', width: w, height: 2397 } } } } }))
    }
    if (url.includes('titles=')) return new Response(JSON.stringify({ query: { pages: { 1: { title: 'File:Lead.JPG', imageinfo: [info('Lead.JPG', opts.leadWidth ?? 4515, 2397)] } } } }))
    const files = opts.searchFiles ?? []
    return new Response(JSON.stringify({ query: { pages: Object.fromEntries(files.map((f, i) => [i + 1, { title: `File:${f.title}`, index: i + 1, imageinfo: [info(f.title, f.width, f.height)] }])) } }))
  }) as unknown as typeof fetch
  return { fn, calls }
}

describe('findHeroPhoto', () => {
  it('finds the Capitol for a US election story that names no entity, with author, licence and file page', async () => {
    const { fn } = fakeWiki()
    const hit = await findHeroPhoto({ title: 'Midterm elections results: Democrats take Congress', tags: ['Democrats'] }, fn)
    expect(hit?.meta.subject).toBe('United States Capitol')
    expect(hit?.meta.creditLine).toBe('Photo: Martin Falbisoner / CC BY-SA 3.0 / Wikimedia Commons')
    expect(hit?.meta.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    expect(hit?.meta.mediaCredit).toBe(`${hit?.meta.creditLine} | ${hit?.meta.sourceUrl}`)
    expect(hit?.mime).toBe('image/jpeg')
  })

  it('rejects non-free or non-attributable files, and returns null so the AI fallback can run', async () => {
    expect(await findHeroPhoto({ title: 'Democrats take Congress', tags: [] }, fakeWiki({ licence: 'CC BY-NC 4.0' }).fn)).toBeNull()
    expect(await findHeroPhoto({ title: 'Petrol price cut announced', tags: [] }, fakeWiki().fn)).toBeNull()
  })

  it('falls back to a landscape Commons file named after the subject when the lead is too small', async () => {
    const { fn } = fakeWiki({ leadWidth: 390, page: 'Sam Altman', searchFiles: [{ title: 'Sam Altman portrait.jpg', width: 1500, height: 2400 }, { title: 'Sam Altman speaking at event.jpg', width: 3000, height: 2000 }, { title: 'Sam Altman autograph.jpg', width: 3000, height: 1200 }] })
    const hit = await findHeroPhoto({ title: 'Sam Altman says compute will double', tags: ['Sam Altman'] }, fn)
    expect(hit?.meta.file).toBe('Sam Altman speaking at event.jpg')
  })
})

describe('findHeroPhoto people first', () => {
  it('a living person the headline names beats a longer award or event tag', async () => {
    const base = fakeWiki({ page: 'Donald Trump' }).fn
    const fn = (async (u: string) => {
      const url = String(u)
      if (url.includes('prop=categories')) {
        return new Response(JSON.stringify({ query: { pages: { '1': { title: 'Donald Trump', categories: [{ title: 'Category:Living people' }] }, '2': { title: 'Nobel Peace Prize' } } } }))
      }
      return base(u)
    }) as unknown as typeof fetch
    const hit = await findHeroPhoto({ title: 'Trump Nobel Peace Prize push draws criticism', tags: ['Nobel Peace Prize', 'Donald Trump'] }, fn)
    expect(hit?.meta.subject).toBe('Donald Trump')
  })
})

describe('findRealPhoto (social cards)', () => {
  it('only uses entities named in the headline and keeps the credit', async () => {
    const ok = await findRealPhoto('United States Capitol evacuated', ['United States Capitol'], fakeWiki().fn)
    expect(ok?.credit).toContain('Wikimedia Commons')
    expect(await findRealPhoto('Something else happened', ['United States Capitol'], fakeWiki().fn)).toBeNull()
  })
})

describe('person-first photos', () => {
  it('matches a person by surname as a word, but not short, generic or shared surnames', () => {
    expect(subjectsFor('Trump warns renewed strike on Iran could be five times larger', ['Donald Trump', 'Iran'])).toContain('Donald Trump')
    expect(subjectsFor('Huang admits affair probe', ['Jensen Huang'])).toEqual(['Jensen Huang'])
    // Sharif and Khan are shared by many people: the headline does not say which
    expect(subjectsFor('Nawaz Sharif returns', ['Shehbaz Sharif'])).toEqual([])
    expect(subjectsFor('Khan scores a century', ['Babar Khan'])).toEqual([])
    // a surname inside another word does not count
    expect(subjectsFor('Trumpet sales rise', ['Donald Trump'])).toEqual([])
  })

  it('puts living people before organisations and places', () => {
    expect(peopleFirst(['Nvidia', 'Jensen Huang', 'Santa Clara'], new Set(['Jensen Huang']))).toEqual(['Jensen Huang', 'Nvidia', 'Santa Clara'])
  })

  it('reads who is a living person from one batched Wikipedia query, following redirects', async () => {
    const calls: string[] = []
    const fetchFn = (async (url: string) => {
      calls.push(url)
      return new Response(
        JSON.stringify({
          query: {
            redirects: [{ from: 'Jensen Huang', to: 'Jensen Huang (businessman)' }],
            pages: { '1': { title: 'Jensen Huang (businessman)', categories: [{ title: 'Category:Living people' }] }, '2': { title: 'Nvidia' } },
          },
        }),
      )
    }) as unknown as typeof fetch
    const people = await livingPeople(['Nvidia', 'Jensen Huang'], fetchFn)
    expect([...people]).toEqual(['Jensen Huang'])
    expect(calls).toHaveLength(1)
    expect(decodeURIComponent(calls[0]!)).toContain('titles=Nvidia|Jensen Huang')
  })

  it('treats a failed person check as "no people known"', async () => {
    const fetchFn = (async () => new Response('', { status: 500 })) as unknown as typeof fetch
    expect((await livingPeople(['Elon Musk'], fetchFn)).size).toBe(0)
  })
})

describe('common-noun topics need a Pakistani photo', () => {
  it('tells common topics from named subjects', () => {
    expect(isCommonTopic('Petrol prices')).toBe(true)
    expect(isCommonTopic('Traffic police')).toBe(true)
    expect(isCommonTopic('Donald Trump')).toBe(false)
    expect(isCommonTopic('Supreme Court of Pakistan')).toBe(false)
    expect(isCommonTopic('Gaddafi Stadium')).toBe(false)
    expect(isCommonTopic('Islamabad')).toBe(false)
    expect(isCommonTopic('First Test')).toBe(true)
    expect(isCommonTopic('Second ODI')).toBe(true)
    expect(isCommonTopic('Sri Lanka Cricket')).toBe(false)
    expect(localEnough('First Test', 'Smile’s first test X-ray image shows Cassiopeia A ESA529158.png')).toBe(false)
    expect(localEnough('First Test', 'Pakistan vs Sri Lanka first Test Rawalpindi.jpg')).toBe(true)
  })
  it('rejects a foreign shot of a common topic and keeps named subjects anywhere', () => {
    expect(localEnough('Petrol prices', 'Annangrove Petrol Prices.jpg')).toBe(false)
    expect(localEnough('Traffic police', 'Kuala_Lumpur_Malaysia_Traffic-police-03.jpg')).toBe(false)
    expect(localEnough('Traffic police', 'Lahore traffic police warden.jpg')).toBe(true)
    expect(localEnough('Petrol prices', 'PSO petrol station Karachi.jpg')).toBe(true)
    expect(localEnough('Donald Trump', 'Donald Trump swearing in ceremony.jpg')).toBe(true)
  })
})

describe('file names that hold a longer name', () => {
  it('rejects a different person whose name contains the subject', () => {
    expect(partOfLongerName('Mufti Syed Shujaat Ali Qadir with.jpg', 'Shujaat Ali')).toBe(true)
    expect(partOfLongerName('Donald Trump swearing in ceremony.jpg', 'Donald Trump')).toBe(false)
    expect(partOfLongerName('President Donald Trump in 2025.jpg', 'Donald Trump')).toBe(false)
    expect(partOfLongerName('Shehbaz_Sharif_2023.jpg', 'Shehbaz Sharif')).toBe(false)
  })
})

describe('namedIn short forms (14 Nov)', () => {
  it('counts a headline abbreviation as naming the entity', async () => {
    const { namedIn } = await import('./real-photo.js')
    expect(namedIn('Faisal Karim Kundi commends military after 35 killed in KP', 'Khyber Pakhtunkhwa')).toBe(true)
    expect(namedIn('KP government debt servicing costs reach Rs50.5 billion', 'Khyber Pakhtunkhwa')).toBe(true)
    expect(namedIn('SBP keeps policy rate unchanged', 'State Bank of Pakistan')).toBe(true)
    expect(namedIn('Bilal Azhar Kayani calls for faster digital payment adoption', 'State Bank of Pakistan')).toBe(false)
    expect(namedIn('Kpk-style reform? Not quite', 'Pakistan Cricket Board')).toBe(false)
    expect(namedIn('Upkeep costs rise', 'Khyber Pakhtunkhwa')).toBe(false)
  })
})
