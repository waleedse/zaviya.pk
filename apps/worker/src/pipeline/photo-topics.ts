/**
 * Stories that name their subject indirectly ("Democrats take Congress", "Fed holds rates", "PSX closes up") still
 * deserve a real photo of the place behind them. Each topic maps to Wikipedia/Commons subjects, tried in order.
 * Only exact article titles or distinctive search terms go here: a wrong subject is worse than no photo.
 */
interface Topic {
  name: string
  /** Matches the headline, dek and tags together */
  when: RegExp
  /** Skip the topic when this also matches (e.g. a Pakistani "Senate" is not the US Senate) */
  unless?: RegExp
  /** The topic only applies when this matches too (Pakistan's Senate vs anyone else's) */
  requires?: RegExp
  subjects: string[]
}

const PAKISTAN = /\b(pakistan\w*|islamabad|lahore|karachi|peshawar|quetta|pti|pml-?n|ppp|npa|nawaz|shehbaz|imran khan|sbp|fbr)\b/i

export const TOPICS: Topic[] = [
  { name: 'us-congress', when: /\b(midterms?|congress(ional)?|capitol hill|democrats?|republicans?|g\.?o\.?p\.?|us senate|u\.s\. senate|us house|house of representatives|speaker of the house|us election|u\.s\. election|us politics)\b/i, unless: new RegExp(`${PAKISTAN.source}|\\b(india\\w*|modi|bjp|rahul gandhi|national congress|congress party|kenya\\w*|nigeria\\w*)\\b`, 'i'), subjects: ['United States Capitol'] },
  { name: 'white-house', when: /\b(white house|oval office)\b/i, subjects: ['White House'] },
  { name: 'us-supreme-court', when: /\b(us supreme court|u\.s\. supreme court|scotus)\b/i, subjects: ['Supreme Court of the United States'] },
  { name: 'pentagon', when: /\b(pentagon)\b/i, subjects: ['The Pentagon'] },
  { name: 'fed', when: /\b(federal reserve|the fed|fomc|fed (chair|cuts?|holds?|raises?|rate))\b/i, subjects: ['Eccles Building', 'Marriner S. Eccles Federal Reserve Board Building'] },
  { name: 'psx', when: /\b(psx|kse-?100|pakistan stock exchange|karachi stock exchange)\b/i, subjects: ['Pakistan Stock Exchange', 'Karachi Stock Exchange', 'Stock Exchange Building Karachi'] },
  { name: 'sbp', when: /\b(sbp|state bank of pakistan|policy rate|monetary policy committee)\b/i, unless: /\b(fed|federal reserve|ecb|bank of england)\b/i, subjects: ['State Bank of Pakistan'] },
  { name: 'pakistan-cricket', when: /\b(pcb|pakistan cricket|pakistan super league|psl|pakistan (test|odi|t20)|babar azam|shaheen afridi)\b/i, subjects: ['Gaddafi Stadium', 'National Stadium, Karachi'] },
  { name: 'openai', when: /\b(chatgpt|openai|gpt-?\d)\b/i, subjects: ['OpenAI', 'Sam Altman'] },
  { name: 'parliament-pk', when: /\b(national assembly|parliament|senate|joint session)\b/i, requires: PAKISTAN, subjects: ['Parliament House, Islamabad'] },
  { name: 'supreme-court-pk', when: /\b(supreme court|chief justice)\b/i, requires: PAKISTAN, subjects: ['Supreme Court of Pakistan'] },
  { name: 'islamabad-high-court', when: /\b(islamabad high court|ihc)\b/i, requires: PAKISTAN, subjects: ['Islamabad High Court'] },
  { name: 'imf', when: /\b(imf|international monetary fund)\b/i, subjects: ['International Monetary Fund'] },
  { name: 'world-bank', when: /\bworld bank\b/i, subjects: ['World Bank Group'] },
  { name: 'un', when: /\b(united nations|un security council|un general assembly|unga)\b/i, subjects: ['United Nations Headquarters'] },
  { name: 'eu', when: /\b(european commission|european union|brussels)\b/i, subjects: ['Berlaymont building'] },
  { name: 'kremlin', when: /\b(kremlin)\b/i, subjects: ['Moscow Kremlin'] },
  { name: 'big-ben', when: /\b(downing street|westminster|uk parliament)\b/i, subjects: ['Palace of Westminster'] },
  { name: 'gwadar', when: /\b(gwadar)\b/i, subjects: ['Gwadar'] },
  { name: 'islamabad', when: /\b(islamabad)\b/i, subjects: ['Islamabad'] },
]

/** Subjects for the topics the story text matches, in the order above (most specific first) */
export function topicSubjects(text: string, max = 4): string[] {
  const out: string[] = []
  for (const t of TOPICS) {
    if (t.when.test(text) && !(t.unless && t.unless.test(text)) && (!t.requires || t.requires.test(text))) for (const s of t.subjects) if (!out.includes(s)) out.push(s)
  }
  return out.slice(0, max)
}
