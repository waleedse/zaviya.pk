/** A tag page with fewer published stories is thin: it stays out of Google and is not linked from articles (ZAV-221). */
export const MIN_INDEXABLE_TAG_STORIES = 3

export const LATEST_PAGE_SIZE = 50

export const isThinTag = (storyCount: number): boolean => storyCount < MIN_INDEXABLE_TAG_STORIES
