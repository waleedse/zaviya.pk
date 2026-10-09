# Zaviya: UI/UX Specification

## 1. Brand

- **Name:** Zaviya / زاویہ. **Tagline:** "Every story, the right angle" / "ہر خبر، صحیح زاویے سے".
- **Personality:** calm authority. Think of a modern international newsroom (The Verge for clarity, FT for seriousness, Rest of World for warmth). It is never tabloid: no red-on-yellow, no blinking, no autoplay.
- **Logo:** a lowercase wordmark `zaviya`. The **Z** has its diagonal replaced by a sharp 30° "angle" stroke in the accent colour, and that angle mark doubles as the favicon/app icon. The Urdu lockup is `زاویہ` in Gulzar with the same angle mark.

## 2. Design tokens

### 2.1 Colour (CSS variables, light / dark)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAF7` (paper) | `#0B0F17` (ink) | page background |
| `--surface` | `#FFFFFF` | `#121826` | cards |
| `--surface-2` | `#F2F1EC` | `#1A2133` | rails, hover |
| `--fg` | `#0B0F17` | `#ECEDEE` | primary text |
| `--fg-muted` | `#5B6170` | `#9AA3B2` | meta, dek |
| `--border` | `#E4E2DA` | `#232B3D` | hairlines |
| `--accent` | `#0E7C5A` (Zaviya emerald) | `#2BB38A` | brand, links, focus |
| `--accent-fg` | `#FFFFFF` | `#04130D` | text on accent |
| `--breaking` | `#D7263D` | `#FF4D5E` | breaking/live only |
| `--gold` | `#B8902B` | `#E0B94F` | data widgets (gold rate) |
| `--up` / `--down` | `#12805C` / `#C0392B` | `#3DD68C` / `#FF6B5E` | rate changes |

**Category colours** (used for a thin 3px top border and the kicker text only):

| Category | Colour |
|---|---|
| pakistan | `#0E7C5A` |
| world | `#2B59C3` |
| business | `#B8902B` |
| tech-telecom | `#7B4DFF` |
| autos | `#E4572E` |
| cricket | `#1B998B` |
| education-jobs | `#C2185B` |
| trending | `#FF7A00` |

### 2.2 Typography

| Role | English | Urdu |
|---|---|---|
| Display / headlines | **Newsreader** (serif, opsz), 600-700 | **Gulzar** (Nastaliq) |
| UI / body | **Inter** (variable) | **Noto Nastaliq Urdu** 400/600 |
| Numbers / data | Inter, `tabular-nums` | Inter (Western digits for rates) |

**Type scale (fluid, using `clamp`):**

| Name | Size / line-height |
|---|---|
| display | 44→64 / 1.05 |
| h1 | 32→48 / 1.1 |
| h2 | 24→32 |
| h3 | 19→22 |
| body | 17→19 / 1.65 |
| small | 14 |
| kicker | 12, uppercase, tracking 0.08em |

**Urdu adjustments:**
- Every size is 1.15x.
- line-height is 2.0 for body and 1.6 for headlines, because Nastaliq needs vertical room.
- No letter-spacing and no uppercase.

Fonts are self-hosted with `next/font`, subset, using `display: swap`. The Urdu font loads only on `/ur` routes.

### 2.3 Spacing, radius, elevation
- **Spacing:** 4px base scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Radius:**
  - cards `14px`
  - images `10px`
  - pills `999px`
  - inputs `10px`
- **Shadows:** almost none. Cards use a 1px border plus `0 1px 2px rgb(0 0 0 / .04)`. On hover a card lifts 2px and the border turns accent at 40%.
- **Grid:** 12 columns, max width 1280px, gutter 24px desktop / 16px mobile.

### 2.4 Motion
- 150-200ms ease-out for hovers.
- 250ms for drawers.
- `prefers-reduced-motion` turns all of it off.
- The ticker scrolls only when the user isn't hovering over it.
- No parallax and no scroll-jacking.

## 3. Global layout

```
┌──────────────────────────────────────────────────────────────┐
│ Top bar (32px): date (PKT) · Gold 24k ▲ · USD ▼ · Petrol · EN|اردو · ☾ │
├──────────────────────────────────────────────────────────────┤
│ Header (64px, sticky, blur bg): [zaviya logo] Pakistan World Business  │
│ Tech Autos Cricket Jobs Trending        [search] [bell]               │
├──────────────────────────────────────────────────────────────┤
│ Breaking ticker (40px, only when breaking exists): ● LIVE  headline →  │
├──────────────────────────────────────────────────────────────┤
│                         page content                          │
├──────────────────────────────────────────────────────────────┤
│ Footer: logo+tagline · categories · company pages · socials ·        │
│ WhatsApp channel CTA · "AI-assisted, human-reviewed" note · ©        │
└──────────────────────────────────────────────────────────────┘
```

**Mobile:**
- The header is 56px: logo, search icon, and a menu icon that opens a full-screen sheet.
- Below the header is a horizontally scrolling category bar with sticky pills.
- The top bar becomes a single swipeable "rates" strip.
- A **bottom navigation bar** (Home, Live, Rates, Search, Saved) appears only on mobile, ≤ 768px.

## 4. Pages

### 4.1 Home (`/`, `/ur`)
1. **Hero bento** (desktop is 12 columns):
   - Lead story (8 columns): 16:9 image, kicker, display headline, dek, meta.
   - Right stack (4 columns): 3 secondary stories with small thumbnails.
2. **Live now strip:** live stories, each with a pulsing red dot and "Updated 3 min ago".
3. **Latest:** a vertical timeline list (time · category kicker · headline). It loads more on button press, not infinite scroll.
4. **Rates panel:** 4 cards (Gold 24k per tola, USD interbank, USD open market, Petrol), each with the value, its change, and a 7-day sparkline. Links go to the data pages.
5. **Category rails** (Pakistan, Business, Tech, Cricket...): a header with "See all →". Each rail has 1 large and 3 small cards on desktop, and is a horizontal snap-scroll on mobile.
6. **Explainers / "What it means for you":** a featured row with an accent background tint.
7. **Most read** (numbered 1-10, large numerals) next to **Web Stories** (vertical 9:16 tiles).
8. **WhatsApp channel / push notification CTA** card.

Ad slots: after section 2 (responsive leaderboard), inside rails (in-feed native), and in the sidebar on desktop (300x600, sticky). Each slot reserves its height in advance and is labelled "Advertisement".

### 4.2 Article (`/[category]/[slug]`)

```
Breadcrumb: Home › Business
KICKER (category colour)        [LIVE badge if isLive]
H1 headline (Newsreader 48)
Dek (20, muted)
Meta row: author avatar · name · Published 10 Oct 2026, 2:30 PM PKT · Updated · 4 min read
Share row: WhatsApp (primary) · Facebook · X · Copy link · Save
Hero image 16:9 + caption + credit (+ "AI-generated illustration" chip if applicable)
┌ Key points (accent left border, 3-5 bullets) ┐
Body (max 68ch, drop cap off, pull quotes, embeds)
┌ What it means for you (tinted card, icon) ┐
Live updates timeline (if isLive): time stamp · update text, newest first
FAQs (accordion, FAQPage schema)
Sources (list with outlet name + link + tier dot)
Corrections (if any)
Tags (pills)
Author box
Related (4 cards) · More from category
```

- **Desktop sidebar** (4 columns, sticky): "Most read", a rates mini-widget, and an ad slot (300x250 / 300x600).
- **Reading progress bar:** 2px in accent colour under the header.
- **In-article ads:** after paragraph 3 and paragraph 8, never between the key points and the first paragraph.
- **Language switch:** "اردو میں پڑھیں" button linking to the Urdu version (hreflang pair), and the same in reverse.

### 4.3 Category (`/[category]`)
- A header with the category name, a short description, and a thin bar in the category colour.
- A featured story at the top, then a 3-column card grid (1 column on mobile) with pagination (`?page=2`) so every page is crawlable.
- Subtopic filter pills (tags) and a sidebar with most read in the category.

### 4.4 Data pages (`/gold-rate-today-pakistan`, etc.)
1. H1: "Gold Rate Today in Pakistan, 10 October 2026". The date is added automatically.
2. **Big number card:**
   - The value, the change against yesterday (with colour and arrow).
   - "Last updated 11:40 AM PKT" and the source name.
3. **Table:** 24k / 22k / 21k / 18k per tola, per 10g and per gram. For dollar: interbank and open market (buy/sell). For petrol: Super, HSD, kerosene, LDO.
4. **City tabs:** Karachi, Lahore, Islamabad, Peshawar, Quetta, Multan, Faisalabad.
5. **Chart:** 7D / 30D / 1Y toggles, a lightweight SVG chart with a tooltip.
6. An auto-generated "Today's summary" paragraph and an FAQ section (with Roman Urdu questions).
7. Related news from Business.

### 4.5 Live page (`/live`)
A list of active live stories, each with its latest 2 updates and a "Follow" bell.

### 4.6 Search (`/search?q=`)
- An instant input (debounced 250ms) with tabs for All / News / Rates.
- Highlighted matches.
- Recent searches saved in localStorage.

### 4.7 Author, Tag, and Static pages
- **Author:** avatar, bio, expertise, social links, and the author's articles.
- **Static pages:** a clean reading layout with a table of contents.
- **Required pages:** About, Editorial Policy, AI Use Policy, Corrections Policy, Privacy, Terms, Contact, Advertise.

### 4.8 Not found / error
- A friendly illustration of the angle mark, a search box, and the latest 6 stories.
- The 404 page returns a real 404 status code.

## 5. Components (shadcn/ui based)
`SiteHeader`, `TopBar`, `RatesStrip`, `CategoryNav`, `MobileBottomNav`, `BreakingTicker`, `LanguageSwitch`, `ThemeToggle`, `SearchDialog (⌘K)`, `ArticleCard` (variants: `hero`, `large`, `medium`, `compact`, `list`, `numbered`), `Kicker`, `LiveBadge`, `TimeAgo` (PKT), `ShareBar`, `KeyPoints`, `WhatItMeans`, `LiveUpdates`, `FAQAccordion`, `SourcesList`, `AuthorBox`, `RateCard`, `Sparkline`, `RateTable`, `CityTabs`, `RateChart`, `AdSlot`, `NewsletterCTA`, `WhatsAppCTA`, `Pagination`, `Breadcrumbs`, `ReadingProgress`, `EmptyState`, `Skeletons`.

**ArticleCard rules:**
- Images are always 16:9 (the compact variant uses 1:1), lazy-loaded except on the hero, and use `sizes` correctly.
- Headlines are clamped to 3 lines and the dek to 2.
- The kicker is in the category colour.
- Time is shown as relative ("12 min ago") for the first 24 hours, then as an absolute date.

## 6. RTL / Urdu specifics
- The `[locale]` layout sets `dir="rtl"`. Use logical CSS properties throughout (`ms-*`, `me-*`, `ps-*`, `start-*`), never `left`/`right`.
- Icons with direction (arrows, chevrons) flip with `rtl:rotate-180`.
- Numbers in rate tables stay in Western digits and left-to-right inside RTL, by wrapping them in `dir="ltr"`.
- Dates use Urdu month names (`اکتوبر`). Relative time reads like "12 منٹ پہلے".
- Urdu cards get a little more vertical padding, and headline clamps go from 3 lines to 2 with a larger line-height.

## 7. Accessibility
- WCAG 2.2 AA contrast. Focus rings are a 2px accent outline with an offset.
- Keyboard navigation: skip-to-content link, focus trap in the search dialog and mobile sheet.
- Every image has alt text (the AI writes it and an editor can override it). Charts get a table fallback.
- Touch targets ≥ 44px. Base font is never below 16px.

## 8. Performance budgets
| Metric | Target (4G mid-range Android) |
|---|---|
| LCP | < 1.8s |
| CLS | < 0.05 |
| INP | < 150ms |
| JavaScript per route | < 90 KB gzipped (only the client parts that need interactivity) |
| Hero image | AVIF/WebP, `priority`, ≤ 120 KB |
| Fonts | ≤ 2 preloaded files per locale |

**How we hit the budgets:**
- Server Components by default.
- Client components only for: ticker, theme toggle, search dialog, share (navigator.share), rate chart tooltip, live updates polling (SWR every 30s on live stories only).
- Ads lazy-load below the fold, and their space is reserved in advance.

## 9. Social card templates (satori)
- **Instagram portrait card (1080x1350):**
  - Full-bleed image with a dark gradient over the bottom 55%.
  - A category kicker pill, and the headline in Newsreader 64 (or Gulzar 72 for Urdu).
  - The `zaviya` wordmark bottom-left and the angle mark top-right.
  - The source line in small text.
- **Square card (1080x1080):** same layout, for Facebook and X.
- **OG image (1200x630):** headline on the left 60%, image on the right 40%, with an accent strip.
- **Breaking variant:** a red "BREAKING / بریکنگ" bar at the top.
- **Rates card:** big numbers with arrows, the date, and the tagline.

## 10. Admin UX (Payload)
- **Dashboard widgets:**
  - review queue count
  - today's published count / daily cap
  - worker heartbeat
  - top articles today
  - kill switch
- **Article edit view:** an "AI panel" sidebar with the model, the scores, the title options (click to swap), the sources with their tiers, and the originality percentage.
- Live preview of both locales side by side.
