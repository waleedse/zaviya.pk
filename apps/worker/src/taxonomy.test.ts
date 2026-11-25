import { describe, expect, it } from 'vitest'
import { categorize, categoryFromSegments, categoryLevels, categoryUrlPath } from '@zaviya/shared'

describe('categorize', () => {
  const cases: [string, string, string | null][] = [
    ['8AM Perfume for men - Vanilla, Amber & Woody 100ml', '', 'Beauty > Perfume & fragrance'],
    ['Samsung Galaxy A54 5G Dual Sim with Official Warranty', '', 'Electronics > Mobile phones > Smartphones'],
    ['Iphone 20W USB-C PD Fast Charging Adapter', '', 'Electronics > Mobile phones > Accessories > Chargers & cables'],
    ['Stainless Steel Spoon Set of 6', '', 'Home & kitchen > Cutlery & spoons'],
    ['Polarized Aviator Sunglasses', '', 'Eyewear > Sunglasses'],
    ['Zeroni Optical Frame RX 332', 'Eyeglasses', 'Eyewear > Frames & glasses'],
    ['RTS | SHIRT, TROUSER & DUPATTA', 'SHIRT, TROUSER & DUPATTA', 'Fashion > Women > Ready to wear'],
    ['Dawlance 1.5 Ton Inverter AC', '', 'Home appliances > Air conditioners'],
    ['Tapal Danedar Tea 950g', '', 'Grocery > Sugar, tea & coffee'],
    ['Sunglasses With 3 Interchangeable Lenses', '', 'Eyewear > Sunglasses'],
    ['Sajiero Half Sleeves PJ Set - Linen Comfort - Pink', '', 'Fashion > Innerwear & nightwear'],
    ['Girl Fancy Pumps Fawn 0710710', '', 'Fashion > Footwear'],
    ['Nikon Nikkor Z MC 105mm f/2.8 VR S Macro Lens', '', 'Electronics > Cameras > Lenses'],
    ['ViewSonic SP7 4800 Lumens WXGA Business Projector', '', 'Electronics > Projectors'],
    ['Dawn Aalo Paratha 3 Pieces', '', 'Grocery > Fresh & frozen'],
    ['Broom and Dustpan Set Adjustable Handle', '', 'Home & kitchen > Cleaning & utility'],
    ['Neck Fan Adjustment Fan Hands-Free Hanging Rechargeable', '', 'Home appliances > Fans & coolers'],
    ['Sony WH-1000XM5 Wireless Headphones', '', 'Electronics > Audio > Earbuds & headphones > Headphones'],
    ['Apple AirPods Pro 3', '', 'Electronics > Audio > Earbuds & headphones > Wireless earbuds'],
    ['Audionic Max 550 BT Plus 2.1 Multimedia Woofer Speaker', '', 'Electronics > Audio > Speakers > Multimedia & woofers'],
    ['Apple MacBook Air 13 M5 10-Core', '', 'Electronics > Laptops > MacBooks'],
    ['Silicone Case for iPhone 16 Pro', '', 'Electronics > Mobile phones > Accessories > Cases & covers'],
    ['COMFORTA TAB 10MG', '', 'Health > Medicines > Tablets & capsules'],
    ['CEFTAS SYP DS 200MG', '', 'Health > Medicines > Syrups & drops'],
    ['Needle Roller Bearing HK1010', 'Needle Roller Bearings', 'Tools & industrial > Bearings & CNC parts'],
    ['Valuables Boys Half Sleeves Suit', 'Boys Sets & Suits', 'Fashion > Kids clothing'],
    ['N-239 Press On Nail Set Of 24', '', 'Beauty > Makeup > Nails & lashes'],
    ['Islamic Calligraphy Canvas 3 Panels', 'canvas', 'Home > Wall art & decor'],
    ['White Canvas Shoes for Men', '', 'Fashion > Footwear'],
    ['Rooh Afza Syrup 800ml', '', 'Grocery > Pantry & staples'],
    ['Dawlance WD-1060 Water Dispenser', '', 'Home appliances > Kitchen appliances > Water dispensers'],
    ['qwerty widget', '', null],
  ]
  for (const [t, l, want] of cases) it(`${t} -> ${want}`, () => expect(categorize(t, l)).toBe(want))
  it('builds URLs both ways', () => expect(categoryFromSegments(categoryUrlPath('Electronics > Audio > Earbuds & headphones').split('/'))).toBe('Electronics > Audio > Earbuds & headphones'))
  it('gives every level', () => expect(categoryLevels('Beauty > Perfume & fragrance')).toEqual(['Beauty', 'Beauty > Perfume & fragrance']))
})
