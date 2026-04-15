# Plan 4 — Marketing Pages + Production Deployment

**Status:** approved for planning
**Date:** 2026-04-15
**Owner:** lz (liuz99004@gmail.com)
**Supersedes nothing; extends:** `2026-04-14-journal-basiscalc-xyz-design.md` §11 (marketing) + §12 (deployment), reconciled against Plan 3 actuals.

---

## 1. Goal

Ship `journal.basiscalc.xyz` to the public internet with a complete marketing experience. After this plan:

- Visitors land on `/` and can read About / Privacy / Terms pages in English
- The app is served from `/app` behind a Cloudflare-proxied HTTPS endpoint
- Code pushed to `main` deploys automatically via GitHub Actions → GHCR → SSH pull
- SQLite data is backed up nightly to Cloudflare R2
- UptimeRobot monitors both the app and the landing page at 5-minute intervals

**Out of scope (deferred to Plan 5):** Blog articles, Umami analytics, local-calcStats-driven violation aggregation in Dashboard, SSH hardening (disable root login, move SSH port), reintroducing Weekly Trend + Streak KPIs via extended calcStats, paid features, multi-region.

---

## 2. Inputs (frozen 2026-04-15)

| Item | Value |
|---|---|
| VPS | `root@198.23.244.159`, Ubuntu 24.04 LTS, 2.4GB RAM, 43GB disk, Docker 29.4 pre-installed, xray running on :8443, no Caddy, no non-root users |
| Domain | `journal.basiscalc.xyz` |
| DNS | `A journal → 198.23.244.159` already in Cloudflare, orange-cloud proxied. No wildcard records. Zone shared with basiscalc.xyz (on Cloudflare Pages via CNAME apex). |
| Contact email | `liuz99004@gmail.com` |
| Author handles | Twitter `@liuz99004`, GitHub `liugangdao`, on-chain wallet `0x86f046Bd858c679fEc72652cC082568E2bA7fFD4` |
| Resend API key | Stored in GH Secrets / VPS `.env.production` only. Never committed. User should rotate post-launch since key was shared via chat. |
| Turnstile site key | `0x4AAAAAAC92aXzxF0POyFp7` (public — bundled into client) |
| Turnstile secret | Stored in GH Secrets / VPS `.env.production` only |
| SSH connectivity | Works as root; Plan 4 creates a `lz` user for deploys, leaves root SSH enabled for this plan's manual ops |

Not yet obtained (collected during execution):
- Cloudflare Origin Certificate PEM + key (user issues via CF dashboard in Phase 2)
- Cloudflare R2 bucket + access credentials (user creates in Phase 3)
- UptimeRobot account + monitor config (user creates in Phase 3)
- GitHub `SSH_PRIVATE_KEY` repo secret (generated during Phase 3 by Claude, public key installed on VPS, private key pasted by user into repo Settings)

---

## 3. Architecture

### 3.1 Routing

The SPA serves four marketing routes and one app shell, all from one Vite bundle. The server returns `index.html` for any of them; `main.jsx` picks the root component by reading `window.location.pathname`:

```
pathname                   rendered
─────────────────────────  ─────────────────
/                          <LandingPage />     (existing)
/about                     <AboutPage />       (new)
/privacy                   <PrivacyPage />     (new)
/terms                     <TermsPage />       (new)
/app, /app/*               <App />             (existing)
```

All four marketing pages wrap a new `MarketingShell` that carries a sticky header (logo → `/`, `Sign in` button opening `SignInDialog`, `Open the app` CTA → `/app`) and a footer (About / Privacy / Terms links + copyright). `LandingPage` is refactored to use `MarketingShell`; its existing header is deleted.

Static assets (CSS, JS, images, favicon) are served by `express.static(server/public, { index: false })`. Every marketing route is wired explicitly on the server:

```js
app.get(['/', '/about', '/privacy', '/terms', '/app', '/app/*path'], sendIndex)
```

### 3.2 Containerization

**`Dockerfile`** — multi-stage build on `node:22-alpine`:

- **build stage:** install pnpm via corepack, `pnpm install --frozen-lockfile`, copy source, `pnpm run build` (produces `server/public/`), then install only server production deps
- **runtime stage:** add `tini` for signal handling, create `app` non-root user, copy `server/` + `server/node_modules/` only (no client source, no build tooling). Port 3001. CMD `node server/index.js` under tini.

Image target: <200MB. Build caches `node_modules` layers cleanly via lockfile-first copy.

**`docker-compose.yml`** — binds `127.0.0.1:3001:3001` only (Caddy handles :443 externally), mounts `./data:/app/data` (SQLite + WAL + SHM files + session store), reads `.env.production`, enforces `mem_limit: 512m`, configures json-file logs with 10MB × 3 rotation, and adds a healthcheck on `/api/health`.

**Secrets:** live in `.env.production` (gitignored, 600 perms on VPS). `.env.production.example` is committed with placeholder values. Client-build-time `VITE_TURNSTILE_SITE_KEY` is injected via Docker build arg (because Vite bakes it into the bundle at build time, not runtime).

### 3.3 Reverse proxy + TLS

**Caddy** terminates TLS at the VPS using a Cloudflare Origin Certificate (not Let's Encrypt — CF proxy blocks the HTTP-01 challenge). CF Origin Certs are signed by CF's private CA; they are trusted only when the connection comes through CF's proxy. Validity: 15 years. Covers `*.basiscalc.xyz, basiscalc.xyz`.

Cloudflare SSL/TLS mode must be **Full (strict)** so the CF → origin hop validates the cert. User flips this after the cert is uploaded to the VPS.

**`/etc/caddy/Caddyfile`:**

```
journal.basiscalc.xyz {
    tls /etc/caddy/origin-cert.pem /etc/caddy/origin-key.pem
    reverse_proxy 127.0.0.1:3001
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    log {
        output file /var/log/caddy/journal.log {
            roll_size 50mb
            roll_keep 5
        }
        format json
    }
}
```

### 3.4 Content Security Policy

Helmet's CSP was disabled in Plan 1 (`contentSecurityPolicy: false`). Plan 4 enables it with production-appropriate directives:

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://s3.tradingview.com https://s.tradingview.com` — inline needed for Vite's injected theme-bootstrap script + Turnstile/TradingView widget loaders
- `frame-src https://challenges.cloudflare.com https://s.tradingview.com` — widget iframes
- `connect-src 'self' https://api.resend.com` — Resend is server-side only but included for defense in depth
- `img-src 'self' data: https:` — TradingView dynamic image loading
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — Tailwind inline + Google Fonts
- `font-src 'self' https://fonts.gstatic.com`

CSP stays disabled in NODE_ENV=test and NODE_ENV=development (vitest & vite dev server need more permissive).

### 3.5 CI/CD

Two workflows in `.github/workflows/`:

**`ci.yml`** (runs on all pushes + PRs):
- Setup pnpm + node 22
- `pnpm install --frozen-lockfile`
- `pnpm test` — all 36 vitest tests must pass

**`deploy.yml`** (runs on push to `main`, needs `ci.yml` green):
- Log in to GHCR via `GITHUB_TOKEN` (automatic, no PAT needed)
- `docker build --build-arg VITE_TURNSTILE_SITE_KEY=... -t ghcr.io/liugangdao/journal:${sha} -t ghcr.io/liugangdao/journal:latest .`
- `docker push --all-tags`
- SSH to VPS as `lz`: `cd /home/lz/deploy/journal && docker compose pull && docker compose up -d && docker image prune -f`

Required repo secrets:
- `SSH_PRIVATE_KEY` — ed25519 private key (public half in `/home/lz/.ssh/authorized_keys` on VPS)
- `VPS_HOST` = `198.23.244.159`
- `VPS_USER` = `lz`
- `SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` — baked into `.env.production` on VPS + `VITE_TURNSTILE_SITE_KEY` passed as build arg

### 3.6 Backup

Daily cron at 03:00 UTC on VPS, running as `lz`:

```bash
#!/usr/bin/env bash
# /home/lz/deploy/journal/backup.sh
set -euo pipefail
STAMP=$(date -u +%Y-%m-%d)
TMP="/tmp/journal-${STAMP}.db"
sqlite3 "/home/lz/deploy/journal/data/journal.db" ".backup ${TMP}"
rclone copy --quiet "${TMP}" "r2:journal-backup/"
rm -f "${TMP}"
# Retention: delete R2 objects older than 30 days
rclone delete --quiet --min-age 30d "r2:journal-backup/"
```

Requires `apt install sqlite3 rclone` + `rclone config` pointing to R2 bucket `journal-backup` under a scoped API token.

### 3.7 Monitoring

UptimeRobot free tier:
- Monitor 1: `https://journal.basiscalc.xyz/api/health` (HEAD 200 expected)
- Monitor 2: `https://journal.basiscalc.xyz/` (HEAD 200 expected)
- Interval: 5 minutes
- Alerts: email (`liuz99004@gmail.com`)

---

## 4. Content (Marketing Pages)

All English. Strings in `en.ts` under new groups `en.about`, `en.privacy`, `en.terms`, and `en.marketing` (shared footer/header strings).

### 4.1 About (`/about`)

One-screen page:

> **About this journal**
>
> Built by **lz** — a discretionary trader who needed a tool that didn't exist.
>
> I trade forex, metals, and crypto perpetuals across multiple timeframes, and I got tired of copy-pasting numbers into spreadsheets. Every existing journal either tried to be a broker or buried the insights under feature bloat. So I built the one I wanted.
>
> This app is free forever. No paid tier. No membership. No in-app ads. If you find it useful, tell another trader.
>
> **Find me:**
> - Twitter [@liuz99004](https://twitter.com/liuz99004)
> - GitHub [liugangdao](https://github.com/liugangdao)
> - On-chain: `0x86f046Bd858c679fEc72652cC082568E2bA7fFD4` (read-only, public trading proof)
> - Parent site: [basiscalc.xyz](https://basiscalc.xyz)
> - Questions: [liuz99004@gmail.com](mailto:liuz99004@gmail.com)

### 4.2 Privacy (`/privacy`)

- **Effective date:** 2026-04-15
- **Local storage:** All your data starts in your browser (IndexedDB via Dexie). Nothing leaves your machine until you choose to sign in.
- **When you sign in:** We store your email and your trading data (trades, notes, policies, pair configs, rule-violation records) on our server so you can sync across devices. Session cookie: `httpOnly`, `SameSite=Lax`, 30-day expiry.
- **Third-party processors:**
  - **Resend** — sends your magic-link sign-in email. Receives your email address and a one-time token.
  - **Cloudflare** — CDN + Turnstile anti-abuse. Receives standard request metadata (IP, user-agent) that we never store beyond the CDN edge.
- **We don't use:** cookie-based analytics, ad networks, tracking pixels, third-party session replay, or marketing emails.
- **Your rights:** Export all your data as JSON anytime (Export button in the app). Delete your local copy anytime (clear browser storage). Delete your server account — email `liuz99004@gmail.com`.
- **Changes:** We'll post an updated date at the top of this page.

### 4.3 Terms (`/terms`)

- **Effective date:** 2026-04-15
- **Free forever:** The journal itself is free to use. No paid tier, no in-app ads. Marketing pages may display AdSense and affiliate links; the app shell at `/app` never will.
- **No financial advice:** This tool records and analyzes *your own* trading decisions. Nothing here is investment advice, tax advice, or a recommendation to trade any specific instrument.
- **Liability:** Provided as-is. Keep your own exports — we run daily backups but can't guarantee against data loss. Don't rely on this app as your only record of activity.
- **Acceptable use:** Don't attempt to reverse engineer, attack, abuse, or disrupt the service. Don't use it for unlawful activity. We may block accounts or IPs that do.
- **Changes:** We'll post an updated date at the top of this page.
- **Contact:** [liuz99004@gmail.com](mailto:liuz99004@gmail.com)

### 4.4 LandingPage refactor

`LandingPage.jsx` is restructured to consume `MarketingShell`. Existing header / footer JSX deleted (~30 lines). Footer links in `MarketingShell` replace the current `<a href="/about">` placeholders. Hero + feature cards + embedded demo dashboard + bottom CTA remain unchanged.

---

## 5. Phased rollout

Three milestones, each ending in a git tag. A failure or rollback only touches the phase that broke.

### Phase 1 — Local containerized prod (`plan-4-phase-1`)

Code changes only, no infra touched.

Deliverables:
- `client/src/components/{AboutPage,PrivacyPage,TermsPage,MarketingShell}.jsx`
- `client/src/main.jsx` extended routing
- `server/index.js` new static routes + CSP
- `client/src/i18n/en.ts` new groups
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.production.example`
- `README.md` Docker section update

Acceptance:
- `docker compose up --build` runs locally
- `curl http://localhost:3001/` returns landing HTML; `/about`, `/privacy`, `/terms`, `/app` all 200; `/api/health` 200
- Manual smoke: log a trade anonymously → sign in flow renders → magic-link POST reaches Resend in test mode
- `pnpm test` still 36/36 green

Rollback: revert the commit(s), delete the new files.

### Phase 2 — Manual VPS deploy (`plan-4-phase-2`)

Publishes to `journal.basiscalc.xyz`.

Steps (Claude SSHs; user performs the CF dashboard steps):
1. **Claude SSH on VPS:** create `lz` user + docker group + `~lz/.ssh/authorized_keys`; create `/home/lz/deploy/journal/{data}` with `lz:lz` ownership; configure ufw (`allow 22`, `80`, `443`, `8443`); `apt install caddy`
2. **User on CF dashboard:** SSL/TLS → Origin Server → Create Certificate for `*.basiscalc.xyz, basiscalc.xyz` (15-year validity). Paste both PEM + key into chat.
3. **Claude SSH:** write `/etc/caddy/{origin-cert,origin-key}.pem` (0600, `caddy:caddy`); install `/etc/caddy/Caddyfile`; `systemctl enable --now caddy`; verify `systemctl status caddy` is green.
4. **User on CF dashboard:** SSL/TLS overview → set mode to **Full (strict)**.
5. **Claude locally:** `docker save ghcr.io/liugangdao/journal:${sha} | ssh root@VPS 'docker load'` OR `docker build` on VPS after git clone. Use whichever is faster.
6. **Claude SSH:** write `/home/lz/deploy/journal/.env.production` (0600) with all secrets; write `docker-compose.yml`; `docker compose up -d` as `lz`.
7. **Smoke test:** `curl -sI https://journal.basiscalc.xyz/` returns 200; marketing routes + `/app` + `/api/health` reachable; magic-link e2e via real email to `liuz99004@gmail.com`.

Acceptance: `https://journal.basiscalc.xyz/` serves the landing page publicly.

Rollback: CF dashboard → pause/delete the `A journal` record OR change SSL mode back to Flexible; on VPS `docker compose down` + `systemctl stop caddy`. No data loss because SQLite volume is preserved.

### Phase 3 — Automation (`plan-4-complete`)

Deliverables:
- `.github/workflows/ci.yml` + `deploy.yml`
- SSH deploy key generated, public half installed on VPS, private half added to repo secrets
- `SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` added to repo secrets
- `backup.sh` + `crontab` + rclone R2 config on VPS
- UptimeRobot 2 monitors
- `docs/RUNBOOK.md` with disaster-recovery steps

Acceptance:
- Trivial `main` push → GH Actions green → new image on GHCR → VPS auto-pulls → `journal.basiscalc.xyz` reflects change without Claude SSHing
- R2 bucket contains yesterday's `.db` snapshot after the first cron run
- UptimeRobot dashboard shows both monitors "Up"

Rollback: disable workflows in Actions settings; deploy manually via Phase 2 procedure if needed.

---

## 6. Known risks & mitigations

| Risk | Mitigation |
|---|---|
| CF SSL mode stays Flexible after cert upload → browser sees CF's cert but CF↔origin is HTTP → redirect loop or mixed-content | Spec §5 Phase 2 step 4 is a dedicated gate; Claude smoke-tests after user flips the mode |
| CSP too strict → TradingView widget breaks | Dev + prod tested side-by-side in Phase 1 acceptance; CSP disabled in dev so only prod image surfaces the strict policy |
| Docker image grows past 512MB RAM limit → OOM on VPS under load | `mem_limit: 512m` is sized for Plan 4 traffic (~tens of users). Plan 5 Umami adds 200MB — still fits. Alert via UptimeRobot if container crashes. |
| Magic-link email fails in prod because Resend sender domain not verified | User runs Resend domain-verification separately (outside this plan); blocks Phase 2 acceptance if not done |
| GH Actions `GITHUB_TOKEN` package scope misconfigured → GHCR push fails | Test by pushing a throwaway image first; known-good permission is `packages: write` on the workflow job |
| CF Origin Cert expires in 15 years → no one remembers | Documented in `RUNBOOK.md`; calendar reminder set for 2041 |
| User forgets to flip CF SSL mode → 525 or 526 errors | Phase 2 acceptance is gated on user confirming "Full (strict)" in dashboard |
| wildcard records we didn't notice | DNS dump already confirmed no `* →` record on 2026-04-15 |

---

## 7. What stays the same

- The entire React app (App.jsx, hooks, components) — Plan 3 as-is
- LocalStore + ApiStore + useStore + useStoreAdapter
- Schema (migrations folder untouched)
- Authentication (magic-link flow, Turnstile verification)
- i18n structure (we only add new groups)
- Existing 36 tests + existing sample-mode demo

---

## 8. Open items

None blocking. The following are collected *during execution* and tracked in the implementation plan:

- Cloudflare Origin Certificate PEM + key
- R2 bucket name + access token
- UptimeRobot account credentials
- Resend sender domain DNS records (SPF + DKIM) — separate one-time task from the user
- Calendar reminder for Origin Cert renewal in 2041

---

*End of spec.*
