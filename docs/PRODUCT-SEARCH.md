# Zaviya product search and price comparison (zaviya.pk/search)

Started 21 Nov 2026 at Waleed's request: anything a person in Pakistan wants to buy (a spoon, glasses, a phone, a shirt, atta)
is searchable on zaviya.pk, instantly, from our own server, with the product, every store that sells it, each store's price and
offer, the best price, and (if the visitor allows location) the nearest store branch. Goal: millions of listings, synced daily.

This extends the price engine ([PRICE-ENGINE.md](PRICE-ENGINE.md)) and does not replace it. Progress log at the bottom.

## 1. What already exists (checked 21 Nov)

| Piece | State |
|---|---|
| `store_offers` table (Payload `StoreOffers`) | 3 Shopify stores (Telemart, Mi Store, Friends Home), ~13.7k listings, price + previous price + `seen_at` |
| Worker rolling crawl `apps/worker/src/appliances/retail.ts` | one 250-listing page per 5 min, cursor in Redis, robots.txt + `ZaviyaBot` UA via `politeFetchText` |
| Import `POST /api/pipeline/offers/import` | upsert by `store + handle`, links to our phone/appliance page |
| Search `GET /api/prices/search` | Postgres `ILIKE` over `store_offers` (works for 14k rows, not for millions; no typos, no Urdu) |
| `/prices/shop/<group>`, `/mobile/<slug>`, `/prices/item/<slug>` | category and product pages with "where to buy" |
| Official price engine (~1,043 appliances, 69 phones, PBS) | stays the "official price" layer, shown next to store prices |
| Watchdog (`apps/agents/src/watchdog.ts`) | per-minute checks, opens an incident issue, emails |

What is missing: a real search engine (typos, Urdu/Roman Urdu, facets, speed), many more stores and non-Shopify feeds, product
dedupe across stores, price history per listing, branches/location, store registry with crawl status, an admin view.

## 2. Architecture

```
Store sites (public pages only)                     zaviya2 (Contabo, docker, zero downtime)
  Shopify /products.json  ─┐
  WooCommerce Store API   ─┤  worker (queue "search-crawl")  ──POST──▶  web  /api/pipeline/search/*   ──▶  Postgres
  sitemap + JSON-LD       ─┘   per-host rate limit, robots.txt          (store_offers, search_stores,       (truth)
                                                                         offer_price_history, crawl_runs)
                                                                              │ batches of 1,000 changed rows
                                                                              ▼
 visitor ──▶ /search page ──▶ /api/search (Next route, 50 ms budget) ──▶ Meilisearch (own container, own volume)
```

- **Meilisearch** `getmeili/meilisearch` pinned version, service `meilisearch` in `docker-compose.server.yml`, volume `meilidata`,
  `MEILI_ENV=production`, `MEILI_MASTER_KEY` in `/var/www/aurm-test/env/compose.env` and `web.env` (generated on the server, never
  printed, never in git). Not published on the host: web and worker reach it at `http://meilisearch:7700` on the `zaviya_default`
  network. The browser never talks to Meilisearch; it calls our `/api/search`, which holds the key, caps limits and logs misses.
- **Postgres is the truth, Meilisearch is a rebuildable cache.** If the index is lost, `POST /api/pipeline/search/reindex` rebuilds it
  from Postgres in batches. Meilisearch downtime degrades `/search` to the old `ILIKE` search; no other page depends on it.
- **Tables** (one migration, additive):
  - `search_stores`: slug, name, base_url, platform (`shopify|woo|jsonld|sitemap`), categories[], city/branches (jsonb), active,
    robots_ok, crawl_delay_ms, last_crawl_at, last_status, last_error, listing_count, failures_in_row. Admin-editable (Payload collection).
  - `store_offers` (existing) gets: `product_key`, `gtin`, `sku`, `description`, `category_path`, `first_seen_at`.
  - `offer_price_history`: offer_slug, price_pkr, list_price_pkr, in_stock, at. Written only when price or stock changes.
  - `search_crawl_runs`: store, started_at, finished_at, pages, listings, new, changed, errors, status. Feeds the admin view and watchdog.
  - `search_sync_state`: single row, `last_synced_at`, `last_full_reindex_at`, counts.
- **Queue**: worker BullMQ queue `search-crawl`, one job = one store page (Shopify page, Woo page, a batch of sitemap URLs). A planner job
  runs daily and enqueues every active store; a hot-refresh job enqueues the first pages of the stores whose products are most viewed or
  searched. Per-host concurrency 1, minimum 1.5 s between requests (store `crawl_delay_ms` and robots `Crawl-delay` win if larger).
  After 5 failures in a row a store is paused and shows in the admin view.

## 3. Index design (Meilisearch index `products`)

One document is one **product** (the same item sold by several stores), not one listing.

```
id, title, brand, model, gtin, group (our category slug), category_path[], tags[]
image (first store image) + image_store,   description_short (200 chars)
offers: [{ store, store_name, price, list_price, in_stock, url, image, branches:[{city, lat, lng}], updated_at }]   (max 30 per product)
min_price, max_price, store_count, stores[] (flat, for filtering), cities[] (flat), in_stock_any,
price_drop_pct (last 7 days), popularity (views + searches 7d), updated_at
```

- **searchableAttributes** (ranking order): `title`, `brand`, `model`, `aliases`, `category_path`, `tags`, `stores`.
- **filterableAttributes**: `group`, `brand`, `stores`, `cities`, `min_price`, `in_stock_any`, `store_count`, `price_drop_pct`.
- **sortableAttributes**: `min_price`, `popularity`, `updated_at`, `price_drop_pct`.
- **rankingRules**: words, typo, proximity, attribute, exactness, `popularity:desc`, `store_count:desc`.
- **Typo tolerance**: on; `minWordSizeForTypos` 4 and 8; digits are not typo-tolerant (model numbers: "a54" must not match "a55").
- **Synonyms** (file `packages/shared/src/search-synonyms.ts`, pushed with the settings): English / Roman Urdu / Urdu script, both ways:
  `mobile, phone, smartphone, موبائل, fon`; `chasma, glasses, spectacles, eyeglasses, عینک, aink`; `chamach, spoon, چمچ`; `joota, shoes, جوتا`;
  `kapray, clothes, کپڑے`; `laptop, notebook, لیپ ٹاپ`; `ata, atta, flour, آٹا`; `cheeni, sugar, چینی`; `ghee, گھی`; `chawal, rice, چاول`;
  `ac, air conditioner`; `fridge, refrigerator, فریج`; `tv, led, television`; `gb, ram` kept as stop-words for scoring only. The research agent
  extends this list from the demand list (`price-demand`) and from searches with no result (logged, see below).
- **Dedupe**: `product_key` = `gtin` when the store gives one (JSON-LD `gtin13`, Shopify barcode); else `brand + model + variant`
  normalised (lowercase, letters and digits only, storage "8+256" and colour stripped as variants); else the listing is its own product.
  Same-key listings from different stores merge into one document; a listing that matches one of our phone/appliance pages joins that product
  (`match_kind`, `match_slug`) and gets the official spec/price block.
- **Search-miss log**: a search with zero hits is written to `price-demand` (origin `site-search`), so the research agent adds stores/synonyms for it.

## 4. Sync loop

1. **Daily full crawl** (03:00 PKT, quiet traffic): the planner enqueues every active store; each store's pages are read once. Listings not seen
   for 3 crawls are marked unavailable and dropped from the index (never deleted from Postgres; history is kept).
2. **Hot refresh** (hourly): products with the highest `popularity` and recent price drops get their first pages re-read.
3. **Import** per page: upsert `store_offers`, write `offer_price_history` on change (store-glitch guard: a jump above 60% is held for one more
   crawl, same rule as the appliance importer), compute `product_key`.
4. **Sync to Meilisearch** every 2 minutes: rows with `updated_at > last_synced_at`, grouped by `product_key`, sent in batches of 1,000 via
   `addDocuments`; waits on the task only in the reindex path. Full reindex weekly Sunday 04:00 as a safety net (also run once after deploy).
5. **Watch**: counts are compared after each sync (see 6).

## 5. Pages

- `/search?q=`: instant search-as-you-type (debounced 80 ms, results from `/api/search`), filters (category, brand, store, price range, in stock,
  city), sort (best match, cheapest, biggest drop). Server time shown in the response header `server-timing`. Target under 50 ms server time.
- `/product/<slug>`: title, images (store images with store credit), specs (official block if matched), every store with price, offer
  (list price crossed out, discount %), stock, "Buy at <store>" link, **best price** badge, 30-day price chart from `offer_price_history`.
  Indexable only when 2+ stores or an official match exists; Product/AggregateOffer JSON-LD with `lowPrice`/`highPrice`/`offerCount`.
- **Location**: a button "Show nearest store" asks `navigator.geolocation` only on click. The coordinates stay in the browser (nothing is sent or
  stored unless the visitor ticks "remember"; then it is kept in `localStorage`, not on our server). Distance to known branches is computed
  in the browser; stores without branch data are shown by city when the visitor picks one. Branch data comes from the store's own "store locator" page or
  JSON-LD `LocalBusiness`, entered in `search_stores.branches`.

## 6. Admin panel and watchdog

Payload admin custom view `/admin/search-status` (admin only) and the collection `search-stores`:
Meilisearch health + index size (`/health`, `/stats`), documents indexed, products synced in the last 24 h, queue depth (`search-crawl` waiting/active/failed),
per store: last crawl, status, listing count, new/changed in the last run, last error, failures in a row, price changes 24 h; list of failed crawls.
Data comes from `GET /api/pipeline/search/status` (also used by the watchdog).

Watchdog (`apps/agents/src/watchdog.ts`, new problems, same incident path):
- `search-down`: Meilisearch `/health` not `available` for 5 checks.
- `search-sync-stalled`: no successful sync for 30 min while changed rows exist, or `last crawl` older than 36 h with active stores.
- `search-count-drop`: indexed documents fell more than 20% against the previous day's count.
- `search-disk`: Meilisearch volume above 8 GB or root disk above the existing 85% alert.

## 7. Data source rules (non-negotiable)

- Public store pages only; robots.txt obeyed; user agent `ZaviyaBot/1.0` (Zaviya bot with contact page); no login, no bot-detection bypass, no UA spoofing.
- Structured data first: Shopify `/products.json`, WooCommerce `/wp-json/wc/store/v1/products`, JSON-LD `Product`/`Offer`, sitemaps. HTML scraping only
  as a last resort per store with a tested parser.
- Never a source: PriceOye, Qeemat, WhatMobile, PriceMeter or any other price-comparison site. Marketplaces (Daraz and similar) only through an official API or feed.
- Images only from the store's own listing, shown with a link to the store. Never copied from competitors; never re-hosted.
- Phone specifications only from the official manufacturer page (display, chipset, RAM/storage variants, camera, battery, charging, OS, bands, dimensions,
  launch date); Pakistan price only from an official source or the store's own listing. The phones module (`apps/worker/src/phones`) already reads official pages and
  is extended field by field.
- Honest limits: a store that blocks our bot is left out until it allows it.

## 8. Budgets on zaviya2 (checked 21 Nov: 8 GB RAM, 4 vCPU, 96 GB disk)

| | Now | Meilisearch added |
|---|---|---|
| RAM | 4.5 GB used, 3.4 GB available (web 1.9, worker 1.5, postgres 0.3) | `mem_limit: 1.5g`, `MEILI_MAX_INDEXING_MEMORY=768Mb`, `MEILI_MAX_INDEXING_THREADS=2`. Fine up to ~300k products. |
| Disk | 56 GB used, 41 GB free; Docker build cache swings 3-20 GB per deploy | Slim documents: ~3 KB each → 300k products ≈ 1-2 GB, 1M ≈ 4-6 GB (index is several times the raw JSON). Budget 8 GB, watchdog alert at 8 GB. |
| Postgres | 1.4 GB | `store_offers` ~0.5 KB per row + history; 1M listings ≈ 1 GB, history ≈ 1 GB per 10M changes. Daily history rows only on change. |
| CPU | 4 vCPU shared | Indexing limited to 2 threads, crawl concurrency 1 per host and 4 hosts in parallel, big imports run at night. |

At about 300k products the VPS needs 16 GB RAM (Contabo upgrade, a button, no migration) or Meilisearch moves to its own small VPS (it is already a separate container with
its own volume and URL variable `MEILI_URL`). That is the decision point for "millions".

## 9. Road to millions (realistic)

Pakistani online stores that expose public structured data: roughly 300-1,000 Shopify/Woo shops (most with 200-5,000 products), plus grocery chains with 10-50k products each.

| Stage | Stores | Listings | How |
|---|---|---|---|
| Slice (21 Nov) | 15-20 Shopify/Woo | ~40k | Meilisearch + `/search` + product page live |
| Electronics + fashion | 60 | ~150k | store registry, Woo, JSON-LD; category by category |
| Grocery, home, eyewear, books, pharmacy | 150 | ~400k | grocery chains, sitemaps + JSON-LD |
| Long tail | 400+ | 1M+ | store discovery from sitemaps/directories, per-store parsers; RAM upgrade |

Store discovery: the research agent lists candidate stores per category (official sites only), a probe job checks `/products.json`, the Woo endpoint and sitemap JSON-LD, and adds a
`search_stores` row when robots.txt allows. Stores are never added from comparison sites.

## 11. Discovery layer (added 21 Nov, Waleed: "which product, which store, which category to search, and a 6-hour check")

Search has two separate jobs. **Pricing** (section 4) keeps known offers fresh. **Discovery** finds what we do not know yet: new stores, new categories, new products, new directions.

```
Discovery loop (every 6 hours, plus a daily deep pass)
  1. STORES   candidates from: store domains found in the demand list and in outgoing links of stores we already read,
              the research agent's per-category lists, and our own search misses. A probe job checks robots.txt, /products.json,
              the WooCommerce Store API, sitemap + JSON-LD. Pass -> row in search_stores (status "new", then "active" after a clean first crawl).
  2. PRODUCTS every crawl marks listings first seen in this run (first_seen_at). New products are counted per store and category.
  3. CATEGORIES our own tree (search_categories, 3 levels: Electronics > Mobiles > Smartphones; Fashion > Men > Shirts; Home > Kitchen > Cutlery > Spoons).
              Step A rules: store product_type / collection / breadcrumb / JSON-LD category and title keywords map to a node (cheap, covers ~80%).
              Step B label cache: classification is per distinct store category label ("Men > Shirts" at store X), never per product. One label covers thousands of
                       products, so millions of products need only thousands of decisions, each made once and stored in search_label_map.
              Step C AI is the last resort and capped at 1% of new listings per day (a counter in Redis; over the cap the item waits as "uncategorised", visible
                       in the admin view). Only labels and titles the rules cannot place go to the LLM chain (Gemini free tier), 40 per batch, answer cached.
              Step D a category the AI proposes that is not in the tree becomes a "proposed category" (counted, shown in the admin view); at 5+ products it is
              added automatically as a leaf under the closest parent, and Claude reviews the proposals in the daily pass.
  4. DIRECTIONS what visitors search for and we cannot answer (search misses, price-demand) and categories where stores are thin
              become the next crawl targets and the research agent's next store hunt.
  5. REPORT   every 6 hours a row in search_discovery_log and one line to the admin view and the daily email:
              new stores, new categories (and proposed), new products (total and per top category), new directions (top 10 missed searches),
              failed probes, products without a category.
```

Product page: opens from search with the product, then **every store's offer** (all stores that sell the same `product_key`), cheapest first, each with its own price,
discount, stock and a link; the offers refresh with each crawl (hot products every hour, others daily), and the page shows "updated X minutes ago" per store.
A store that stops listing the product disappears from the page after 3 days.

Tables added for this: `search_stores` (registry), `search_categories` (tree + synonyms), `search_title_cache` (AI answers), `search_discovery_log` (6-hour counts).
Index: `category_path` becomes a filterable, facetable attribute so the search page can show the category tree with counts.

## 10. Progress log

- 21 Nov: plan written. Findings: live DB is `zaviya_live2`; 13.7k offers from 3 stores already crawled; web and worker share the `zaviya_default` network, so the Meilisearch container is reachable by name.
- 21 Nov: slice 1 merged (PR #279, tag v2026.11.21-1): Meilisearch, sync, /api/search, /products, /product/<id>. Discovery layer designed (section 11).
