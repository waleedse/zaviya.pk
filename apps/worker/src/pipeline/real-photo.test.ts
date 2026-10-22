import { describe, expect, it } from 'vitest'
import { findRealPhoto, subjectsFor } from './real-photo.js'

describe('real photo', () => {
  it('only tries entities named in the headline, most specific first', () => {
    expect(subjectsFor('Imran Khan meets IMF team in Lahore', ['IMF', 'Imran Khan', 'Karachi', 'Lahore'])).toEqual(['Imran Khan', 'Lahore', 'IMF'])
  })

  it('accepts a big free Commons image of the right page and rejects the rest', async () => {
    const pages = (title: string, source: string, width = 2000) => ({ query: { pages: { 1: { title, index: 1, original: { source, width, height: 1000 } } } } })
    const mk = (json: unknown) =>
      (async (u: string) =>
        String(u).includes('api.php')
          ? new Response(JSON.stringify(json))
          : new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } })) as unknown as typeof fetch
    const ok = await findRealPhoto('Shehbaz Sharif addresses nation', ['Shehbaz Sharif'], mk(pages('Shehbaz Sharif', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/S.jpg')))
    expect(ok?.credit).toContain('Wikimedia')
    // a non-Commons (fair-use) file, a small file, and a different page are all skipped
    expect(await findRealPhoto('Shehbaz Sharif addresses nation', ['Shehbaz Sharif'], mk(pages('Shehbaz Sharif', 'https://upload.wikimedia.org/wikipedia/en/a/ab/S.jpg')))).toBeNull()
    expect(await findRealPhoto('Shehbaz Sharif addresses nation', ['Shehbaz Sharif'], mk(pages('Shehbaz Sharif', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/S.jpg', 400)))).toBeNull()
    expect(await findRealPhoto('Shehbaz Sharif addresses nation', ['Shehbaz Sharif'], mk(pages('Nawaz Sharif', 'https://upload.wikimedia.org/wikipedia/commons/a/ab/S.jpg')))).toBeNull()
  })
})
