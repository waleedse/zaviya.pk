# Price engine (zaviya.pk/prices)

Started 6 Nov 2026 at Waleed's request: find out which prices Pakistan searches for, where each one can be read from an official source, refresh them automatically, publish SEO pages with comparisons, and get them indexed.

## The rule

A price on Zaviya is a number read from an **official source**, and the page links to it:

| Kind | Example | Button on the page |
|---|---|---|
| `store`: the brand sells online | Samsung, Anex, West Point, Nasgas, GFC, Atlas Honda | "Buy from <brand> official store" |
| `maker`: an official price list; you buy from dealers | Toyota Indus, Hyundai Nishat | "Official price list on <brand> Pakistan" |
| `source`: a government statistics release | Pakistan Bureau of Statistics weekly SPI | "Source: PBS weekly price release" |

The engine never reads:
- shops, marketplaces or price-comparison sites: Daraz, PriceOye, WhatMobile, PakWheels, Qeemat, Mega;
- sites that block our bot (`ZaviyaBot/1.0`, 403). We do not spoof another user agent.

Brands that publish no machine-readable price are left out until they do.

## How it runs

```
worker job "appliance-prices" (daily, BullMQ data queue; APPLIANCE_PRICES=0 turns it off)
  apps/worker/src/appliances/collect.ts    Shopify stores, Samsung sitemap
  apps/worker/src/appliances/sources.ts    WooCommerce stores, Toyota, Hyundai, PBS SPI (xlsx)
    -> POST /api/pipeline/appliances/import   (batches of 50; validated by @zaviya/shared)
         merge: price history on every change, store-glitch guard (>60% jump) except official statistics
         IndexNow ping for new and re-priced pages (Bing, Yandex and others)
    -> POST /api/pipeline/prices/hot
         hotScore = 10 x unique visitors (7 days) + priority of the strongest matching search
research agent, monthly
    -> POST /api/pipeline/prices/demand      what Pakistan searches ("honda cd 70 price", priority 1-100)
    -> GET  /api/pipeline/prices/coverage    searches we do not answer yet; open a Linear issue for new sources
seo agent, daily
    -> Search Console "Request indexing" for up to 5 /prices URLs a day (hubs first, then trending items)
```

- **Refresh frequency:** every source is read once a day. PBS publishes once a week, so its items change weekly. Re-reading an unchanged source changes nothing.
- **Adding a store:**
  - A Shopify or WooCommerce brand store is one line: `SHOPIFY_STORES` in collect.ts, or `WOO_STORES` in sources.ts.
  - Any other source needs a small parser in sources.ts with a test.
  - Add the brand to `APPLIANCE_BRANDS` in `packages/shared/src/appliances.ts`. Brand and category are stored as text, so this needs no database migration.

## Pages and SEO

- **Page types:**
  - `/prices` is the hub. It has Daily rates, Trending prices, Groceries, Bikes & cars, Mobile phones, Home appliances, and price changes this week.
  - `/prices/<category>`: a price list, cheapest first, with FAQs. Grocery items also show the price in 17 cities.
  - `/prices/<category>/<item>`: price, source, specs, price history, similar items and compare links. Grocery items show a city table (lowest, average and highest).
  - `/prices/<category>/<brand>`: brand lists. There are none for PBS.
  - `/prices/compare/<a>-vs-<b>`: pairs of the most searched items within a category.
- **Titles** carry the main search phrase and the month: "Honda CD 70 Price in Pakistan November 2026", "Atta (Wheat Flour) 20 kg Bag Price Today in Pakistan (November 2026): Lahore, Karachi, Islamabad". Category keywords are listed in `APPLIANCE_CATEGORIES[].keywords`.
- **Indexing rules:**
  - Only priced items are indexed and listed in the sitemap.
  - A list page needs at least 3 priced items.
  - PBS items have no Product/Offer markup, because an average is not an offer.
- **Getting indexed:**
  - IndexNow covers Bing and others automatically.
  - Google reads `sitemap.xml`, and the SEO agent requests the important URLs by hand.
  - The Google Indexing API is only for job and livestream pages, so it cannot be used here.

## Research, 6 Nov 2026: what Pakistan searches and where the price can come from

| Demand (price searches) | Official source found | Status |
|---|---|---|
| Atta, sugar, ghee, cooking oil, milk, eggs, chicken, mutton, beef, daal, rice, tomatoes, onions, potatoes, LPG cylinder, firewood | PBS Weekly Sensitive Price Indicator: 51 items, 50 markets, 17 cities, XLSX every Friday (pbs.gov.pk) | **Live**: 33 items, 8 categories |
| Honda bikes (CD 70, CG 125, CG 150, CB 150F, Pridor, ICON e) | atlashonda.com.pk WooCommerce Store API | **Live**: 10 models |
| Toyota cars (Corolla, Yaris, Corolla Cross, Fortuner, Revo, Hilux, Prado, LC300, Camry) | toyota-indus.com price list in the home page | **Live**: 40 variants |
| Hyundai cars (Elantra, Sonata, Tucson, Santa Fe, Palisade, IONIQ, Porter) | hyundai-nishat.com price cards | **Live**: 10 models |
| Fans (ceiling, AC/DC, inverter, pedestal), geysers, coolers, heaters | gfcfans.com Shopify feed | **Live**: about 240 items |
| AC, fridge, washing machine, geyser, kitchen appliances | Samsung, Nasgas, Anex, West Point (since 5 Nov) | Live |
| Mobile phones | Samsung, Vivo, Oppo, Realme official sites (/mobile-prices) | Live, separate module |
| Honda cars (City, Civic, HR-V) | honda.com.pk answers 403 to our bot | Blocked; not read |
| Dawlance appliances | dawlance.com.pk answers 403 | Blocked; not read |
| Orient, Haier, PEL, Gree, Changan | no prices on their sites, or robots.txt disallows us (Orient) | Not possible yet |
| Suzuki cars and bikes (Alto, Cultus, Swift, GD 110), Yamaha (YBR 125), Kia, MG, Haval | official site not reachable or no price page found yet | Next: research agent to confirm the official price pages |
| Solar panels, inverters, batteries | brands (Inverex, Crown, Fronus, Knox, Homage) have no public product feed | Next: check product pages for schema.org prices |
| Cement and steel (sarya) | no official company price lists online; PBS publishes no city prices for them | No official source |
| Medicines | DRAP notifications (PDF) | Later: parser for DRAP price notifications |
| Electricity and gas tariffs | NEPRA and OGRA notifications | Later: tariff pages and bill calculator |

## Next steps (in order)

1. The research agent sends the first monthly demand list and confirms official price pages for Suzuki, Yamaha and Kia, the next biggest vehicle searches.
2. Solar: check the brands' own product pages for schema.org prices. If they have them, add a generic "sitemap plus schema.org Product" adapter, which also covers many other brand sites.
3. City pages for groceries ("atta price in Lahore today"), once the item pages are indexed and show impressions.
4. DRAP medicine prices, and NEPRA/OGRA tariffs.

## Search, charts and history (12 Nov 2026)

- **Price search**: the box on `/prices`, the home page and the header search dialog (`components/appliances/PriceSearch.tsx`). It calls `GET /api/prices/search?q=` (not a page, `/api/` is disallowed in robots, nothing is linked, so no thin pages). Matching is in `lib/appliances/search.ts`: English, Roman Urdu (anda, cheeni, atta, gari, murghi) and Urdu script, item aliases, typo tolerance, closest categories when nothing matches. A search with no match is logged by `POST /api/prices/search` into `price-demand` (origin `site-search`, priority 30, +2 per repeat); the research agent and coverage endpoint pick it up.
- **History**: stored rows are price changes (plus one row per PBS weekly release). Between rows the price carries forward and the last point is the last check (`priceUpdatedAt`), so every chart grows daily without a row per item per day (`lib/appliances/series.ts`). Less than a week of history and no change: "Tracking since <date>" instead of a chart.
- **PBS backfill**: `runPbsBackfill` (worker, runs after the daily `appliance-prices`) reads the weekly SPI releases pbs.gov.pk still lists in its post sitemap (16 weeks, 30 Oct 2025 to 5 Nov 2026; PBS keeps no others online), asks `GET /api/pipeline/appliances/history-days` which weeks are already stored, and posts the rest to `POST /api/pipeline/appliances/history` (`source_url` = the release page). Idempotent; never changes the current price. Manual run: `tsx src/appliances/cli.ts backfill`.
- **Charts**: Recharts (`components/appliances/PriceCharts.tsx`): step line with min/max, range buttons, per-city bars. Hub: today's movers (`lib/appliances/movers.ts`), grocery basket by city, popular items, categories.
