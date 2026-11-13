import { describe, expect, it } from 'vitest'
import { firstPassingPhoto, photoQa, wildlifeReason } from './photo-qa.js'
import type { RealPhoto } from './real-photo.js'

const photo = (over: Partial<RealPhoto['meta']> = {}, bytes = 90_000): RealPhoto => ({
  dataUrl: 'data:image/jpeg;base64,AAAA',
  credit: 'Photo: A / CC BY 2.0 / Wikimedia Commons',
  bytes: Buffer.alloc(bytes),
  mime: 'image/jpeg',
  meta: { subject: 'Donald Trump', file: 'Trump.jpg', author: 'A', licence: 'CC BY 2.0', creditLine: '', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Trump.jpg', mediaCredit: '', width: 2000, height: 1500, ...over },
})

describe('social photo QA gate', () => {
  it('passes a free photo of a subject the headline names', () => {
    expect(photoQa(photo(), 'Trump warns renewed strike on Iran could be five times larger')).toEqual({ ok: true })
  })
  it('rejects a photo whose subject the text does not name (the Nvidia building for a Huang story)', () => {
    const v = photoQa(photo({ subject: 'Nvidia' }), 'Jensen Huang admits affair probe')
    expect(v).toEqual({ ok: false, reason: 'subject "Nvidia" is not named in the text' })
  })
  it('rejects a non-free licence, a tiny file and odd shapes', () => {
    expect(photoQa(photo({ licence: 'CC BY-NC 4.0' }), 'Trump says').ok).toBe(false)
    expect(photoQa(photo({}, 500), 'Trump says').ok).toBe(false)
    expect(photoQa(photo({ width: 400, height: 300 }), 'Trump says').ok).toBe(false)
    expect(photoQa(photo({ width: 3000, height: 600 }), 'Trump says').ok).toBe(false)
  })
  it('takes the first candidate that passes', () => {
    const bad = photo({ subject: 'Nvidia' })
    const good = photo({ subject: 'Jensen Huang' })
    expect(firstPassingPhoto([bad, null, good], 'Jensen Huang admits affair probe')).toBe(good)
    expect(firstPassingPhoto([bad], 'Jensen Huang admits affair probe')).toBeNull()
  })
  it('rejects a mosque or shrine as the photo of a city (Kohat police killing card showed Ghamkol Shareef)', () => {
    const v = photoQa(photo({ subject: 'Kohat', file: 'Ghamkol_Shareef_Kohat,_KPK_Pakistan.jpg' }), 'Six police killed in Kohat firing on illegal gold mining raid')
    expect(v.ok).toBe(false)
    expect(photoQa(photo({ subject: 'Islamabad', file: 'Faisal_Mosque,_Islamabad_III.jpg' }), 'Islamabad police jobs').ok).toBe(false)
    expect(photoQa(photo({ subject: 'Faisal Mosque', file: 'Faisal_Mosque,_Islamabad_III.jpg' }), 'Faisal Mosque lit up').ok).toBe(true)
    expect(photoQa(photo({ subject: 'Nawaz Sharif', file: 'Nawaz_Sharif_2013.jpg' }), 'Nawaz Sharif says').ok).toBe(true)
  })
})

describe('wildlife photos', () => {
  it('rejects a bird photo for a place on a news story', () => {
    expect(wildlifeReason('Iran claims destruction of US radar in Bahrain', 'Greater flamingos (Phoenicopterus roseus) Bahrain.jpg')).toMatch(/wildlife/)
    expect(wildlifeReason('Digital skills program launched in Punjab', 'White-throated Kingfisher in Ludhiana district, Punjab 03.jpg')).toMatch(/wildlife/)
  })
  it('allows it when the story is about nature', () => {
    expect(wildlifeReason('Migratory birds return to Punjab wetlands', 'White-throated Kingfisher in Punjab.jpg')).toBeNull()
  })
  it('allows ordinary place photos', () => {
    expect(wildlifeReason('Rain in Lahore', 'Badshahi Mosque, Lahore.jpg')).toBeNull()
    expect(wildlifeReason('Cricket in Karachi', 'National Stadium Karachi (2019).jpg')).toBeNull()
  })
})
