import { describe, expect, it } from 'vitest'
import { acceptable, personPhotoOk, photoYear } from './real-photo.js'

describe('photos of living people: recent and adult (ZG-16)', () => {
  const info = (over: Record<string, string> = {}) => ({
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:X.jpg', mime: 'image/jpeg', width: 3000, height: 2000,
    extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, { value: v }])) },
  })
  it('reads the year from the Commons date, else from the file name', () => {
    expect(photoYear('X.jpg', info({ DateTimeOriginal: '<time>1975-03-02</time>' }))).toBe(1975)
    expect(photoYear('Imran Khan 2019.jpg', info())).toBe(2019)
    expect(photoYear('Imran Khan.jpg', info())).toBeNull()
  })
  it('rejects childhood and family-archive files, anything before 1990, and (first choice) anything before 2015', () => {
    expect(personPhotoOk('Imran Khan with his father.jpg', info(), 'adult')).toBe(false)
    expect(personPhotoOk('Imran Khan as a child.jpg', info(), 'adult')).toBe(false)
    expect(personPhotoOk('Young Imran Khan.jpg', info(), 'adult')).toBe(false)
    expect(personPhotoOk('Imran Khan.jpg', info({ ImageDescription: '<p>Sepia family archive photo</p>' }), 'adult')).toBe(false)
    expect(personPhotoOk('Imran Khan 1982.jpg', info(), 'adult')).toBe(false)
    expect(personPhotoOk('Imran Khan 2008.jpg', info(), 'recent')).toBe(false)
    expect(personPhotoOk('Imran Khan 2008.jpg', info(), 'adult')).toBe(true)
    expect(personPhotoOk('Imran Khan 2022.jpg', info(), 'recent')).toBe(true)
    expect(personPhotoOk('Imran Khan.jpg', info(), 'recent')).toBe(true) // no date known: not held against it
  })
  it('acceptable() applies the person rule only when asked', () => {
    const o = { minWidth: 900, minAspect: 0.7 }
    expect(acceptable('Young Imran Khan.jpg', info(), o)).toBe(true)
    expect(acceptable('Young Imran Khan.jpg', info(), o, false, 'adult')).toBe(false)
  })
  it('a product shot is not a photo of the company or its people (Nvidia card, 12 Nov: an RTX 5070 laptop keynote file)', () => {
    const o = { minWidth: 900, minAspect: 0.7 }
    expect(acceptable('Nvidia RTX 5070 laptop keynote.jpg', info(), o, true)).toBe(false)
    expect(acceptable('Nvidia headquarters, Santa Clara.jpg', info(), o, true)).toBe(true)
  })
})
