import { describe, expect, it } from 'vitest'
import { absoluteMediaUrl } from './media.js'

describe('absoluteMediaUrl (ZAV-184)', () => {
  it('points generated cards at the R2 domain so Instagram never waits for the web app', () => {
    expect(absoluteMediaUrl('https://zaviya.pk', '/api/media/file/story-card.png', 'https://media.zaviya.pk/')).toBe(
      'https://media.zaviya.pk/story-card.png',
    )
  })

  it('keeps the web URL when no CDN base is given or the path is something else', () => {
    expect(absoluteMediaUrl('https://zaviya.pk/', '/api/media/file/a.png')).toBe('https://zaviya.pk/api/media/file/a.png')
    expect(absoluteMediaUrl('https://zaviya.pk', '/other/a.png', 'https://media.zaviya.pk')).toBe('https://zaviya.pk/other/a.png')
    expect(absoluteMediaUrl('https://zaviya.pk', 'https://x.test/a.png', 'https://media.zaviya.pk')).toBe('https://x.test/a.png')
    expect(absoluteMediaUrl('https://zaviya.pk', undefined, 'https://media.zaviya.pk')).toBeUndefined()
  })
})
