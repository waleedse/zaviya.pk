import { describe, it, expect } from 'vitest'
import type { TriageResult } from '@zaviya/shared'
import { applyGlobalTopic, globalTopicBrief, majorGlobalTopic, MAJOR_GLOBAL_RELEVANCE } from './global-news.js'
import { applyTriageRules } from './triage-rules.js'
import { routeByStoryKind } from './story-kind.js'

describe('majorGlobalTopic (ZAV-301)', () => {
  it.each([
    ['Iran shoots down US MQ-9 drone over Hormuz - Dawn', 'us-iran'],
    ['Donald Trump Rules Out Renewed Military Strikes On Iran After Midterm Elections', 'us-iran'],
    ["Iran 'not in a good negotiating position': Trump - Dawn", 'us-iran'],
    ["Trump Threatens Strike On Iran's Pickaxe Mountain, Says US Can Hit Target", 'us-iran'],
    ['Explained: Why Are US Midterm Elections So Important? - Dawn', 'us-election'],
    ['US Midterms: Can Democrats Take The Congress?', 'us-election'],
    ['Israel denies involvement in reported US strikes on Qeshm island', 'us-iran'],
    ["Yemen's Houthis say Saudi strikes killed 17 people over 2 days", 'gulf'],
    ['Saudi-led coalition says intercepted drone in Makkah region - Dawn', 'gulf'],
    ['Binance reveals hackers used fake job interviews, malicious code in $6-bn heist', 'crypto-hack'],
    ['Brent crude jumps 6pc as supply fears grow', 'oil-shock'],
    ['Trump says US will stop $4 billion funding to Israel at end of 2026 - Dawn', 'israel-gaza'],
    ['ٹرمپ کی ایران پر حملے کی دھمکی', 'us-iran'],
    ['امریکی انتخابات میں کامیابی اور ناکامی کا فیصلہ کیسے ہو گا', 'us-election'],
  ])('%s -> %s', (title, topic) => {
    expect(majorGlobalTopic(title)).toBe(topic)
  })

  it.each([
    "Meghan Markle's Netflix show loses out at 2026 Daytime Emmy Awards",
    "Disney's Jared Bush explains why 'Frozen 4' won't be rushed",
    'street performer walks along a road with his goat, dog and monkeys',
    'Spanish footballer Jesus De Miguel dies after collision with keeper',
    'Flooding prompts St. Lucie County closures, could affect Election Day',
    'UK Increases Permanent Residency Wait Time to Up to 30 Years',
    'Bomb threats disrupt air travel across Europe',
    'Iranian film wins best picture at Oscars',
    'SBP keeps policy rate unchanged',
    '',
  ])('is not a major world story: %s', (title) => {
    expect(majorGlobalTopic(title)).toBeNull()
  })
})

const triage = (over: Partial<TriageResult> = {}): TriageResult => ({
  pakistanRelevance: 0.1,
  newsworthiness: 0.8,
  sourceCredibility: 0.85,
  category: 'world',
  sensitivityFlags: [],
  isUpdateOfExisting: false,
  suggestedPriority: 'normal',
  decision: 'reject',
  reason: 'no Pakistan angle',
  ...over,
})

describe('major world stories in the triage rules (ZAV-301)', () => {
  it('lifts the relevance floor and turns a model reject on "no Pakistan angle" into a review', () => {
    const t = applyGlobalTopic(triage(), 'us-iran')
    expect(t.pakistanRelevance).toBe(MAJOR_GLOBAL_RELEVANCE)
    expect(t.decision).toBe('review')
    expect(applyGlobalTopic(triage(), null)).toEqual(triage())
  })

  it('never rescues opinion', () => {
    expect(applyGlobalTopic(triage({ storyKind: 'opinion' }), 'us-iran').decision).toBe('reject')
  })

  it('without the topic the weak-angle story is rejected, with it the story survives and clears the review threshold', () => {
    const base = { maxTier: 2 as const, distinctSources: 2, settings: {} }
    expect(applyTriageRules(triage(), base).outcome).toBe('reject')
    const d = applyTriageRules(triage({ sensitivityFlags: ['violence'] }), { ...base, globalTopic: 'us-iran' })
    expect(d.outcome).toBe('review')
    expect(d.weightedScore).toBeGreaterThanOrEqual(0.5)
  })

  it('a lone Google Trends hit on a world story goes to review instead of the tier-3 reject; without Trends it still rejects', () => {
    const t3 = { maxTier: 3 as const, distinctSources: 1, settings: {} }
    expect(applyTriageRules(triage({ newsworthiness: 0.6 }), { ...t3, globalTopic: 'us-election', trendsHit: true }).outcome).toBe('review')
    expect(applyTriageRules(triage({ newsworthiness: 0.6 }), { ...t3, globalTopic: 'us-election' }).outcome).toBe('reject')
  })

  it('a foreign explainer on a major story is no longer rejected, an unrelated foreign feature still is', () => {
    const feature = triage({ storyKind: 'feature', eventRegion: 'abroad', pakistanRelevance: 0.2, decision: 'publish' })
    expect(routeByStoryKind(feature, [{ title: 'Explained: Why Are US Midterm Elections So Important? - Dawn' }], { globalTopic: 'us-election' }).action).toBe('ok')
    expect(routeByStoryKind(feature, [{ title: 'Explained: how glaciers form' }]).action).toBe('reject')
    expect(routeByStoryKind({ ...feature, storyKind: 'opinion' }, [{ title: 'x' }], { globalTopic: 'us-election' }).action).toBe('reject')
  })

  it('the writer brief asks for a cautious "What it means for Pakistan" section only for a world story', () => {
    expect(globalTopicBrief('us-iran')).toMatch(/What it means for Pakistan/)
    expect(globalTopicBrief('us-iran')).toMatch(/Do not invent/)
    expect(globalTopicBrief(undefined)).toBe('')
    expect(globalTopicBrief('nonsense')).toBe('')
  })
})
