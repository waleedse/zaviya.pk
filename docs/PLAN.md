# Zaviya: Master Plan aur Status

> Maqsad: 24 ghante chalne wali automated Pakistani news site jo genuine Google aur social traffic laaye. Ads abhi band hain; AdSense tab lagega jab site eligible ho.
> Deploy aur hosting ki tafseel: [DEPLOY.md](DEPLOY.md)

Status update: 11 Oct 2026

---

## Kya ho chuka hai

### SEO foundation ✅
- Urdu pages ka canonical ab apne Urdu URL par hai. Pehle sab English par jata tha, jis se Urdu pages index nahi hote.
- hreflang sirf woh versions dikhata hai jo maujood hain (EN ↔ UR).
- `robots.txt` ab chal raha hai (pehle 404 tha), aur sitemap sahi domain ke saath hai.
- Har page type ke liye search-intent wale titles aur descriptions: home, categories, tags, live, rates, static pages.
- Lambe headlines par " | Zaviya" nahi lagta, taake Google poori headline dikhaye.
- Search pages aur 3 se kam articles wale tag pages `noindex` hain. Ghair-maujood tag par asal 404 aata hai.
- Article pages server par poore render hote hain. Image ka ek bug theek hua jis se pehle 500 error aata tha.
- `pnpm --filter @zaviya/web seo:check` sitemap ke saare pages check karta hai. Abhi: **39/39 pages, 0 errors, 0 warnings**.
- Nakli data hata diya: seed ke fake rates (486 entries) aur 3 fake articles. Mock data sirf `ZAVIYA_DEMO_DATA=1` par dikhta hai.
- Ads ke placeholders hata diye. `NEXT_PUBLIC_ADSENSE_CLIENT` khali ho to koi ad slot render nahi hota.

### Naya design ✅
- "Zaviya Editorial" design system: kaghazi background, gehre serif headlines, columns ke beech hairline lakeerein, aur brand ka 30° angle nishan.
- Header mein inline categories hain, mobile par full menu sheet (pehle menu button kuch nahi karta tha), aur Gregorian + Hijri date.
- Home: lead story, secondary stories, live "Latest" timeline, asal rates, category sections, most read.
- Article: badi headline, byline, WhatsApp-first share (mobile par sticky bar), key points, "What it means for you", X/Instagram embeds, sources, FAQs, related.
- Jin khabron ki tasveer nahi, un mein category ke rang ka designed card (khali grey dabba nahi).
- Hydration errors theek hue (link ke andar link, theme toggle).
- Urdu RTL mein Nastaliq font sahi chalta hai, aur dark aur light dono modes kaam karte hain.

### Rates pages (sab se zyada search hone wale) ✅
- Dollar: market rate (exchangerate-api) aur open market buy/sell (forex.pk), saath mein Riyal, Dirham, Pound, Euro.
- Gold: international spot price se PKR, 24/22/21/18K, tola/10g/gram. Page par saaf likha hai ke yeh andaza hai.
- Petrol/diesel: khabron se nikali gayi qeemat, aur sirf tab jab 2 outlets ek hi number batayein.
- Data na ho to page `noindex` hota hai. Koi guess nahi.

### Admin Control Room ✅ (`/admin` kholte hi)
- Live visitors, aaj/7 din traffic, 14 din ka chart, traffic kahan se aa raha hai (Google, Discover, WhatsApp, Facebook, X, direct), aur devices.
- "Google traffic shuru hua?" card, top pages, aur latest articles (views, QA score, kis model ne likha).
- Review queue mein Approve/Reject buttons.
- Automation ki haalat: worker, Gemini, extension, Ollama, queues aur sources.
- Buttons: Fetch news now, Check X/Instagram, Pause/Resume, Kill switch.
- Google Trends + X trends, aur "system ne kya seekha" (category weights, Search Console queries, Gemini quota).
- Analytics apni DB mein, bagair cookie ke, bots filter ho kar.

### 24/7 news machine ✅
- 30+ sources: Dawn, Geo, ARY, The News, Jang, Express, BBC Urdu, Independent Urdu, ProPakistani, TechJuice, PakWheels, Cricket Pakistan, Google News queries aur **Google Trends Pakistan**.
- Extension discovery (har 20 min): X trending, X par official accounts ki search, aur Instagram news pages. Yeh posts sirf khabar dhoondne aur embed ke liye hain, copy nahi hote.
- Pipeline: discover → cluster → triage → **SEO research** → write EN → write UR → QA → **Gemini web image (extension)** → publish → social.
- Bugs theek hue: scheduler (BullMQ v6 mein feeds sirf ek dafa poll hoti thi), QA retry ka infinite loop, pacing data missing tha, aur khabrein review mein phansi rehti thi.
- **Auto-approve** (`AUTO_APPROVE=safe`): review ka intezar nahi. Sirf blasphemy aur bachon se mutalliq khabrein ruki rehti hain.
- Mac ke liye `launchd` installer: login par start, crash par restart, Mac ko sone nahi deta.

### Free AI setup ✅ (billing nahi)
- Gemini Interactions API, writer models ki rotation (3.8 → 3.7 → 3.6 → 3.5 → 3-preview), har model ka apna free quota.
- Local `qwen3:8b` (Ollama): triage, SEO aur QA. Gemini quota khatam ho to likhai bhi yahi karta hai.
- Quota khatam ho to job ruk kar baad mein khud chal jati hai, gum nahi hoti.

### SEO intelligence aur self-improvement ✅
- Har article se pehle Google Autocomplete (EN, Urdu, Roman Urdu), Trends match aur duplicate check.
- Writer ko keyword plan milta hai. QA keyword stuffing aur chhote "pakistan" ko rokta hai.
- Pehle se related articles ke internal links diye jate hain.
- Roz ka learning job: category weights (jo readers zyada padhte hain), Search Console sync, aur kam CTR wali headlines ki behtari.

---

## Baqi kaam (aap ki taraf se)

| # | Kaam | Kyun |
|---|---|---|
| 1 | Domain + VPS khareedna (Contabo ~€6) aur [DEPLOY.md](DEPLOY.md) follow karna | Site ko live karna |
| 2 | Search Console verify karna aur service account add karna | Headline learning aur traffic data |
| 3 | WhatsApp Channel banana aur link env mein daalna | Sab se tez traffic source |
| 4 | About/Contact pages mein asal maloomat | Google trust (E-E-A-T) |
| 5 | Telegram bot (optional) | Mobile par alerts aur roz ki report |
| 6 | Facebook Page + Meta tokens (optional) | Social auto-posting |

## Traffic ki haqeeqat
- **Hafta 1-2:** naya domain dheere index hota hai. Shuru ka traffic WhatsApp aur Facebook se aayega.
- **Hafta 3-6:** rates pages aur long-tail/Roman Urdu searches par clicks shuru honge.
- **Mahina 2-3:** consistency rahi to Discover/News se spikes aayenge. AdSense ke liye apply karne ka waqt bhi yahi hai.
