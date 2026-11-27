/**
 * Viral radar (docs/SOCIAL-REALTIME.md): finds real videos that famous, known accounts posted and lots of people are watching,
 * and (in live mode) quote-posts the ORIGINAL post on X with our own line and the Zaviya story link. We never download or
 * re-upload someone else's video. Unknown accounts are never used: a viral video from a stranger can be old, edited or fake.
 *
 * Add a source by adding a line. A wrong or inactive handle is harmless: the search simply returns nothing for it.
 */
export type SourceKind = 'outlet' | 'journalist' | 'official' | 'celebrity'

export interface ViralSource {
  handle: string
  name: string
  kind: SourceKind
  group: 'pk' | 'global'
  /** Zaviya category used to find a related story to link */
  category?: string
}

export const VIRAL_SOURCES: ViralSource[] = [
  // Pakistan: officials
  { handle: 'OfficialDGISPR', name: 'ISPR', kind: 'official', group: 'pk', category: 'pakistan' },
  { handle: 'CMShehbaz', name: 'Shehbaz Sharif', kind: 'official', group: 'pk', category: 'pakistan' },
  { handle: 'MaryamNSharif', name: 'Maryam Nawaz', kind: 'official', group: 'pk', category: 'pakistan' },
  { handle: 'MIshaqDar50', name: 'Ishaq Dar', kind: 'official', group: 'pk', category: 'pakistan' },
  { handle: 'TheRealPCB', name: 'PCB', kind: 'official', group: 'pk', category: 'cricket' },
  // Pakistan: outlets
  { handle: 'geonews_english', name: 'Geo News', kind: 'outlet', group: 'pk', category: 'pakistan' },
  { handle: 'ARYNEWSOFFICIAL', name: 'ARY News', kind: 'outlet', group: 'pk', category: 'pakistan' },
  { handle: 'dawn_com', name: 'Dawn', kind: 'outlet', group: 'pk', category: 'pakistan' },
  { handle: 'BBCUrdu', name: 'BBC Urdu', kind: 'outlet', group: 'pk', category: 'pakistan' },
  { handle: 'PTVNewsOfficial', name: 'PTV News', kind: 'outlet', group: 'pk', category: 'pakistan' },
  // Pakistan: journalists
  { handle: 'HamidMirPAK', name: 'Hamid Mir', kind: 'journalist', group: 'pk', category: 'pakistan' },
  { handle: 'MurtazaViews', name: 'Murtaza Ali Shah', kind: 'journalist', group: 'pk', category: 'pakistan' },
  // Pakistan: cricketers and artists
  { handle: 'babarazam258', name: 'Babar Azam', kind: 'celebrity', group: 'pk', category: 'cricket' },
  { handle: 'iShaheenAfridi', name: 'Shaheen Afridi', kind: 'celebrity', group: 'pk', category: 'cricket' },
  { handle: 'MahiraKhan', name: 'Mahira Khan', kind: 'celebrity', group: 'pk', category: 'pakistan' },
  { handle: 'HaniaAamirReal', name: 'Hania Aamir', kind: 'celebrity', group: 'pk', category: 'pakistan' },
  { handle: 'itsaadee', name: 'Atif Aslam', kind: 'celebrity', group: 'pk', category: 'pakistan' },
  // Global: outlets (only used when we have our own story on the same event)
  { handle: 'Reuters', name: 'Reuters', kind: 'outlet', group: 'global', category: 'world' },
  { handle: 'AJEnglish', name: 'Al Jazeera English', kind: 'outlet', group: 'global', category: 'world' },
  { handle: 'BBCWorld', name: 'BBC News (World)', kind: 'outlet', group: 'global', category: 'world' },
  { handle: 'CBSNews', name: 'CBS News', kind: 'outlet', group: 'global', category: 'world' },
  { handle: 'NBCNews', name: 'NBC News', kind: 'outlet', group: 'global', category: 'world' },
  { handle: 'elonmusk', name: 'Elon Musk', kind: 'celebrity', group: 'global', category: 'tech-telecom' },
]

export const VIRAL_RULES = {
  /** Live posts a day, at least this far apart, never 00:00-08:00 PKT */
  maxPerDay: 4,
  minGapMs: 90 * 60_000,
  allowedHours: [8, 24] as [number, number],
  /** A video older than this is no longer news */
  maxAgeMs: 8 * 60 * 60_000,
  /** Too young to judge (counters still tiny) */
  minAgeMs: 10 * 60_000,
  /** The post must carry a video; photos and text are the quote-card job */
  requireVideo: true,
  /** Pakistan sources: views and views per hour needed */
  pk: { minViews: 8_000, minPerHour: 1_500 },
  /** Global sources: much higher, and a Zaviya story on the same event is required */
  global: { minViews: 80_000, minPerHour: 10_000 },
  /** Accounts per X search and searches per round (the browser behaves like a person reading) */
  handlesPerSearch: 8,
  searchesPerRound: 2,
  /** Lowest score that may be posted */
  minScore: 55,
}

export type ViralMode = 'off' | 'dry' | 'live'

export function viralMode(raw: string | undefined): ViralMode {
  const v = (raw ?? 'dry').trim().toLowerCase()
  return v === 'off' || v === 'live' ? v : 'dry'
}
