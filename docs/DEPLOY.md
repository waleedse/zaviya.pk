# Zaviya: Deploy aur 24/7 chalana

Do hisse hain:

| Kahan | Kya chalta hai | Kyun |
|---|---|---|
| **VPS** (internet par) | Website + Payload admin + Postgres + Caddy (HTTPS) | Hamesha online, tez, Google ke liye stable |
| **Aapka Mac** | Worker (AI pipeline), Ollama (local model), Redis, Chrome + Zaviya extension | Muft AI (local model + Gemini free tier), Gemini web images aapke logged-in browser se |

Mac aur VPS sirf HTTPS par baat karte hain (`PAYLOAD_URL=https://zaviya.pk`). Mac band ho to website chalti rehti hai; sirf naye articles rukte hain aur Mac on hote hi dobara shuru ho jate hain.

---

## 1. Sasti hosting options (Oct 2026)

Qeematein badalti rehti hain, khareedne se pehle provider ki site par check karein.

| Option | Specs | Qeemat (taqreeban) | Raye |
|---|---|---|---|
| **Contabo Cloud VPS 4** ⭐ | 4 vCPU, 8 GB RAM, 100 GB | ~€5.3/mahina (24 mahine), ~€6.6 (mahana) | **Behtareen value.** 8 GB RAM mein build bhi VPS par ho jata hai. Peak hours mein CPU thoda slow ho sakta hai |
| Hetzner CX23 | 2 vCPU, 4 GB, 40 GB | ~€3.99 + €0.50 IPv4 | Quality achhi, lekin 2026 mein aksar "not available". 4 GB par build ke liye swap chahiye |
| Hetzner CAX (ARM) | 2 vCPU, 4 GB | ~€3.29 (bina IPv4) | Sasta, ARM hai. IPv4 alag se lena padega |
| Oracle Cloud Always Free | 2 OCPU ARM, 12 GB | **Muft** | 2026 mein limit aadhi ho gayi hai, aur "out of capacity" error aam hain. Mil jaye to zabardast, warna waqt zaya |
| DigitalOcean | 2 vCPU, 4 GB | ~$24 | Mehnga. Sirf documentation achhi hai |

**Mera mashwara:** Contabo Cloud VPS 4 (~€6/mahina) + **Cloudflare free** (DNS, CDN, DDoS protection). Kul ~**PKR 1,900/mahina**.

Sources: [Hetzner 2026 prices](https://findstack.com/resources/hetzner-price-increase-2026), [Hetzner CX23 availability](https://www.bitdoze.com/md/hetzner-cloud-review.md), [Oracle free tier cut](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/), [cheap VPS comparison](https://findstack.com/resources/cheapest-vps-hosting), [Contabo vs DigitalOcean](https://getdeploying.com/contabo-vs-digitalocean).

---

## 2. VPS setup (ek dafa)

```bash
# VPS par (Ubuntu 24.04)
curl -fsSL https://get.docker.com | sh
git clone <aapka-repo> zaviya && cd zaviya
cp apps/web/.env.example apps/web/.env.production   # phir neeche wali values bharein
```

`apps/web/.env.production` mein zaroori values:

```
NEXT_PUBLIC_SITE_URL=https://zaviya.pk
PAYLOAD_SECRET=<lamba random string: openssl rand -hex 32>
POSTGRES_PASSWORD=<strong password>
DAILY_ARTICLE_CAP=60
# optional: NEXT_PUBLIC_WHATSAPP_CHANNEL_URL, GSC_SERVICE_ACCOUNT_JSON, GSC_SITE_URL, R2_*
```

Database: Mac se data copy karein (schema + categories, sources, pages, articles):

```bash
# Mac par
bash infra/scripts/db-export.sh > zaviya.sql
scp zaviya.sql vps:zaviya/
```

```bash
# VPS par
cd zaviya/infra
docker compose -f docker-compose.prod.yml --env-file ../apps/web/.env.production up -d postgres
docker compose -f docker-compose.prod.yml exec -T postgres psql -U zaviya zaviya < ../zaviya.sql
docker compose -f docker-compose.prod.yml --env-file ../apps/web/.env.production up -d --build
```

**DNS:** Cloudflare mein `zaviya.pk` add karein, A record VPS ke IP par. SSL/TLS mode **Full (strict)** rakhein. Caddy certificate khud le leta hai.

---

## 3. Mac par worker 24/7

1. `apps/worker/.env` mein `PAYLOAD_URL=https://zaviya.pk` aur production bot API key daalein (Payload admin → Users → bot → API key).
2. Ollama app kholein aur menu se **Launch at login** on karein. `ollama pull qwen3:8b` aur `ollama pull nomic-embed-text` chalayein.
3. Redis: `brew install redis` (installer `brew services` se khud start kar deta hai).
4. Worker install:

```bash
bash infra/mac/install-worker.sh
```

Worker login par khud start hota hai, crash ho to restart hota hai, aur chalne ke dauran Mac ko sone nahi deta. Logs: `~/Library/Logs/zaviya-worker.log`.

5. **System Settings → Battery/Energy:** "Prevent automatic sleeping when the display is off" on rakhein, aur Mac charger par lagaye rakhein.

---

## 3b. Mac par sab kuch Docker mein (Colima)

Website, admin, worker, Postgres aur Redis ab Docker mein chalte hain (`docker-compose.yml`, repo ki jarh mein). Chrome extension browser mein hi rehta hai aur `ws://127.0.0.1:8787` par worker se judta hai.

Ek dafa setup (ho chuka hai):
- Docker CLI, Compose, Colima aur Lima official releases se `~/.local/bin` mein hain (Intel Mac par Homebrew ab ready-made packages nahi deta).
- Colima VM: `colima start --cpu 6 --memory 8 --disk 60 --vm-type vz --mount-type virtiofs`
- Repo ki jarh mein `.env` mein `POSTGRES_PASSWORD` hai (git mein nahi jata).

Roz ka kaam:

```bash
colima start                         # Mac restart ke baad
docker compose up -d --build         # sab start / code badla ho to rebuild
docker compose ps                    # kya chal raha hai
docker compose logs -f worker        # worker ka log
docker compose restart worker        # sirf worker restart
docker compose down                  # sab band (data volumes mein mehfooz)
```

- Website: http://localhost:3000, admin: http://localhost:3000/admin
- Postgres Mac se: `127.0.0.1:5433` (user `zaviya`, password `.env` mein), Redis: `127.0.0.1:6380`
- Uploaded images `apps/web/media` folder mein hi rehti hain (container mein mount)
- Worker ke andar `PAYLOAD_URL=http://web:3000` hai; extension ko di jane wali image links `PUBLIC_MEDIA_URL=http://localhost:3000` se banti hain

Purana Homebrew Postgres (5432) aur Redis (6379) backup ke taur par abhi chal rahe hain. Sab theek chale to inhein band kar sakte hain: `brew services stop postgresql@17 redis`.

---

## 4. Chrome extension (Gemini images + X/Instagram discovery)

1. `chrome://extensions` kholein, **Developer mode** on karein, phir **Load unpacked** se yeh folder chunein:
   `apps/extension/.output/chrome-mv3`
2. Extension ke **Options** kholein. Bridge token woh likhein jo `apps/worker/.env` mein `BRIDGE_TOKEN` hai, aur "Worker connection: connected" dikhna chahiye.
3. Usi Chrome profile mein login karein: **gemini.google.com**, **x.com**, **instagram.com**. Alag accounts behtar hain.
4. Options page par **Test Gemini image** dabayein. 1-3 minute mein tasveer aani chahiye. Agar Gemini ki UI badal jaye to selectors ka JSON wahin badal sakte hain.
5. X ki settings mein location **Pakistan** rakhein, taake trending Pakistan ka dikhe.

---

## 5. Launch ke din

- [ ] Google Search Console: domain verify karein, phir `https://zaviya.pk/sitemap.xml` aur `/news-sitemap.xml` submit karein
- [ ] Search Console → Settings → Users mein service account ka email add karein (dashboard aur headline learning ke liye)
- [ ] Bing Webmaster Tools: sitemap submit karein
- [ ] Google News Publisher Center mein site add karein
- [ ] About, Contact, Editorial Policy pages mein asal maloomat daalein (admin → Pages)
- [ ] WhatsApp Channel banayein aur link `NEXT_PUBLIC_WHATSAPP_CHANNEL_URL` mein daalein
- [ ] Admin mein Control Room dekhein: "Worker online", "Extension" aur "Gemini" hare hone chahiye

---

## 6. Free AI setup kaise kaam karta hai

| Kaam | Model | Kharcha |
|---|---|---|
| Embeddings (khabrein group karna) | `nomic-embed-text` (local) | Muft |
| Triage, SEO keywords, QA, headline learning | `qwen3:8b` (local) | Muft |
| Article likhna (EN + UR) | Gemini free tier: 3.8 → 3.7 → 3.6 → 3.5 flash (har model ka apna quota) | Muft |
| Jab Gemini quota khatam ho | `qwen3:8b` likhta hai (slow, ~20 min/article) | Muft |
| Hero image | Gemini web, aapke browser ke zariye (extension) | Muft |

Free tier par Gemini ki har model ki ~20 requests roz hain. Ek article mein 2 requests lagti hain, yani ~40-50 articles roz Gemini se aur baqi local model se.
