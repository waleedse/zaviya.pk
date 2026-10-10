# Growth features (Zaviya web)

Shipped in `apps/web` without external account signup.

## Web Stories (AMP)

- **Route:** `GET /[locale]/stories/[slug]` (English unprefixed via locale proxy → `/en/stories/...`).
- **Source:** Published article title, dek, hero image, key points.
- **Article link:** Shown when `canBuildWebStory` passes (hero + title + dek or key points).

Test: open a published article → “Web story” link, or `curl -I http://localhost:3100/stories/{slug}`.

## Web Push

- **Service worker:** `public/sw.js` (push + notification click stub).
- **Client:** `src/lib/push.ts` — `subscribeToPush(locale)` (requires `NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
- **API:** `POST /api/push/subscribe` → Payload `push-subscriptions` collection.

Env (generate with `npx web-push generate-vapid-keys`):

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY` (server-only, for future send job)
- `VAPID_SUBJECT` (e.g. `mailto:editor@zaviya.pk`)

Sending notifications is **Phase 2** (worker + `web-push` + private key).

## Analytics

- **Beacon:** `POST /api/analytics/pageview` — `{ path, locale?, referrer? }`, responds `204`, no cookies.
- **Client:** `PageviewBeacon` in `FrontendShell` (soft pageviews on route change).
- **Optional third-party:** set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and/or `NEXT_PUBLIC_GA_ID` in env; scripts injected in locale layout.

## AdSense

- **Component:** `AdSlot` renders `adsbygoogle` when `NEXT_PUBLIC_ADSENSE_CLIENT` is set; dashed placeholders otherwise.
- **Article:** mid-content slots after ~3rd and ~8th block in lexical body + sidebar skyscraper.

## Remotion Reels (Phase 2)

Not built in-repo (heavy render pipeline). See `apps/web/src/lib/remotion-brief.ts` for the intended article → reel brief shape. Future: extend Payload `/api/pipeline` with a render queue step and worker.
