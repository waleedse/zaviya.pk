import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ApplianceImportItemSchema } from '@zaviya/shared'
import { WOO_STORES, latestSpiRelease, nationalAverage, parseHyundai, parseSpiAnnex, parseToyota, parseWooProducts, spiToItems, toyotaKeyName, unzipEntries, xlsxRows } from './sources.js'

/** A tiny zip (deflated entries), the way an .xlsx is built */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, 'utf8'))
    const nameBuf = Buffer.from(name, 'utf8')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(Buffer.byteLength(text), 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(Buffer.byteLength(text), 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(files).length, 8)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

describe('woocommerce store (Atlas Honda)', () => {
  const products = [
    { name: 'CD70 Black', permalink: 'https://www.atlashonda.com.pk/product/cd-70-black/', prices: { price: '159900', currency_minor_unit: 0 }, categories: [{ name: 'Motorcycles', slug: 'motorcycles' }] },
    { name: 'CD70 Red', permalink: 'https://www.atlashonda.com.pk/product/cd-70-red/', prices: { price: '159900', currency_minor_unit: 0 }, categories: [{ name: 'Motorcycles', slug: 'motorcycles' }] },
    { name: 'CG150 Red', permalink: 'https://www.atlashonda.com.pk/product/cg150-red/', prices: { price: '449900', currency_minor_unit: 0 }, categories: [{ name: 'Motorcycles', slug: 'motorcycles' }] },
    { name: 'CG150 Green', permalink: 'https://www.atlashonda.com.pk/product/cg150-green/', prices: { price: '459900', currency_minor_unit: 0 }, categories: [{ name: 'Motorcycles', slug: 'motorcycles' }] },
    { name: 'ICON e: White', permalink: 'https://www.atlashonda.com.pk/product/icon-e-white/', prices: { price: '419900', currency_minor_unit: 0 }, categories: [{ name: 'ev', slug: 'ev' }] },
    { name: 'Spark Plug CD70', permalink: 'https://www.atlashonda.com.pk/product/spark-plug-cd70/', prices: { price: '350', currency_minor_unit: 0 }, categories: [{ name: 'Spare Parts', slug: 'spare-parts' }] },
  ]
  const items = parseWooProducts(products, WOO_STORES[0]!)
  it('groups colours into one model, cheapest price, and skips spare parts', () => {
    expect(items.map((i) => i.name)).toEqual(['CD 70', 'CG 150', 'ICON e'])
    const cg = items.find((i) => i.name === 'CG 150')!
    expect(cg.pricePkr).toBe(449_900)
    expect(cg.officialUrl).toBe('https://www.atlashonda.com.pk/product/cg150-red/')
    expect(cg.specs).toContainEqual({ label: 'Colours', value: 'Red, Green' })
    expect(items.find((i) => i.name === 'ICON e')!.specs).toContainEqual({ label: 'Type', value: 'Electric' })
    for (const it of items) expect(ApplianceImportItemSchema.safeParse(it).success).toBe(true)
  })
})

describe('toyota indus price list', () => {
  const html = `<script>let cars = { corolla: { "corollaMt16Price": "Rs 6,099,000/-", "altisGrandeCVTi18BeigeInteriorPrice": "Discontinued", }, prius: { "PriusPrice": "Order Intake on Hold.", }, LandCruiser300: { "ToyotaLandCruiser300Price": "Rs 106,000,000/-", }, Hiace: { "StandardRoofDieselPrice": "", }, x: { "ToyotaNewThingPrice": "Rs 5,000,000/-" } };</script>`
  const items = parseToyota(html)
  it('reads priced variants, lists "on hold" without a price, drops discontinued and empty ones', () => {
    expect(items.map((i) => [i.name, i.pricePkr])).toEqual([
      ['Corolla 1.6 MT', 6_099_000],
      ['Prius', null],
      ['Land Cruiser 300', 106_000_000],
      ['New Thing', 5_000_000],
    ])
    for (const it of items) expect(ApplianceImportItemSchema.safeParse(it).success).toBe(true)
  })
  it('names unknown keys readably', () => {
    expect(toyotaKeyName('ToyotaCorollaCrossGasolinePrice')).toBe('Corolla Cross Gasoline')
  })
})

describe('hyundai nishat price cards', () => {
  const html = `<div><a href="https://hyundai-nishat.com/tucson-hybrid/"><h3>Tucson Hybrid</h3></a><span>From</span><b>PKR 12,202,000 /-</b></div>
    <div><a href="https://hyundai-nishat.com/palisade-hybrid/"><h3>PALISADE HYBRID</h3></a><span>From</span><b>PKR 22,625,000 /-</b></div>
    <div><a href="https://hyundai-nishat.com/tucson-hybrid/"><h3>Tucson Hybrid</h3></a><span>From</span><b>PKR 12,202,000 /-</b></div>`
  it('reads each model once with its own page', () => {
    const items = parseHyundai(html)
    expect(items.map((i) => [i.name, i.pricePkr, i.officialUrl])).toEqual([
      ['Tucson Hybrid', 12_202_000, 'https://hyundai-nishat.com/tucson-hybrid/'],
      ['Palisade Hybrid', 22_625_000, 'https://hyundai-nishat.com/palisade-hybrid/'],
    ])
  })
})

describe('PBS weekly SPI', () => {
  it('finds the newest release on the home page', () => {
    const home = `<a href="https://www.pbs.gov.pk/weekly-sensitive-price-indicator-spi-for-the-week-ended-on-22-10-2026/">x</a><a href="https://www.pbs.gov.pk/weekly-sensitive-price-indicator-spi-for-the-week-ended-on-29-10-2026/">y</a>`
    expect(latestSpiRelease(home)).toContain('29-10-2026')
  })

  const sheet = `<worksheet><sheetData>
    <row r="1"><c r="D1" t="s"><v>0</v></c><c r="G1" t="s"><v>1</v></c></row>
    <row r="2"><c r="D2" t="s"><v>2</v></c></row>
    <row r="3"><c r="A3"><v>1</v></c><c r="B3" t="s"><v>3</v></c><c r="C3" t="s"><v>4</v></c><c r="D3"><v>3240</v></c><c r="E3"><v>3278.77</v></c><c r="F3"><v>3333.33</v></c><c r="G3"><v>2200</v></c><c r="H3"><v>2937.39</v></c><c r="I3"><v>3306.66</v></c></row>
    <row r="4"><c r="A4"><v>33</v></c><c r="B4" t="s"><v>5</v></c><c r="C4" t="s"><v>6</v></c><c r="D4"><v>500</v></c><c r="E4"><v>500</v></c><c r="F4"><v>500</v></c></row>
    <row r="5"><c r="D5" t="s"><v>7</v></c><c r="G5" t="s"><v>8</v></c></row>
    <row r="6"><c r="A6"><v>1</v></c><c r="B6" t="s"><v>3</v></c><c r="C6" t="s"><v>4</v></c><c r="D6"><v>2900</v></c><c r="E6"><v>3000</v></c><c r="F6"><v>3100</v></c><c r="G6"><v>0</v></c><c r="H6"><v>0</v></c><c r="I6"><v>0</v></c></row>
  </sheetData></worksheet>`
  const shared = `<sst>${['Islamabad (01)', 'Rawalpindi (02)', 'PRICES ON 29-10-2026', 'Wheat Flour Bag', '20 Kg', "Cigarettes Capstan 20'S Packet", 'Each', 'Karachi (12)', 'Quetta (16)'].map((t) => `<si><t>${t}</t></si>`).join('')}</sst>`
  const buf = zip({ 'xl/sharedStrings.xml': shared, 'xl/worksheets/sheet1.xml': sheet })

  it('reads an xlsx without a library', () => {
    expect([...unzipEntries(buf).keys()]).toEqual(['xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml'])
    expect(xlsxRows(buf)[2]).toMatchObject({ A: '1', B: 'Wheat Flour Bag', E: '3278.77' })
  })

  it('collects every city block for an item and skips cities with no price', () => {
    const release = parseSpiAnnex(xlsxRows(buf))
    expect(release.date).toBe('2026-10-29')
    const flour = release.items.find((i) => i.no === 1)!
    expect(flour.cities.map((c) => c.city)).toEqual(['Islamabad', 'Rawalpindi', 'Karachi'])
    expect(nationalAverage(flour.cities)).toBe(Math.round((3278.77 + 2937.39 + 3000) / 3))
  })

  it('turns known items into grocery prices and leaves out cigarettes', () => {
    const items = spiToItems(parseSpiAnnex(xlsxRows(buf)), 'https://www.pbs.gov.pk/weekly-sensitive-price-indicator-spi-for-the-week-ended-on-29-10-2026/')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ brand: 'pbs', slug: 'atta-20kg-price', category: 'atta-rice', trusted: true, unit: '20 kg bag' })
    expect(ApplianceImportItemSchema.safeParse(items[0]).success).toBe(true)
  })
})
