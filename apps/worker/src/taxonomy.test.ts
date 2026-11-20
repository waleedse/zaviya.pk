import { describe, expect, it } from 'vitest'
import { categorize, categoryLevels } from '@zaviya/shared'

describe('categorize', () => {
  const cases: [string, string, string | null][] = [
    ['8AM Perfume for men - Vanilla, Amber & Woody 100ml', '', 'Beauty > Perfume & fragrance'],
    ['Samsung Galaxy A54 5G Dual Sim with Official Warranty', '', 'Electronics > Mobile phones'],
    ['Iphone 20W USB-C PD Fast Charging Adapter', '', 'Electronics > Mobile phones > Accessories'],
    ['Stainless Steel Spoon Set of 6', '', 'Home & kitchen > Cutlery & spoons'],
    ['Polarized Aviator Sunglasses', '', 'Eyewear > Sunglasses'],
    ['Zeroni Optical Frame RX 332', 'Eyeglasses', 'Eyewear > Frames & glasses'],
    ['RTS | SHIRT, TROUSER & DUPATTA', 'SHIRT, TROUSER & DUPATTA', 'Fashion > Women > Ready to wear'],
    ['Dawlance 1.5 Ton Inverter AC', '', 'Home appliances > Air conditioners'],
    ['Tapal Danedar Tea 950g', '', 'Grocery > Sugar, tea & coffee'],
    ['Sunglasses With 3 Interchangeable Lenses', '', 'Eyewear > Sunglasses'],
    ['qwerty widget', '', null],
  ]
  for (const [t, l, want] of cases) it(`${t} -> ${want}`, () => expect(categorize(t, l)).toBe(want))
  it('gives every level', () => expect(categoryLevels('Beauty > Perfume & fragrance')).toEqual(['Beauty', 'Beauty > Perfume & fragrance']))
})
