import { describe, expect, it, vi } from 'vitest'
import { fetchPpscSourceItems, isPpscUrl, longDate, parsePpscDate, parsePpscJobs, ppscToSourceItems } from './ppsc.js'

// Rows copied from https://ppsc.gop.pk/Jobs.aspx on 22 Oct 2026 (Advertisement No. 11/2026), shortened
const row = (n: number, ad: string, kase: string, post: string, dept: string, adDate: string, closing: string) =>
  `<tr><td>${n}</td><td>${ad}</td><td>${kase}</td><td class="PostsCell" align="left"><a href="javascript:__doPostBack('x','')">${post}</a></td><td>600</td><td class="PostsCell" align="left" valign="top">${dept}</td><td>${adDate}</td><td>${closing}</td></tr>`
const PAGE = `<html><body><table id="other"><tr><td>x</td></tr></table>
<table id="ctl00_ContentPlaceHolder1_tbl_Jobs" class="tab_Jobs table"><thead><tr><th>SR NO</th><th>AD NO</th><th>CASE NO</th><th>POST NAME</th><th>FEE (Rs)</th><th>DEPARTMENT</th><th>AD DATE</th><th>CLOSING DATE</th></tr></thead><tbody>
${row(1, '11/2026', '4K2026', 'SENIOR VETERINARY OFFICER/ ASSISTANT DIRECTOR (HQR)', 'LIVESTOCK &amp; DAIRY DEVELOPMENT DEPARTMENT', '09-10-2026', '26-10-2026')}
${row(2, '11/2026', '25A2026', 'DEPUTY DIRECTOR (T.P)', 'HOUSING URBAN DEVELOPMENT &amp; PUBLIC HEALTH ENGINEERING DEPARTMENT', '09-10-2026', '26-10-2026')}
${row(3, '11/2026', '34D2026', 'SENIOR REGISTRAR MEDICINE', 'SPECIALIZED HEALTHCARE &amp; MEDICAL EDUCATION DEPARTMENT', '09-10-2026', '26-10-2026')}
${row(4, '10/2026', '1B2026', 'ASSISTANT DIRECTOR', 'SPORTS BOARD', '01-10-2026', '14-10-2026')}
</tbody></table></body></html>`

const NOW = Date.parse('2026-10-22T08:00:00Z')

describe('PPSC jobs page (ZAV-86)', () => {
  it('recognises the host', () => {
    expect(isPpscUrl('https://ppsc.gop.pk/Jobs.aspx')).toBe(true)
    expect(isPpscUrl('https://ppsc.gop.pk/(S(abc))/Jobs.aspx')).toBe(true)
    expect(isPpscUrl('https://propakistani.pk/ppsc')).toBe(false)
  })

  it('parses the table into cases', () => {
    const cases = parsePpscJobs(PAGE)
    expect(cases).toHaveLength(4)
    expect(cases[0]).toMatchObject({ adNo: '11/2026', caseNo: '4K2026', fee: '600', adDate: '09-10-2026', closingDate: '26-10-2026' })
    expect(cases[1]!.department).toBe('HOUSING URBAN DEVELOPMENT & PUBLIC HEALTH ENGINEERING DEPARTMENT')
  })

  it('fails loudly when the table is missing, instead of silently ingesting nothing', () => {
    expect(() => parsePpscJobs('<html><body>Please enable JavaScript</body></html>')).toThrow(/table not found/)
  })

  it('makes one item for the open advertisement 11/2026 and skips the closed 10/2026, with the reason reported', () => {
    const { items, closed } = ppscToSourceItems('77', parsePpscJobs(PAGE), NOW)
    expect(closed).toEqual(['10/2026'])
    expect(items).toHaveLength(1)
    const it = items[0]!
    expect(it).toMatchObject({ sourceId: '77', externalId: 'ppsc:ad:11/2026', lang: 'en', publishedAt: new Date(NOW).toISOString() })
    expect(it.title).toBe('PPSC Advertisement No. 11/2026: 3 cases open for applications until 26 October 2026')
    expect(it.url).toBe('https://ppsc.gop.pk/Jobs.aspx#ad-11-2026')
    expect(it.contentText).toContain('Punjab Public Service Commission')
    expect(it.contentText).toContain('- DEPUTY DIRECTOR (T.P) (case 25A2026; HOUSING URBAN')
    expect(it.contentText).toContain('fee Rs600')
    // a real body, so the pitch gate (ZAV-163) sees it as readable
    expect(it.contentText!.length).toBeGreaterThan(it.title.length + 40)
  })

  it('an advertisement is still open on its closing day', () => {
    const { items } = ppscToSourceItems('1', parsePpscJobs(PAGE), Date.parse('2026-10-26T12:00:00Z'))
    expect(items).toHaveLength(1)
    expect(ppscToSourceItems('1', parsePpscJobs(PAGE), Date.parse('2026-10-27T12:00:00Z')).items).toHaveLength(0)
  })

  it('parses and prints dates', () => {
    expect(parsePpscDate('26-10-2026')).toBe('2026-10-25T19:00:00.000Z')
    expect(parsePpscDate('31-02-2026')).toBeNull()
    expect(parsePpscDate('soon')).toBeNull()
    expect(longDate('09-10-2026')).toBe('9 October 2026')
  })

  it('fetches the page and returns the items; an HTTP error is thrown so the job shows as failed', async () => {
    const ok = vi.fn().mockResolvedValue(new Response(PAGE, { status: 200 }))
    const items = await fetchPpscSourceItems('77', 'https://ppsc.gop.pk/Jobs.aspx', ok as never, NOW)
    expect(items.map((i) => i.externalId)).toEqual(['ppsc:ad:11/2026'])
    const bad = vi.fn().mockResolvedValue(new Response('no', { status: 503 }))
    await expect(fetchPpscSourceItems('77', undefined, bad as never, NOW)).rejects.toThrow(/503/)
  })
})
