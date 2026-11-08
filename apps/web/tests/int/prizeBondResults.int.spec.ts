import { describe, expect, it } from 'vitest'
import { denominationFromSlug, findWins, parseBondInput, parseDrawLinks, parseDrawText } from '@/lib/prize-bond-results'

const rs1500 = `DRAW RESULT OF RS.1500/- DENOMINATION NATIONAL PRIZE BONDS - 106TH DRAW

First Prize of Rs. 3,000,000/-

024132

Second Prize of Rs. 1,000,000/- (each)

026284      355420        407321

Third Prize of Rs. 18, 500/-

${Array.from({ length: 60 }, (_, i) => String(100000 + i * 7).padStart(6, '0')).join('\t')}
000040\t028615\tXXXXXX`

const rs200 = `                    107th DRAW OF Rs.200/- DENOMINATION PREMIUM PRIZE BONDS
                          HELD ON 15-09-2026  AT SBP BSC Muzaffarabad
\t\t\t1st Prize:\tRs. 750,000/-
\t\t\t01 Prize:\t516806
\t\t\t2nd Prize\tRs. 250,000/- Each
\t\t\t05 Prizes\t381066\t425087\t796229\t799273\t844138
                                    (2400 Prizes of Rs.1250/- Each)
\t\t\t\t\t\t\t\t\t\tPage 1/4
${Array.from({ length: 60 }, (_, i) => String(200000 + i).padStart(6, '0')).join('\t')}`

describe('prize bond results', () => {
  it('reads the "First Prize of" format', () => {
    const r = parseDrawText(rs1500, 1500, '2026-05-15', 'x')!
    expect(r.drawNo).toBe(106)
    expect(r.tiers.map((t) => [t.amount, t.numbers.length])).toEqual([
      [3_000_000, 1],
      [1_000_000, 3],
      [18_500, 62],
    ])
  })
  it('reads the "1st Prize:" format with a bracketed third prize and no stray numbers', () => {
    const r = parseDrawText(rs200, 200, '2026-09-15', 'x')!
    expect(r.drawNo).toBe(107)
    expect(r.tiers.map((t) => [t.amount, t.numbers.length])).toEqual([
      [750_000, 1],
      [250_000, 5],
      [1250, 60],
    ])
  })
  it('finds the official .txt links with their dates, newest first', () => {
    const html = `<a href="https://savings.gov.pk/wp-content/uploads/2026/02/105.txt">16-02-2026 (txt file)</a><a href="https://savings.gov.pk/wp-content/uploads/2026/02/105.pdf">16-02-2026 (pdf file)</a><a href="https://savings.gov.pk/wp-content/uploads/2026/05/106.txt">15-05-2026</a>`
    expect(parseDrawLinks(html).map((l) => l.date)).toEqual(['2026-05-15', '2026-02-16'])
    const named = `<a href="https://savings.gov.pk/wp-content/uploads/2026/08/100_170826.txt" target="_blank">100_170826_Txt</a><a href="https://savings.gov.pk/wp-content/uploads/2026/10/750_15102026-1.txt">x</a>`
    expect(parseDrawLinks(named).map((l) => l.date)).toEqual(['2026-10-15', '2026-08-17'])
  })
  it('restores leading zeros the official file lost on a numbers-only line', () => {
    const t = rs1500.replace('026284      355420        407321', '7447\t827353\t876615')
    expect(parseDrawText(t, 1500, '2026-10-15', 'x')!.tiers[1]!.numbers).toEqual(['007447', '827353', '876615'])
  })
  it('parses numbers and ranges, and finds wins', () => {
    expect(parseBondInput('24132, 355420\n123400-123402 abc')).toEqual(['024132', '355420', '123400', '123401', '123402'])
    const r = parseDrawText(rs1500, 1500, '2026-05-15', 'x')!
    expect(findWins(['024132', '028615', '999999'], [r]).map((w) => [w.number, w.rank])).toEqual([
      ['024132', 1],
      ['028615', 3],
    ])
    expect(denominationFromSlug('rs-1500')).toBe(1500)
    expect(denominationFromSlug('rs-40000')).toBeNull()
  })
})
