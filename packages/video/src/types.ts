export type Edition = 'morning' | 'evening'
export type Format = 'flash15' | 'headlines30' | 'roundup60' | 'topic60' | 'money45'
export type Topic = 'ai-tech' | 'money'

export interface StoryInput {
  id: number
  slug: string
  title: string
  titleUr?: string | null
  dek?: string | null
  /** category slug */
  category: string
  /** file name under public/fixtures-images/ (served by staticFile), or an absolute URL */
  image: string
  sources: { name: string; tier: number }[]
  isBreaking: boolean
  priority: 'normal' | 'high' | 'breaking'
  publishedAt: string
  /** tag names, the hashtag source */
  tags?: string[]
}

export interface RateInput {
  series: 'usd_interbank' | 'gold_24k_tola' | 'petrol_super'
  value: number
  previous?: number | null
  unit: string
  source: string
  observedAt: string
}

export interface EditionInput {
  edition: Edition
  /** ISO timestamp of the edition (used for the date line, track rotation and rate freshness) */
  date: string
  stories: StoryInput[]
  rates: RateInput[]
  trackId?: string
  format?: Format
  topic?: Topic | null
}

export type Mode = 'normal' | 'breaking' | 'sombre'
export type ThemeName = 'sunrise' | 'night' | 'breaking' | 'sombre' | 'tech' | 'money'

export interface StoryScene {
  kind: 'story'
  storyId: number
  /** show the dek whatever the room (flash and topic formats) */
  dekAlways?: boolean
  /** 1-based */
  index: number
  total: number
  headline: string
  headlineUr?: string
  /** short standfirst under the headline, shown only when there is room */
  dek?: string
  highlight?: string
  figure?: { value: string; label: string }
  category: { slug: string; label: string; color: string }
  image: string
  /** "via Dawn · Reuters" or "" */
  credit: string
  durationInFrames: number
}

export interface HookScene {
  kind: 'hook'
  durationInFrames: number
  title: [string, string]
  dateLine: string
  /** lead story photo, so the hook starts on the moving picture */
  image: string
}

export interface NumbersScene {
  kind: 'numbers'
  durationInFrames: number
  tiles: { label: string; value: string; delta: 'up' | 'down' | 'flat'; source: string }[]
}

export interface OutroScene {
  kind: 'outro'
  durationInFrames: number
  cta: string
  /** numbered chips to show (0 = none) */
  count: number
  handles: string[]
  site: string
}

export interface QuickHitsScene {
  kind: 'quickhits'
  durationInFrames: number
  rows: { storyId: number; number: number; headline: string; category: { slug: string; label: string; color: string }; image: string }[]
}

export type Scene = HookScene | StoryScene | NumbersScene | QuickHitsScene | OutroScene

export interface TrackInfo {
  id: string
  file: string
  bpm: number
  firstBeatMs: number
  mood: 'bright' | 'night' | 'calm'
}

export interface Timeline {
  edition: Edition
  format: Format
  topic: Topic | null
  /** ISO timestamp of the edition */
  date: string
  /** total number of stories including quick hits */
  storyCount: number
  mode: Mode
  theme: ThemeName
  track: { file: string; bpm: number; firstBeatMs: number }
  transitionFrames: number
  scenes: Scene[]
  totalFrames: number
  /** shown on the cover still, e.g. "TODAY · 17 OCT" */
  coverLine: string
}
