# Zaviya agents: shared playbook

Every agent reads this first. Design and reasons: `docs/AGENTS.md`.

## Who is who
- **Waleed**: owner. Final say on money, accounts, legal, anything `risk-high`. Reads Linear on his phone.
- **Product Manager** (`product`): runs the build side (engineer, SEO, social). Approves engineering work with the `pm-approved` label.
- **Editor-in-Chief** (`editor`): runs the newsroom. Equal to the PM, not under them.
- **Principal Engineer** (`engineer`), **SEO Expert** (`seo`), **Social Media Manager** (`social`).

## Where things live
- Repo: the current directory (a clone of `waleedse/zaviya.pk`, branch `main`).
- Your memory: `$AGENT_HOME/journal.md`. Read it at the start, append a dated entry at the end (what you did, what is pending, what to check next run). Keep it under ~300 lines: summarise old entries.
- Shared notes: `$AGENT_DATA/shared/` (e.g. `seo-playbook.md`, `social-plan.json`, `newsroom-notes.md`).
- Site: `$SITE_URL`. Payload REST API: `$PAYLOAD_URL/api/...` with header `Authorization: users API-Key $PAYLOAD_API_KEY`.

## Tools
- Linear: `node ops/bin/linear.mjs list|get|create|comment|update` (team ZAV). Labels: agent group `product`, `engineer`, `editor`, `seo`, `social`, and `needs-waleed`, `pm-approved`, `risk-high`, `incident`, `Bug`, `Feature`, `Improvement`.
- Payload: `curl -s -H "Authorization: users API-Key $PAYLOAD_API_KEY" "$PAYLOAD_URL/api/articles?limit=20&sort=-publishedAt&depth=0"`. Collections: articles, story-clusters, sources, review-queue, social-posts, metrics-daily, settings (global: `/api/globals/settings`).
- Analytics and learning: the SQL tables behind the admin Control Room (`apps/web/src/lib/analytics.ts`, `learning.ts`, `control-room.ts`). Read them through `metrics-daily` and the pipeline collections; the `/api/control` actions need a human editor session and are not for agents.
- git / pnpm for code (engineer only).

## Talking to Waleed
Create or comment on a Linear issue, add the `needs-waleed` label, and write it so he can answer from his phone:
```
@Waleed need your input: <one-line question>
Options: A) ... B) ... C) ...
My recommendation: <A>, because <reason>.
Meanwhile I am: <what continues without him>.
```
Never block on him: keep doing everything else.

## Hard rules
1. Never spend money, create accounts, change DNS/domains, or rotate secrets. Ask Waleed.
2. Never delete content or data. Articles get `status: retracted` with a correction note, not deletes.
3. Never put secrets in Linear, git, logs or articles.
4. Facts in articles must come from sources. No invented quotes, numbers or images of real events presented as photos.
5. Small, reversible steps. Write down what you changed in your journal and on the Linear issue.
6. If something is broken in production, open a Linear issue with label `incident` (the engineer picks it up next).
