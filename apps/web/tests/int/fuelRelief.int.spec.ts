import { describe, expect, it } from 'vitest'
import { netPetrolPrice, regDateToken, regSmsText } from '../../src/lib/fuel-relief'

describe('fuel relief SMS', () => {
  it('turns a date input into DDMMYYYY', () => {
    expect(regDateToken('2019-03-07')).toBe('07032019')
    expect(regDateToken('2019-03')).toBe('')
  })
  it('builds REG only when every part is valid', () => {
    expect(regSmsText('35202-1234567-1', 'lea 1234', 'P', '2019-03-07')).toBe('REG 3520212345671 LEA-1234 P 07032019')
    expect(regSmsText('3520212345', 'LEA-1', 'P', '2019-03-07')).toBe('')
    expect(regSmsText('3520212345671', 'LEA-1', 'X', '2019-03-07')).toBe('')
    expect(regSmsText('3520212345671', '', 'P', '2019-03-07')).toBe('')
  })
  it('subtracts the Rs100 relief', () => {
    expect(netPetrolPrice(377.91)).toBe(277.91)
  })
})
