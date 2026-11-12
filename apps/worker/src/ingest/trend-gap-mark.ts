/**
 * Items the trend-gap job ingests start their summary with this mark. Triage reads it as a Google Trends hit
 * (the topic is trending in Pakistan right now) and the publish pace treats the story as a trend story.
 */
export const TREND_GAP_MARK = 'Trend gap:'

export function isTrendGapItem(item: { summary?: string | null }): boolean {
  return Boolean(item.summary && item.summary.startsWith(TREND_GAP_MARK))
}

export function isTrendGapCluster(items: { summary?: string | null }[]): boolean {
  return items.some(isTrendGapItem)
}
