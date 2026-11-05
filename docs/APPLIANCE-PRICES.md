# Home appliance prices (zaviya.pk/prices)

Asked by Waleed on 5 Nov 2026: appliances with hard-to-find prices, a button to buy, similar products to compare, and pages
for new and upcoming phones.

## Rules
- A price is only a PKR number shown on the brand's own Pakistan store. Every product links to that page ("Buy from <brand>
  official store", `rel="noopener nofollow"`, no affiliate). We never copy prices from shops, Daraz, priceoye or other sites.
- Pages without a price are `noindex` and out of the sitemap (5 Nov quality-over-volume rule, same as phones).
- Migration `20261105_064505_appliance_prices` is additive (new tables, two enums, one nullable column).

## What is built
- Collection `appliances` (brand, category, model, price, "was" price, stock, image, store URL, specs, price history), admin group "Prices".
- Pages: `/prices` (hub), `/prices/<category>` (price table + grid, brand chips), `/prices/<category>/<brand>`,
  `/prices/<category>/<product-slug>` (price, Buy button, specs, price history, similar products within 30% with
  "compare" links), `/prices/compare/<a>-vs-<b>` (same category only; reversed order 308-redirects).
  JSON-LD Product/Offer (seller: brand official store), ItemList, FAQPage, BreadcrumbList. Sitemap in `lib/appliances/sitemap.ts`.
- Importer `POST /api/pipeline/appliances/import` (bot key), pure merge in `apps/web/src/lib/appliances/importer.ts`:
  changes go to history, jumps over 60% refused, "was" prices above 3x ignored, admin edits to name/specs survive.
- Worker `apps/worker/src/appliances/collect.ts`, `data` queue job `appliance-prices` once a day (`APPLIANCE_PRICES=0` turns it off).
  CLI from `apps/worker`: `tsx src/appliances/cli.ts collect --out=x.json` and `tsx src/appliances/cli.ts import`.
- Phones: the phone page now has the same Buy button (brand's own page); new lists `/mobile-prices/new-phones` and
  `/mobile-prices/upcoming` (noindex under 3 phones). An upcoming phone turns "on sale" when an official price arrives.

## Sources (5 Nov 2026)
| Brand | How | Items |
|---|---|---|
| Samsung | `/pk/da-sitemap.xml` + Product JSON-LD price on each page | ACs, fridges, washing machines, dishwashers (~30) |
| Nasgas | Shopify `/products.json` | geysers, coolers, ranges, hoods, washing machines (~140) |
| Anex | Shopify `/products.json` | kitchen appliances, irons, cookers (~235) |
| West Point | Shopify `/products.json` (rate-limits: one read a day) | kitchen appliances, heaters, microwaves (~210) |
| Dawlance | answers 403 to our bot: not read | - |
| Haier, PEL, Gree, Orient, Changhong Ruba, Kenwood, TCL | no price on the site, or no machine-readable store found yet | - |

## Next steps
1. Orient (prices on the site; find its product listing), PEL/Gree/Haier when they publish prices.
2. Upcoming phones: the research agent adds them from official teasers (see `.claude/agents/research.md`).
3. Price-cut items for social posts from the price history; "best AC under Rs X" lists once there are enough priced ACs.
