# Extension "eyes": self-healing browser jobs (build brief)

Waleed (18 Oct): when the extension hits a hurdle on X, Instagram or Gemini (a popup, a dialog, a "something went
wrong", a stuck composer), it should **see** the page and get past it by itself. It should ask for him only when a
human is really needed (login, captcha, locked account).

Constraint: no Claude tokens for this. Use the worker's existing LLM router (Gemini first, free) with vision.

## Hard rules

- **Git**: own worktree from `origin/main`, branch `feat/extension-eyes`. Build on top of PR #48 (`fix/extension-x-posting`): base your branch on it if it isn't merged yet, so you don't conflict.
- **Shipping**: you may commit, push and open a PR. No merge, tag, deploy or ssh. Never post to any platform while testing.
- **Healing must never do anything risky.** The model may only choose from a fixed action list, and the code enforces it:
  - Allowed clicks (button or link visible text, case-insensitive, exact or startsWith): Close, Cancel, Not now, Skip, Skip for now, Got it, OK, Dismiss, Discard, Leave, Try again, Retry, Reload, Refresh, Continue, Accept all cookies is NOT allowed (decline or close only), Maybe later, No thanks, X / ×.
  - `press_escape`
  - `reload_tab`
  - `scroll_top`
  - `give_up`
  - Never: typing anything; clicking Post, Send, Delete, Log out, Subscribe, Buy, Premium, Verify, Follow, Block, Report, or any link that leaves the platform domain.
  - Never enter credentials. Login, captcha, 2FA or "locked" means `needs_human`.
- **Rate limits**: at most 2 heal attempts per job and 6 per hour across all jobs. A healed job retries once.

## Facts

- **Extension**: `apps/extension` (WXT, MV3), permissions include `debugger` and `scripting`.
  - `src/lib/trusted-input.ts` has CDP click, key and text helpers.
  - `src/lib/tabs.ts` (after #48) has `ensureOwnTab` and `navigateLeavingDrafts`.
  - Jobs are in `src/lib/jobs.ts`. Errors flow back to the worker as `{ ok: false, error }` through the bridge (`src/entrypoints/background.ts`, `@zaviya/shared` `BridgeMessageSchema`; `scripts/verify-protocol.ts` checks the shapes).
- **Screenshot**: use CDP `Page.captureScreenshot` (`format: 'jpeg'`, quality about 60, width capped about 1280), so background tabs work. Collect the candidate clickable elements with `chrome.scripting.executeScript`: visible buttons, links and `role=button` with their text, `aria-label`, bounding box centre, and whether they sit inside a dialog. Also collect dialog texts and toasts.
- **Worker**: `apps/worker/src/bridge/server.ts` (WebSocket bridge), LLM router `@zaviya/llm`. Check whether the Gemini provider supports image input; add inline image parts if it doesn't, with a test.
- **Notifications**: the Telegram admin notify exists but Telegram is currently not configured on the server. Email works: send from `ops@zaviya.pk` to `waleed@zaviya.pk` using the worker mail transport in `apps/worker/src/mail/transport.ts` (env `OPS_MAIL_USER` / `OPS_MAIL_PASSWORD` are set on the server). Add JPEG attachment support (multipart/mixed) for the screenshot.

## Flow

1. A job fails with a non-trivial error (timeout, `content_script_no_reply`, `post_not_sent`, `composer_not_found`, selector-not-found, unknown). The extension captures `{ jobType, error, url, screenshot, elements[], dialogs[] }` and sends a new bridge message `heal.request`.
2. The worker asks the LLM (vision) with a strict JSON schema: `{ diagnosis, action: 'click'|'press_escape'|'reload_tab'|'scroll_top'|'give_up', elementIndex?, needsHuman: boolean, humanReason? }`. Validate it with zod and re-check the allow-list in code. On LLM failure or quota exhaustion, use a rule-based fallback (known dialogs: Leave site, Discard, Something went wrong + Try again, cookie banners: close).
3. The worker replies `heal.action`. The extension performs it with trusted CDP input at the element centre, waits 3 s, and retries the original job once.
4. Report:
   - every heal is logged (job, diagnosis, action, retry result)
   - on `needsHuman` or when the attempts are used up: an email to Waleed with the screenshot attached, the diagnosis and exactly what he should do ("open x.com in Chrome and log in"), at most one email per platform per 2 h
   - the social post's error text includes "healed: …" or "needs you: …"
5. The extension's options page shows the last 10 heals (time, job, action, result) from `chrome.storage.local`, so Waleed can see what it did.

## Tests and done

- **Unit tests**:
  - allow-list enforcement: the model asks to click "Post" or "Log out" and the code refuses
  - schema validation
  - rule fallback
  - rate limits
  - the MIME attachment builder
  - the bridge message shapes (`verify-protocol.ts`)
- **Checks**: worker and extension typecheck pass; worker tests pass.
- **Local test**: no posting. Load the built extension? No: build only. Instead, unit-test the extension's element-collection and action-execution functions where possible, and run the worker heal handler against 3 saved screenshots. Make them yourself from public pages, e.g. a page with a cookie banner and a page with a dialog. Report the decisions.
- **Final report**:
  - files changed
  - test results
  - new env (if any)
  - the PR link
  - what was not verified live
