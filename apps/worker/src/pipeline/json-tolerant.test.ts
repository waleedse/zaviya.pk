import { describe, expect, it } from 'vitest'
import { parseModelJson } from './json-tolerant.js'

describe('parseModelJson', () => {
  it('parses plain and fenced JSON', () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 })
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('ignores trailing prose that contains braces', () => {
    expect(parseModelJson('{"a":"x}y","b":{"c":2}}\nNote: I used {braces} here.')).toEqual({ a: 'x}y', b: { c: 2 } })
  })
  it('takes the first of two objects', () => {
    expect(parseModelJson('{"a":1}\n{"a":2}')).toEqual({ a: 1 })
  })
  it('ignores leading prose and escaped quotes', () => {
    expect(parseModelJson('Here you go: {"a":"say \\"hi\\" }"} thanks')).toEqual({ a: 'say "hi" }' })
  })
  it('throws when there is no object', () => {
    expect(() => parseModelJson('no json')).toThrow()
  })
})
