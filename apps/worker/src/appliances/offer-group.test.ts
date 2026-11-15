import { describe, expect, it } from 'vitest'
import { offerGroup } from '@zaviya/shared'

// 15 Nov 2026: Telemart sells everything; 2,395 of 3,462 listings fell in "other" with the first 10 groups
describe('offerGroup: store categories', () => {
  it.each([
    ['HyperX Pulsefire Haste 2 Wireless Gaming Mouse', 'computer'],
    ['Razer BlackWidow Lite Mechanical Keyboard', 'computer'],
    ['Sonic Superstars PS4', 'gaming'],
    ['Cougar Stryder Gaming Ergonomic Chair', 'gaming'],
    ['Fujifilm Instax Mini 12 Instant Camera', 'cameras'],
    ['Nikon AF Nikkor 85mm f/1.8D Portrait Lens', 'cameras'],
    ['Lattafa EDP Fakhar Lattafa Extract Perfume 100 ml - Unisex', 'beauty'],
    ['Mini Hair Straightener', 'beauty'],
    ['Royal Basket Pine Nuts / Chilgoza (Shelled)', 'grocery'],
    ['Bio-Check H. Pylori Ab Rapid Test Kit', 'health'],
    ['Prince Ware Ocean Water Bottle Insulated - Medium - (650ml)', 'kitchen'],
    ['12 Inch Single Color Writing Board Drawing Tablet LCD Writing Tablet', 'toys'],
    ['12 Pcs Washing machine detergent cleaner deep cleaning tablets', 'kitchen'],
    ['Samsung Galaxy Tab A9 4GB 64GB', 'tablets'],
    ['Infinix Hot 50 8GB 256GB', 'mobiles'],
    ['Royal Fan Stand Fan 24 inch', 'home-appliances'],
    ['Anker 20W USB-C Charger', 'accessories'],
    ['DJI Mini 4 Pro Drone with RC 2 Controller', 'cameras'],
    ['Motorola Moto G37 5G Dual Sim With Official Warranty', 'mobiles'],
    ['Realme Note 70 Dual Sim With Official Warranty', 'mobiles'],
    ['Isdin Fusion Water Magic Repair SPF50 50ml', 'beauty'],
    ['Redragon GM-300 Blazar Gaming Stream Microphone', 'audio'],
  ])('%s -> %s', (title, group) => {
    expect(offerGroup(title)).toBe(group)
  })

  it('a contact lens is not a camera lens', () => {
    expect(offerGroup('Contact Lens Solution 120ml')).not.toBe('cameras')
  })

  it('reads the store product type for phones but not phone accessories', () => {
    expect(offerGroup('Galaxy A17', 'Mobile Phones')).toBe('mobiles')
    expect(offerGroup('Magnetic ring', 'Mobile Accessories')).not.toBe('mobiles')
  })
})
