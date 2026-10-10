/**
 * Phase 2 — Remotion Reels (not implemented in-app).
 *
 * Intended pipeline: article JSON → LLM script + key points → Remotion composition
 * (9:16) → upload to R2 → attach to `social-posts` / YouTube Shorts.
 *
 * Payload bot endpoint `/api/pipeline/*` can gain a `POST …/remotion/render` step later;
 * see docs/GROWTH.md.
 */
export type RemotionReelBrief = {
  articleId: string
  locale: 'en' | 'ur'
  title: string
  hook: string
  beats: string[]
  heroImageUrl?: string
}

export function articleToRemotionBrief(input: RemotionReelBrief): RemotionReelBrief {
  return input
}
