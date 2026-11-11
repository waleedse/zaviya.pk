import { describe, expect, it } from 'vitest'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { analyzeImage, documentReason } from './image-stats.js'
import { documentNameReason, documentPixelReason, heroPhotoQa, photoQa } from './photo-qa.js'
import type { RealPhoto } from './real-photo.js'

/** A page: white with a few lines of grey "text" */
function pagePng(): Buffer {
  const png = new PNG({ width: 600, height: 800 })
  png.data.fill(255)
  let seed = 3
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff)
  // lines of grey "text": scattered dark dots along each line, so the file is not trivially small
  for (let y = 40; y < 760; y += 20) for (let x = 30; x < 570; x++) for (let dy = 0; dy < 8; dy++) if (rnd() % 3 === 0) png.data.writeUInt32LE((0xff000000 | ((rnd() % 90) * 0x010101)) >>> 0, ((y + dy) * 600 + x) * 4)
  return PNG.sync.write(png)
}

/** A noisy colourful picture standing in for a photo */
function photoJpeg(): Buffer {
  const w = 320
  const h = 200
  const data = Buffer.alloc(w * h * 4)
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 255
  for (let i = 0; i < w * h; i++) {
    const x = i % w
    data[i * 4] = (x * 0.8 + rnd() * 0.3) % 256
    data[i * 4 + 1] = (rnd() * 0.7 + 60) % 256
    data[i * 4 + 2] = ((i / w) * 1.2 + rnd() * 0.3) % 256
    data[i * 4 + 3] = 255
  }
  return Buffer.from(jpeg.encode({ data, width: w, height: h }, 90).data)
}

const real = (bytes: Buffer, over: Partial<RealPhoto['meta']> = {}, mime = 'image/jpeg'): RealPhoto => ({
  dataUrl: '',
  credit: '',
  bytes,
  mime,
  meta: { subject: 'Peshawar', file: 'Peshawar street.jpg', author: 'A', licence: 'CC BY 2.0', creditLine: '', sourceUrl: 'https://www.flickr.com/photos/1/2', mediaCredit: '', width: 2000, height: 1300, provider: 'openverse', ...over },
})

describe('document and screenshot rejection', () => {
  it('rejects by name', () => {
    for (const n of ['Kenyataan Akhbar 2025.jpg', 'Press release - Ministry.png', 'Screenshot 2025-11-10.png', 'Notification No. 5.jpg', 'Scanned letter.jpg', 'Reddit thread.png', 'Document page 1.jpg']) {
      expect(documentNameReason(n), n).toMatch(/document\/screenshot/)
    }
    expect(documentNameReason('Peshawar street.jpg', 'Pakistan police on patrol')).toBeNull()
  })
  it('rejects by pixels: a white page with grey text', () => {
    const png = pagePng()
    const stats = analyzeImage(png, 'image/png')!
    expect(stats.whiteFrac).toBeGreaterThan(0.7)
    expect(documentReason(stats)).toMatch(/white|page/)
    expect(documentPixelReason(png, 'image/png')).toBeTruthy()
  })
  it('keeps a colourful photo', () => {
    expect(documentPixelReason(photoJpeg(), 'image/jpeg')).toBeNull()
  })
  it('an image that cannot be decoded is not rejected on pixels', () => {
    expect(documentPixelReason(Buffer.alloc(30_000, 1), 'image/jpeg')).toBeNull()
  })
  it('hero QA says why: name, pixels, licence', () => {
    expect(heroPhotoQa(real(photoJpeg()))).toEqual({ ok: true })
    expect(heroPhotoQa(real(photoJpeg(), { file: 'Kenyataan Akhbar.jpg' }))).toMatchObject({ ok: false, reason: expect.stringMatching(/kenyataan/i) })
    expect(heroPhotoQa(real(pagePng(), {}, 'image/png'))).toMatchObject({ ok: false, reason: expect.stringContaining('white') })
    expect(heroPhotoQa(real(photoJpeg(), { licence: 'CC BY-NC 2.0' }))).toMatchObject({ ok: false })
    expect(heroPhotoQa(real(photoJpeg(), { licence: 'CC BY-ND 2.0' }))).toMatchObject({ ok: false })
  })
  it('the social photo gate rejects screenshots too', () => {
    const commons = { sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg', provider: 'commons' as const }
    expect(photoQa(real(photoJpeg(), { ...commons, file: 'Peshawar press release.jpg' }), 'Peshawar blast')).toMatchObject({ ok: false })
    expect(photoQa(real(pagePng(), commons, 'image/png'), 'Peshawar blast')).toMatchObject({ ok: false })
    expect(photoQa(real(photoJpeg(), commons), 'Peshawar blast')).toEqual({ ok: true })
  })
})
