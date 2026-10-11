# RepoRadar

A personal website for discovering and learning about GitHub repositories that are gaining traction.

Version one is deliberately small: collect GitHub Trending (daily) once a day, save a dated JSON snapshot, and compare the latest successful snapshot with the previous one. No database and no monitoring of all of GitHub.

- **Website:** React + Vite + TypeScript + Tailwind CSS (static, deployable to Vercel)
- **Collector:** Node.js + TypeScript (run daily by GitHub Actions)
- **Storage:** JSON files in Git (`data/` for public snapshots, an `ops-state` branch for private delivery state)

## Status

| Phase | State |
| --- | --- |
| 1. Fixture data and UI (Today, History, Saved, About) | Done |
| 2. Collector (Trending parser, GitHub API metadata) | Done, tested live once |
| 3. Comparisons (net growth, displayed-figure change, new/returning/dropped) | Done |
| 4. Learning summaries (README → validated JSON notes, cache, budget) | Done, **off** until an LLM key is approved |
| 5. Scheduling (GitHub Actions), Vercel config, Telegram digest | Written, **not enabled**: needs your accounts and approval |

The site currently runs on **labelled sample data** (`fixtures/data`). The first real collection replaces it automatically.

## The numbers

| Name on site | Source | Meaning |
| --- | --- | --- |
| Stars today | GitHub | GitHub's displayed "N stars today", copied verbatim. |
| Net growth | Us | Total stars at our latest collection minus total stars at our previous collection. Only if the repo was on both lists. |
| Daily Δ | Us | Change in GitHub's displayed "stars today" between our two snapshots. |
| New to our list / Returning | Us | Not in the previous snapshot; "new" means never seen before, "returning" means seen on an earlier date. |

Rules enforced in code and tests:

- A missing observation is `null` and is shown as "Unknown" or "Not shown", never as `0`. When sorting, unknown values go last.
- Every view shows real collection timestamps (local time, UTC on hover).
- Data older than `staleAfterHours` (30) is labelled stale.
- A comparison longer than `multiDayThresholdHours` (26) is labelled with its real span, for example "2.0 days", and missing dates are listed.
- A failed run never overwrites a snapshot. The last good feed stays live and the failure is shown.

## Project layout

```
config/            notifications.json (digest rule), collector.json, categories.json — no secrets
collector/src/     parseTrending, collect, compare, categorise, feed, notify, summarise, github, lock, cli
shared/schema.ts   data model + zod schemas shared by collector and website
data/              REAL snapshots (YYYY-MM-DD.json), runs.json, summaries/ — committed by the workflow
fixtures/          saved live Trending HTML, GitHub API responses, READMEs, generated sample data
public/feed/       generated at build time: latest.json + history.json (the ONLY data the site reads)
src/               website
tests/             vitest suites
.github/workflows/ ci.yml (tests), daily.yml (collection; not active until pushed and enabled)
```

`state/` (delivery history, outbox, lock) is git-ignored on `main`, never bundled, and in Actions is stored on a separate `ops-state` branch.

## Commands

```bash
npm install
npm run dev          # website on http://localhost:5173 (reads public/feed)
npm test             # 52 tests
npm run typecheck
npm run build        # builds feed (data/ or, if empty, fixtures) + website into dist/

npm run fixtures     # regenerate sample data
npm run collect      # one live collection into data/ (safe to rerun; --force to replace today's)
npm run feed         # rebuild public/feed from data/
npm run summarise    # learning notes for selected repos (needs summaries.enabled + LLM_API_KEY)
npm run notify       # digest dry run → state/outbox/ ; add -- --send to actually send
npm run daily        # locked pipeline: collect → summarise → feed → notify
```

## Safety design

- **Untrusted repository content.** Repository code is never cloned, installed or run. Only Trending HTML and the GitHub REST API (metadata and README) are read. Descriptions are plain text, React escapes everything, and links are limited to http(s) with `rel="noopener noreferrer nofollow"`.
- **README → model.** Before the README goes to a model, HTML comments, scripts, invisible characters and base64 blobs are removed. The text is truncated and wrapped in `<untrusted_readme>` delimiters that it cannot close itself.
- **Model output validation.** Output must be strict JSON matching a fixed schema (no extra keys, length limits). It is rejected if it contains HTML or any URL outside the allow-list (repo, README, homepage). Technologies are kept only if they literally appear in the source. Invalid output is never cached, and the previous good note stays.
- **Budget.** Notes are generated only for selected repos (today's rule matches plus `summaries.selected`). There is a hard limit of `maxPerRun` model calls, and failures count too. Output tokens and README characters are capped. Notes are cached by repo + README SHA + prompt version + model.
- **Reruns and overlap.** One snapshot per UTC date, so a rerun is a no-op. Writes are atomic (temp file + rename). Overlap is blocked by the workflow `concurrency` group plus a file lock with stale-lock recovery.
- **Notifications.** At most once per snapshot: `sending` is saved before the API call, so an interrupted run never resends. Only a confirmed send starts the 7-day cooldown. There are no digests about stale data. Plain text only (no Telegram parse mode), and the token is redacted from errors. A corrupt state file stops delivery rather than risking duplicates.
- **Frontend.** No secrets or delivery state are bundled (checked by a test). `vercel.json` sets a strict CSP (hash-pinned inline script; also test-checked), `nosniff`, a referrer policy and a permissions policy.

## Default notification rule (`config/notifications.json`)

AI, developer tools, automation or web development · at least 100 displayed stars today · not notified in the last 7 days · at most 3 per daily digest. `"enabled": false` until you approve Telegram.

## Accounts & credentials needed (nothing has been created)

| What | Needed for | Cost | Where it goes |
| --- | --- | --- | --- |
| GitHub repository (yours) | Code, Actions, data history | Free | — |
| `GITHUB_TOKEN` | API metadata/README (5,000 req/h) | Free, automatic in Actions | Built in; locally optional (fine-grained token, public read-only) |
| Repo variables `REPORADAR_GIT_NAME`, `REPORADAR_GIT_EMAIL` | Commit as **you**, so Vercel Hobby deploys private-repo commits | Free | Settings → Secrets and variables → Actions → Variables. Use your GitHub noreply email |
| Vercel account + project linked to the repo | Hosting | Hobby is free (personal, non-commercial) | Import repo; framework Vite; settings come from `vercel.json`. No env vars needed |
| Telegram bot via @BotFather + your chat ID | Daily digest | Free | Secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; variable `REPORADAR_SEND=true`; set `"enabled": true` |
| LLM API key (any OpenAI-compatible provider) | Learning notes | **Paid per use** (capped by `maxPerRun`) | Secret `LLM_API_KEY`; optional variables `LLM_BASE_URL`, `LLM_MODEL`; set `summaries.enabled: true` |

Notes:

- Vercel Hobby blocks deployments of private-repo commits whose author isn't the account owner. That's why the workflow commits with your identity. A public repo avoids this, but then the `ops-state` branch (notified repo names and times) is public too.
- GitHub Actions on a private repo uses free minutes. The daily job takes about 2 minutes (around 60 minutes a month).
- GitHub may delay scheduled runs at busy times. Timestamps always show when collection actually happened.

## Suggested next steps (each needs your go-ahead)

1. Create the GitHub repo and push. CI runs tests on push.
2. Enable the daily workflow and run it once by hand (`workflow_dispatch`). This produces the first real snapshot. The site will show "No previous snapshot" until day two.
3. Connect Vercel to the repo.
4. Optional: Telegram, then LLM notes.
