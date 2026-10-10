import { createHash } from 'node:crypto'

export function socialIdempotencyKey(articleId: string, platform: string, format: string): string {
  return createHash('sha1').update(`${articleId}${platform}${format}`).digest('hex')
}

export function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}
