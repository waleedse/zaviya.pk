import { describe, expect, it } from 'vitest'
import { extractHighlights, parseMemory, parsePkr } from './highlights.js'
import { parseOppoLinks, parseRealmeNav, parseVivoList, stripBrand } from './brands.js'
import { colourFromStem, parseSamsungPdp, parseSitemapUrls } from './samsung.js'
import { collectCatalog, makeCtx } from './catalog.js'

describe('highlights', () => {
  it('reads only numbers that are written', () => {
    expect(extractHighlights('vivo Y32 - 8000mAh Battery, 50MP Camera | vivo Pakistan')).toEqual({ batteryMah: 8000, rearCamera: '50MP main' })
    expect(extractHighlights('a 6.7" Super AMOLED 90Hz display, 50MP OIS camera')).toMatchObject({ displaySize: '6.7 inches', displayType: 'Super AMOLED', refreshRateHz: 90 })
    expect(extractHighlights('Meet the phone. Style and power.')).toEqual({})
  })
  it('parses memory and PKR prices, rejecting implausible ones', () => {
    expect(parseMemory('6GB+256GB: Rs. 99,999')).toEqual({ ramGb: 6, storageGb: 256 })
    expect(parsePkr('6GB+256GB: Rs. 99,999')).toBe(99999)
    expect(parsePkr('₨. 458,999.00')).toBe(458999)
    expect(parsePkr('Rs.4')).toBeNull()
    expect(parsePkr('no price')).toBeNull()
  })
})

describe('brand pages', () => {
  it('parses the vivo list: variants with prices, accessories dropped', () => {
    const html = `<ul id="pageProduct"><li class="product-item"><a class="product-item-link" href="/pk/products/y32"
data-name="Y32" data-product-id="1" data-promotion-price="" data-price="6GB+128GB: Rs. 82,999<br/>6GB+256GB: Rs. 99,999" aria-label="Y32"><img src="https://x.test/a.png"></a></li>
<li class="product-item"><a class="product-item-link" href="/pk/products/tws" data-name="TWS 4" data-price="Rs. 9,999"></a></li></ul>`
    const items = parseVivoList(html)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ name: 'Y32', url: 'https://www.vivo.com/pk/products/y32' })
    expect(items[0]!.variants).toEqual([
      { ramGb: 6, storageGb: 128, pricePkr: 82999, priceSourceUrl: 'https://www.vivo.com/pk/products' },
      { ramGb: 6, storageGb: 256, pricePkr: 99999, priceSourceUrl: 'https://www.vivo.com/pk/products' },
    ])
  })
  it('parses the realme nav: price when shown, none when not announced, buds dropped', () => {
    const li = (slug: string, name: string, price: string) =>
      `<li><a href="https://www.realme.com/pk/${slug}" class="gtag" title="${name}"><img data-src="https://i.test/${slug}.png"><p class="nav-submenu-price">${price}</p></a></li>`
    const html = li('realme-note-60x', 'realme Note 60x', '<!--[-->Rs.20,999<!--]-->') + li('realme-note80', 'realme Note 80', '<!---->') + li('realme-buds-t110', 'realme Buds T110', 'Rs.4,999')
    const items = parseRealmeNav(html)
    expect(items.map((i) => [i.name, i.pricePkr])).toEqual([['realme Note 60x', 20999], ['realme Note 80', null]])
  })
  it('collects each oppo phone page once, whether linked as the page or its specs page', () => {
    expect(parseOppoLinks('/pk/smartphones/series-reno/reno16/ /pk/smartphones/series-a/a6s-pro/specs/ /pk/smartphones/series-reno/reno16/')).toEqual(['https://www.oppo.com/pk/smartphones/series-reno/reno16/', 'https://www.oppo.com/pk/smartphones/series-a/a6s-pro/'])
  })
  it('strips the brand from a phone name', () => {
    expect(stripBrand('realme Note 60x', 'realme')).toBe('Note 60x')
    expect(stripBrand('Y32', 'vivo')).toBe('Y32')
  })
})

describe('samsung', () => {
  const url = 'https://www.samsung.com/pk/smartphones/galaxy-a/galaxy-a17-5g-black-256gb-sm-a176bzkgpkd/'
  it('reads page urls from the sitemap, never the /buy/ pages', () => {
    const xml = `<urlset><url><loc>${url}</loc></url><url><loc>${url}buy/</loc></url><url><loc>https://www.samsung.com/pk/tablets/galaxy-tab/x-128gb-sm-x100/</loc></url></urlset>`
    expect(parseSitemapUrls(xml)).toEqual([{ url, storageGb: 256, model: 'sm-a176b', stem: 'galaxy-a17-5g-black' }])
    expect(colourFromStem('galaxy-a17-5g-light-blue', 'Galaxy A17 5G')).toBe('Light Blue')
  })
  it('reads name, official price and specs from a page', () => {
    const html = `<meta name="description" content="Discover the Samsung Galaxy A17 5G 256GB in Black, with a 6.7&quot; Super AMOLED 90Hz display, 50MP OIS camera"/>
<script>{"@type":"Product","brand":{"@id":"x"},"name":"Galaxy A17 5G","image":"https://i.test/a","offers":{"@type":"Offer","url":"u","priceCurrency":"PKR","price":"99999"}}</script>
<img data-desktop-alt="Galaxy A17 5G. Gemini. Camera: Ultra Wide Camera 5 MP, Wide Camera 50 MP with OIS, Macro Camera 2 MP, Front Camera 13 MP. Battery: 5,000 mAh. AP: Exynos 1330. Weight &amp; Size: Weight 192 g, Dimension (HxWxD) 164.4 x 77.9 x 7.5. Display: Main Display Dimension 6.7 inches.Galaxy A14 5G. Battery: 5,000 mAh. AP: Other.">`
    const pdp = parseSamsungPdp(html)!
    expect(pdp.name).toBe('Galaxy A17 5G')
    expect(pdp.pricePkr).toBe(99999)
    expect(pdp.specs).toMatchObject({ batteryMah: 5000, chipset: 'Exynos 1330', weightG: 192, dimensions: '164.4 x 77.9 x 7.5 mm', frontCamera: '13MP', refreshRateHz: 90 })
    expect(pdp.specs.rearCamera).toBe('50MP wide + 5MP ultra-wide + 2MP macro')
  })
  it('a page without a price gives no price', () => {
    const html = `<script>{"@type":"Product","name":"Galaxy A05","offers":{"@type":"Offer"}}</script>`
    expect(parseSamsungPdp(html)?.pricePkr).toBeNull()
  })
})

describe('collectCatalog', () => {
  it('keeps going when one brand site fails and drops invalid phones', async () => {
    const ctx = makeCtx({ fetchText: async () => null })
    const res = await collectCatalog(ctx, ['vivo', 'oppo'])
    expect(res.phones).toEqual([])
    expect(res.failed.map((f) => f.brand)).toEqual(['vivo', 'oppo'])
  })
})
