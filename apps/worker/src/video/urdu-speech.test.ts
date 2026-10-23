import { describe, expect, it } from 'vitest'
import { numberToUrdu, speechSentences, toLatinDigits, toSpeechText } from './urdu-speech.js'

describe('numberToUrdu', () => {
  it('reads the irregular 0-99 words and the lakh/crore system', () => {
    expect(numberToUrdu(0)).toBe('صفر')
    expect(numberToUrdu(21)).toBe('اکیس')
    expect(numberToUrdu(99)).toBe('ننانوے')
    expect(numberToUrdu(100)).toBe('ایک سو')
    expect(numberToUrdu(4500)).toBe('چار ہزار پانچ سو')
    expect(numberToUrdu(2026)).toBe('دو ہزار چھبیس')
    expect(numberToUrdu(150000)).toBe('ایک لاکھ پچاس ہزار')
    expect(numberToUrdu(25_000_000)).toBe('دو کروڑ پچاس لاکھ')
  })
})

describe('toSpeechText', () => {
  it('spells money, percentages, times and decimals', () => {
    expect(toSpeechText('Rs5.40 کی کمی').text).toBe('پانچ روپے چالیس پیسے کی کمی')
    expect(toSpeechText('قیمت Rs4,500 ہے').text).toBe('قیمت چار ہزار پانچ سو روپے ہے')
    expect(toSpeechText('22% اضافہ').text).toBe('بائیس فیصد اضافہ')
    expect(toSpeechText('$30B کا قرض').text).toBe('تیس ارب ڈالر کا قرض')
    expect(toSpeechText('14:32 پر').text).toBe('چودہ بج کر بتیس منٹ پر')
    expect(toSpeechText('شرح 11.5 رہی').text).toBe('شرح گیارہ اعشاریہ پانچ رہی')
  })

  it('knows common terms, spells acronyms and reports what it cannot read', () => {
    expect(toSpeechText('IMF اور OpenAI').text).toBe('آئی ایم ایف اور اوپن اے آئی')
    expect(toSpeechText('XYZ کمپنی').text).toBe('ایکس وائی زیڈ کمپنی')
    const r = toSpeechText('یہ Blorptastic ہے')
    expect(r.unresolved).toEqual(['Blorptastic'])
    expect(r.text).toBe('یہ ہے')
  })

  it('reads Urdu and Arabic-Indic digits and keeps Urdu punctuation', () => {
    expect(toLatinDigits('۱۲ ٣')).toBe('12 3')
    expect(toSpeechText('کیا یہ درست ہے? ہاں, ہے.').text).toBe('کیا یہ درست ہے؟ ہاں، ہے۔')
  })

  it('reads zaviya.pk aloud', () => {
    expect(toSpeechText('مزید zaviya.pk پر').text).toBe('مزید زاویہ ڈاٹ پی کے پر')
  })
})

describe('speechSentences', () => {
  it('splits after full stops and joins tiny pieces', () => {
    expect(speechSentences('پہلا جملہ یہ ہے۔ دوسرا جملہ وہ ہے۔')).toEqual(['پہلا جملہ یہ ہے۔', 'دوسرا جملہ وہ ہے۔'])
    expect(speechSentences('ہاں۔ یہ ایک لمبا جملہ ہے۔')).toEqual(['ہاں۔ یہ ایک لمبا جملہ ہے۔'])
  })
})
