/**
 * Quote cards ("who said what"): the one place to edit who is watched and how often quote cards go out.
 * Add a person by adding a line: `handle` is the X account (no @), `name` and `role` are what the card shows,
 * `wiki` is the Wikipedia article title that the Commons photo is looked up by (real-photo.ts). Wrong or inactive
 * handles are harmless: the search just returns nothing for them.
 */
export interface Personality {
  handle: string
  name: string
  role: string
  wiki: string
  group: 'pk' | 'global'
  /** Zaviya category for hashtags and the link to a related story */
  category?: string
}

export const WATCHLIST: Personality[] = [
  // Pakistan: government (official accounts)
  { handle: 'CMShehbaz', name: 'Shehbaz Sharif', role: 'Prime Minister of Pakistan', wiki: 'Shehbaz Sharif', group: 'pk', category: 'pakistan' },
  { handle: 'MaryamNSharif', name: 'Maryam Nawaz', role: 'Chief Minister of Punjab', wiki: 'Maryam Nawaz Sharif', group: 'pk', category: 'pakistan' },
  { handle: 'MIshaqDar50', name: 'Ishaq Dar', role: 'Deputy Prime Minister and Foreign Minister', wiki: 'Ishaq Dar', group: 'pk', category: 'pakistan' },
  { handle: 'MAuranghzeb', name: 'Muhammad Aurangzeb', role: 'Finance Minister of Pakistan', wiki: 'Muhammad Aurangzeb', group: 'pk', category: 'business' },
  { handle: 'betterpakistan', name: 'Ahsan Iqbal', role: 'Federal Minister for Planning', wiki: 'Ahsan Iqbal', group: 'pk', category: 'pakistan' },
  { handle: 'AttaTarar', name: 'Attaullah Tarar', role: 'Federal Minister for Information', wiki: 'Attaullah Tarar', group: 'pk', category: 'pakistan' },
  // Pakistan: journalists
  { handle: 'HamidMirPAK', name: 'Hamid Mir', role: 'Journalist', wiki: 'Hamid Mir', group: 'pk', category: 'pakistan' },
  // Pakistan: cricketers
  { handle: 'babarazam258', name: 'Babar Azam', role: 'Pakistan cricketer', wiki: 'Babar Azam', group: 'pk', category: 'cricket' },
  { handle: 'iShaheenAfridi', name: 'Shaheen Afridi', role: 'Pakistan cricketer', wiki: 'Shaheen Afridi', group: 'pk', category: 'cricket' },
  { handle: 'iMRizwanPak', name: 'Mohammad Rizwan', role: 'Pakistan cricketer', wiki: 'Mohammad Rizwan', group: 'pk', category: 'cricket' },
  { handle: 'SalmanAliAgha1', name: 'Salman Ali Agha', role: 'Pakistan cricketer', wiki: 'Salman Ali Agha', group: 'pk', category: 'cricket' },
  // Pakistan: artists and fashion
  { handle: 'MahiraKhan', name: 'Mahira Khan', role: 'Actress', wiki: 'Mahira Khan', group: 'pk', category: 'pakistan' },
  { handle: 'HaniaAamirReal', name: 'Hania Aamir', role: 'Actress', wiki: 'Hania Aamir', group: 'pk', category: 'pakistan' },
  { handle: 'AliZafarsays', name: 'Ali Zafar', role: 'Singer and actor', wiki: 'Ali Zafar', group: 'pk', category: 'pakistan' },
  { handle: 'itsaadee', name: 'Atif Aslam', role: 'Singer', wiki: 'Atif Aslam', group: 'pk', category: 'pakistan' },
  { handle: 'HSYOfficial', name: 'HSY', role: 'Fashion designer', wiki: 'Hassan Sheheryar Yasin', group: 'pk', category: 'pakistan' },
  // Global: tech and AI
  { handle: 'elonmusk', name: 'Elon Musk', role: 'CEO of Tesla and SpaceX', wiki: 'Elon Musk', group: 'global', category: 'tech-telecom' },
  { handle: 'sundarpichai', name: 'Sundar Pichai', role: 'CEO of Google', wiki: 'Sundar Pichai', group: 'global', category: 'tech-telecom' },
  { handle: 'satyanadella', name: 'Satya Nadella', role: 'CEO of Microsoft', wiki: 'Satya Nadella', group: 'global', category: 'tech-telecom' },
  { handle: 'sama', name: 'Sam Altman', role: 'CEO of OpenAI', wiki: 'Sam Altman', group: 'global', category: 'ai' },
  { handle: 'DarioAmodei', name: 'Dario Amodei', role: 'CEO of Anthropic', wiki: 'Dario Amodei', group: 'global', category: 'ai' },
  { handle: 'demishassabis', name: 'Demis Hassabis', role: 'CEO of Google DeepMind', wiki: 'Demis Hassabis', group: 'global', category: 'ai' },
  { handle: 'tim_cook', name: 'Tim Cook', role: 'CEO of Apple', wiki: 'Tim Cook', group: 'global', category: 'tech-telecom' },
  // Global: world leaders
  { handle: 'realDonaldTrump', name: 'Donald Trump', role: 'President of the United States', wiki: 'Donald Trump', group: 'global', category: 'world' },
  { handle: 'narendramodi', name: 'Narendra Modi', role: 'Prime Minister of India', wiki: 'Narendra Modi', group: 'global', category: 'world' },
  { handle: 'RTErdogan', name: 'Recep Tayyip Erdogan', role: 'President of Turkey', wiki: 'Recep Tayyip Erdoğan', group: 'global', category: 'world' },
  { handle: 'antonioguterres', name: 'Antonio Guterres', role: 'UN Secretary-General', wiki: 'António Guterres', group: 'global', category: 'world' },
  { handle: 'EmmanuelMacron', name: 'Emmanuel Macron', role: 'President of France', wiki: 'Emmanuel Macron', group: 'global', category: 'world' },
  { handle: 'Keir_Starmer', name: 'Keir Starmer', role: 'Prime Minister of the United Kingdom', wiki: 'Keir Starmer', group: 'global', category: 'world' },
]

/** Quote-card caps (owner's rules): at most 6 a day, at least 60 minutes apart, nothing from 00:00 to 08:00 PKT. */
export const QUOTE_RULES = {
  maxPerDay: 6,
  minGapMs: 60 * 60_000,
  /** PKT hours in which a quote card may go out: [from, to) */
  allowedHours: [8, 24] as [number, number],
  /** A quote older than this is not news */
  maxAgeMs: 12 * 60 * 60_000,
  /** X posts need this many likes before they are quoted (X search `min_faves`) */
  minFaves: 200,
  /** Longest quote on a card, in characters */
  maxChars: 240,
  minChars: 40,
}

/** Handles per X search: the query stays short enough for the search box */
export const HANDLES_PER_SEARCH = 8
/** Watch-list searches per scan: the browser behaves like a person, so a scan looks at a few groups, rotating */
export const SEARCHES_PER_SCAN = 2
