export const SOCIAL_COPY_PROMPT_VERSION = 'social-v1'

export function socialCopySystemPrompt(): string {
  return `Write concise social post copy for Zaviya stories. No clickbait. Facebook, Instagram, and X variants. JSON output.`
}
