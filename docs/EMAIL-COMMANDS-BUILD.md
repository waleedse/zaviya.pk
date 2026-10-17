# Email commands: build brief

Waleed wants to run Zaviya by email. He writes to **ops@zaviya.pk**, and the server understands the mail, carries it out
and replies. This must **not spend Claude tokens**: plain worker code plus the cheap LLM router the worker already
uses (Gemini free tier first). Anything outside the fixed action list is handed to the right agent through Linear,
and only that agent's next run uses Claude.

## Hard rules

- Work in a git worktree on a new branch `feat/email-commands` from `origin/main`.
- Do not commit to main, push tags, deploy, ssh, or send real email to Waleed.
- Testing against the live mail server is allowed only between ops@ and seo@ (credentials in `~/.zaviya-agents/.env`: `MAIL_OPS_PASSWORD`, `MAIL_SEO_PASSWORD`; never print them). You may **commit and push the branch and open a PR**. The reviewer merges and releases.
- Production must never be affected while it is off: everything sits behind `MAIL_COMMANDS_ENABLED=true`.
- Never delete data. Retract is the strongest action and needs a confirmation round-trip.

## Facts

- **Mail server**: our own server at `mail.zaviya.pk`, docker-mailserver, IMAP 993 TLS and SMTP 465 TLS.
  - `ops/bin/mail.mjs` already implements dependency-free SMTP send, IMAP search/fetch/store and MIME text extraction (multipart, quoted-printable, base64, encoded words, quoted-history trimming).
  - Port that logic to TypeScript in the worker (`apps/worker/src/mail/`), with unit tests on sample raw messages (Gmail, Outlook and iPhone styles, Urdu text). Or add `imapflow` + `nodemailer` if you judge that safer; say which and why.
- **Main worker** (`apps/worker`): BullMQ queues in `src/queues.ts`, `WorkerRuntime` with `redis`, `queues`, `payload` (`PayloadClient`), `pauseAll` / `resumeAll`, `getQueueStats`.
  - The LLM router is `@zaviya/llm` `LLMRouter` (see how `pipeline/triage.ts` calls it, and how it handles `QuotaExhaustedError`).
  - The Telegram bot (`telegram/bot.ts`) already has status / pause / resume / retract / stats commands: reuse those code paths, don't duplicate the logic.
- **Video service**: a separate container with BullMQ queue `video`.
  - Run a slot now: add job `{ name: 'run', data: { slot } }` to queue `video`. **Check how `main.ts` handles it**, and add a `now: true` data flag if needed so the run posts without the veto wait.
  - Skip a video: Redis `video:skip:<YYYY-MM-DD>-<slot>` with a 6 h TTL.
  - Slots are listed in `apps/worker/src/video/schedule.ts` `DEFAULT_SLOTS`.
- **Social daily caps**: Payload settings global `dailyCaps` (read with `payload.getSettings()`; find the write path in the web app's pipeline API).
- **Linear**: `ops/bin/linear.mjs` shows the API calls (team ZAV; labels `engineer`, `seo`, `editor`, `product`, `social`, `needs-waleed`). The worker needs `LINEAR_API_KEY` in its env for hand-offs; if it is missing, reply that the hand-off failed and keep it in the reply.

## Behaviour

- **Schedule**: a BullMQ scheduler `mail-commands` runs every 3 minutes in the main worker (not the video service), only when `MAIL_COMMANDS_ENABLED=true` and `OPS_MAIL_USER` / `OPS_MAIL_PASSWORD` are set.
- **Each run**:
  1. IMAP `UID SEARCH UNSEEN`; handle up to 5 messages, oldest first.
  2. **Authenticate the sender (critical)**: accept only mail whose From address is exactly `waleed@zaviya.pk` **and** that was submitted authenticated through our own server. Look at the real headers of a test message sent from one of our mailboxes: docker-mailserver/Postfix writes a `Received: ... by mail.zaviya.pk ... with ESMTPSA` line for authenticated submission, and rspamd may add `Authentication-Results` / DKIM for zaviya.pk. Write the rule against the real headers and unit-test it, including a spoofed From from the outside, which must be rejected.
     - Anything that fails: mark it seen, don't act, don't reply (no backscatter), log it, and send one Telegram admin notify per hour at most.
  3. **Understand**: LLM JSON call with a strict schema and a few-shot prompt (English, Urdu and Roman Urdu examples), at temperature 0. The model returns `{ actions: [{ type, args, confidence }], reply_summary }`. Validate with zod. The allowed `type`s:
     - `status`: published today, queue stats, social posts today per platform (with failures), video schedule and next runs, last errors.
     - `pause` / `resume`: the news pipeline.
     - `video_now` `{ slot }` and `video_skip` `{ slot }` (today's).
     - `retract` `{ articleId | url, reason }`: **two-step**. Reply with a 6-character code and run it only when a later mail from Waleed contains `CONFIRM <code>` within 2 h (store the pending action in Redis).
     - `set_cap` `{ platform, perDay }`, limited to 0..100.
     - `handoff` `{ agent: engineer|seo|editor|product|social, title, details }`: creates a Linear issue for that agent, quoting Waleed's mail; add `pm-approved` only when the agent is `seo` or `editor` and the request is content or SEO.
     - `answer`: a factual question the status data can answer.
     - `unknown`: reply asking him to rephrase, and list the examples.
     - Confidence below 0.7 means do nothing risky: reply with what was understood and ask him to confirm.
  4. **Execute** in code, then reply in plain text in the same thread (`In-Reply-To`): what was done, the results, and anything pending.
  5. Mark the mail seen only after the reply is sent. Make it idempotent: Redis `mailcmd:done:<Message-ID>`.
- **LLM down or quota exhausted**: fall back to a keyword parser for the core commands (`status`, `pause`, `resume`, `video now <slot>`, `skip <slot>`, `CONFIRM <code>`). Otherwise reply "will process when the model is back" and leave the mail unread for the next run (at most one such reply per mail).
- **Logs**: one line per mail (uid, decision, actions, result). Never log the password.

## Tests and done

- Unit tests:
  - MIME parsing samples
  - the sender authentication rule (accepted vs spoofed)
  - schema validation and the confidence gate
  - the keyword fallback
  - the retract confirm flow
  - idempotency
  - each action's executor with mocked deps
- Worker `pnpm test` and `typecheck` pass.
- Live smoke test with `MAIL_COMMANDS_ENABLED` and `OPS_MAIL_*` pointing at ops@, run once through a CLI (`node --import tsx src/mail/cli.ts once --dry`). Two cases:
  - A "status" mail sent from **seo@** must be **rejected**, because the sender is not Waleed. That proves the gate.
  - Mail sent from seo@ while a test-only env `MAIL_COMMANDS_ALLOW_FROM=seo@zaviya.pk` is set must be accepted, and the reply arrives in seo@'s inbox.
  - Remove nothing afterwards except the test mails.
- Final report:
  - files changed
  - test results
  - the exact env vars to add on the server (`MAIL_COMMANDS_ENABLED`, `OPS_MAIL_USER`, `OPS_MAIL_PASSWORD`, `LINEAR_API_KEY` if missing)
  - the sample replies
  - the PR link
  - what you could not verify
