# Mobile prices and specs (zaviya.pk/mobile-prices)

Asked by Waleed on 4 Nov 2026: "Zaviya is not only a news site". A phone prices and specs segment that Google indexes
("<phone> price in Pakistan", "<a> vs <b>", "best phone under 30000"). Linear was at its free issue limit, so the plan and
next steps live here.

## Rules
- A price is only ever a PKR number read from an official Pakistan source (brand site/store, PTA notification). Each price
  keeps its source URL. No official price: the page says "Price not announced". Never copy text or data from qeemat.pk,
  whatmobile, priceoye or GSMArena. Summaries and FAQs are generated from our own stored facts.
- Migrations are additive and idempotent (`20261103_192624_mobile_prices`): new tables and enum types, two nullable columns.

## What is built
- Collections `phone-brands`, `phones` (variants with per-variant price + source, price history, PTA group, specs group), admin group "Mobile prices".
- Pages: `/mobile-prices`, `/mobile-prices/<brand>`, `/mobile-prices/under-{20000,30000,50000,70000,100000}` (noindex and out of the sitemap with fewer than 3 phones),
  `/mobile/<slug>`, `/compare/<a>-vs-<b>` (popular pairs only; reversed order 308-redirects; other pairs 404).
  JSON-LD Product/Offer (AggregateOffer for several prices), FAQPage, BreadcrumbList, ItemList. Sitemap entries in `lib/phones/sitemap.ts`. Links: header, mobile menu, footer (via `TOOLS`).
- Queries tolerate missing tables during `next build` (the migration runs when the new container boots); at runtime errors throw so ISR keeps the last good page.
  After a deploy the import (or any admin save) revalidates the mobile pages.
- Importer: `POST /api/pipeline/phones/import` (bot key), pure merge in `apps/web/src/lib/phones/importer.ts`: price changes go to history,
  jumps over 60% are refused, specs/image/colours only fill empty fields (admin edits survive), a missing price never wipes a known one.
  `GET /api/pipeline/phones/price-changes?days=7` lists recent changes (input for short price-cut news items).
- Worker (`apps/worker/src/phones/`): adapters per brand, `data` queue job `phone-prices` once a day (`PHONE_PRICES=0` turns it off).
  CLI from `apps/worker`: `tsx src/phones/cli.ts collect --out=phones.json` and `tsx src/phones/cli.ts import [--from=file] [--mode=seed]`
  (needs `PAYLOAD_URL`, `PAYLOAD_API_KEY`). Snapshot of 4 Nov 2026: `apps/web/src/seed/phones-2026-11-04.json` (66 phones).

## Sources today (what the official sites allow)
| Brand | Prices | Specs |
|---|---|---|
| Samsung | yes, from each product page (Product JSON-LD), per storage | description + spec text on the page |
| Vivo | yes, RAM+storage list on /pk/products | page title/description (battery, camera, refresh) |
| Realme | starting price in the site menu (no memory option) | page title/description |
| Oppo | none published | page title/description |
| Xiaomi/Redmi | none published; the adapter returned no list from the server side on 4 Nov (check robots/headers) | page description |
| Infinix, Tecno, Apple | no usable official PK page (infinix.pk in maintenance, tecno.pk a placeholder, apple.com/pk has no store) | not covered yet |

## Next steps
1. Cover Infinix, Tecno, Xiaomi/Redmi, Apple: find official PK sources (Infinix/Tecno PK stores, Mi store), or PTA tax tables for Apple (price stays "not announced").
2. Full specs (RAM, display, chipset, camera) from the manufacturers' spec pages; the current specs are the highlights in titles and descriptions.
3. More brands (Honor, itel, Nokia, Pixel, OnePlus, Motorola, ZTE) and PTA tax per model (`pta` group exists; needs an official notification parser).
4. Mirror product photos into R2 (`imageUrl` hotlinks the brands' CDN today).
5. Price alerts (email/WhatsApp/push), price-cut news items from `/api/pipeline/phones/price-changes`, "best phone under X" editorial guides, installment calculator.
6. Bikes prices, then cars prices: same collection and importer pattern.
7. Urdu pages when the Urdu edition is enabled (these pages are English-only and 404 on `/ur`).
