# Plan 4 — Marketing Pages + Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `journal.basiscalc.xyz` to the public internet behind Cloudflare with a complete marketing site (About/Privacy/Terms), automatic deploy via GitHub Actions, daily SQLite backups to R2, and UptimeRobot monitoring.

**Architecture:** Plan 3's React SPA stays unchanged in `/app`. Three new marketing React pages at `/about` `/privacy` `/terms` share a `MarketingShell`. Server serves one `index.html` for all marketing routes; `main.jsx` picks the component via `window.location.pathname`. The stack is containerized with a multi-stage Dockerfile (`node:22-bookworm-slim`), fronted by Caddy on the VPS terminating TLS with a Cloudflare Origin Certificate, reached over a CF-proxied (orange-cloud) A record. CI/CD: GH Actions builds and pushes to GHCR, SSHes to VPS, `docker compose pull && up -d`.

**Tech Stack:** React 19, Vite 7, Tailwind 4, Express 5, SQLite (better-sqlite3), Docker Compose, Caddy, Cloudflare Origin Cert, Cloudflare R2 + rclone, UptimeRobot, GitHub Actions, GHCR.

**Spec:** `docs/superpowers/specs/2026-04-15-plan-4-deployment-design.md`

**Starting state:** tag `plan-3-complete-v2` at commit `314f207`. 36 tests passing. Marketing landing page at `/` already lives at `client/src/components/LandingPage.jsx` with `<Dashboard trades={SAMPLE_TRADES}/>` embedded.

**Executor roles:** Most tasks are pure code (Claude). Phase 2 tasks 8-10 mix Claude-SSH operations with explicit user actions in the Cloudflare dashboard / GitHub Settings. Each step is labeled `[Claude]`, `[User]`, or `[Claude SSH]`.

---

## File Structure

New files:
```
client/src/components/MarketingShell.jsx
client/src/components/AboutPage.jsx
client/src/components/PrivacyPage.jsx
client/src/components/TermsPage.jsx
Dockerfile
docker-compose.yml
.dockerignore
.env.production.example
.github/workflows/ci.yml
.github/workflows/deploy.yml
docs/RUNBOOK.md
```

Modified files:
```
client/src/main.jsx                    path-based routing for /about /privacy /terms
client/src/components/LandingPage.jsx  refactor to use MarketingShell
client/src/i18n/en.ts                  add about/privacy/terms/marketing groups; fix PWA manifest later
client/src/vite.config.js              PWA manifest English strings
server/index.js                        add marketing routes; prod-env Helmet CSP
.gitignore                             add .env.production
```

VPS files (created via Claude SSH during Phase 2):
```
/etc/caddy/Caddyfile
/etc/caddy/origin-cert.pem
/etc/caddy/origin-key.pem
/home/lz/deploy/journal/docker-compose.yml
/home/lz/deploy/journal/.env.production
/home/lz/deploy/journal/backup.sh
```

---

## Phase 1 — Local containerized production

Tasks 1-6 produce a production Docker image you can verify on your laptop before anything touches the VPS. Nothing in this phase reaches the internet.

### Task 1: Create MarketingShell + expand i18n

**Files:**
- Create: `client/src/components/MarketingShell.jsx`
- Modify: `client/src/i18n/en.ts`

The shell is the sticky header + footer wrapper used by `LandingPage`, `AboutPage`, `PrivacyPage`, `TermsPage`. It owns the `SignInDialog` state, theme toggle, and footer links. The footer links use real paths `/about` `/privacy` `/terms` (not `#` placeholders).

- [ ] **Step 1: Add i18n keys.** Open `client/src/i18n/en.ts`. After the `landing` group, before the `demo` group, insert these groups:

```ts
  about: {
    title: 'About',
    intro: 'Built by {author} — a discretionary trader who needed a tool that didn\'t exist.',
    body: 'I trade forex, metals, and crypto perpetuals across multiple timeframes, and I got tired of copy-pasting numbers into spreadsheets. Every existing journal either tried to be a broker or buried the insights under feature bloat. So I built the one I wanted.',
    free: 'This app is free forever. No paid tier. No membership. No in-app ads. If you find it useful, tell another trader.',
    findMe: 'Find me',
    twitter: 'Twitter',
    github: 'GitHub',
    onchain: 'On-chain wallet',
    onchainDesc: 'Read-only. Public trading proof.',
    parent: 'Parent site',
    contact: 'Questions',
  },
  privacy: {
    title: 'Privacy',
    effective: 'Effective 2026-04-15',
    localTitle: 'Local storage',
    localBody: 'All your data starts in your browser (IndexedDB via Dexie). Nothing leaves your machine until you choose to sign in.',
    serverTitle: 'When you sign in',
    serverBody: 'We store your email and your trading data (trades, notes, policies, pair configs, rule-violation records) on our server so you can sync across devices. Session cookie: httpOnly, SameSite=Lax, 30-day expiry.',
    thirdTitle: 'Third-party processors',
    thirdResend: 'Resend — sends your magic-link sign-in email. Receives your email address and a one-time token.',
    thirdCloudflare: 'Cloudflare — CDN + Turnstile anti-abuse. Receives standard request metadata (IP, user-agent) that we never store beyond the CDN edge.',
    noTitle: 'We don\'t use',
    noBody: 'Cookie-based analytics, ad networks, tracking pixels, third-party session replay, or marketing emails.',
    rightsTitle: 'Your rights',
    rightsExport: 'Export all your data as JSON anytime (Export button in the app).',
    rightsDelete: 'Delete your local copy anytime (clear browser storage).',
    rightsAccount: 'Delete your server account — email us.',
    changesTitle: 'Changes',
    changesBody: 'We\'ll post an updated date at the top of this page.',
  },
  terms: {
    title: 'Terms',
    effective: 'Effective 2026-04-15',
    freeTitle: 'Free forever',
    freeBody: 'The journal itself is free to use. No paid tier, no in-app ads. Marketing pages may display AdSense and affiliate links; the app shell at /app never will.',
    adviceTitle: 'No financial advice',
    adviceBody: 'This tool records and analyzes your own trading decisions. Nothing here is investment advice, tax advice, or a recommendation to trade any specific instrument.',
    liabilityTitle: 'Liability',
    liabilityBody: 'Provided as-is. Keep your own exports — we run daily backups but can\'t guarantee against data loss. Don\'t rely on this app as your only record of activity.',
    useTitle: 'Acceptable use',
    useBody: 'Don\'t attempt to reverse engineer, attack, abuse, or disrupt the service. Don\'t use it for unlawful activity. We may block accounts or IPs that do.',
    changesTitle: 'Changes',
    changesBody: 'We\'ll post an updated date at the top of this page.',
    contact: 'Contact',
  },
  marketing: {
    nav: {
      about: 'About',
      privacy: 'Privacy',
      terms: 'Terms',
    },
    footerTagline: 'Built for traders, by a trader.',
  },
```

- [ ] **Step 2: Author-identity constants.** Still inside `en.ts`, replace the `en.landing` block's `footerTagline` key (if present — delete it) to avoid duplication. The `marketing.footerTagline` subsumes it.

- [ ] **Step 3: Create MarketingShell.**

```jsx
// client/src/components/MarketingShell.jsx
import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import SignInDialog from './SignInDialog'
import { useTheme } from '../hooks/useTheme'
import { en } from '../i18n/en'

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-lg text-muted hover:text-text hover:bg-hover transition-all duration-200 cursor-pointer"
      aria-label={theme === 'dark' ? en.more.themeLight : en.more.themeDark}
    >
      {theme === 'dark' ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
    </button>
  )
}

export default function MarketingShell({ children }) {
  const { theme, toggleTheme } = useTheme()
  const [signInOpen, setSignInOpen] = useState(false)
  const goToApp = () => { window.location.href = '/app' }

  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-header-bg/80 border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <a href="/" className="flex items-baseline gap-2 cursor-pointer group">
            <span className="text-lg font-bold tracking-tight group-hover:text-accent transition-colors">{en.app.titleShort}</span>
            <span className="hidden sm:inline text-[11px] text-muted">{en.app.tagline}</span>
          </a>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button
              onClick={() => setSignInOpen(true)}
              className="text-sm text-muted hover:text-text px-3 py-1.5 rounded-lg hover:bg-hover transition-colors cursor-pointer"
            >
              {en.landing.navSignIn}
            </button>
            <button
              onClick={goToApp}
              className="text-sm font-semibold bg-accent text-white px-4 py-1.5 rounded-lg hover:brightness-110 transition-all cursor-pointer"
            >
              {en.landing.navTryFree}
            </button>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <div>© {new Date().getFullYear()} {en.app.titleShort} · {en.marketing.footerTagline}</div>
          <div className="flex items-center gap-5">
            <a href="/about" className="hover:text-text transition-colors">{en.marketing.nav.about}</a>
            <a href="/privacy" className="hover:text-text transition-colors">{en.marketing.nav.privacy}</a>
            <a href="/terms" className="hover:text-text transition-colors">{en.marketing.nav.terms}</a>
          </div>
        </div>
      </footer>

      {signInOpen && <SignInDialog onClose={() => setSignInOpen(false)} />}
    </div>
  )
}
```

- [ ] **Step 4: Verify compile.**

```bash
cd /home/lz/workspace/journal && pnpm test 2>&1 | tail -6
```

Expected: 36/36 passing.

- [ ] **Step 5: Commit.**

```bash
git add client/src/i18n/en.ts client/src/components/MarketingShell.jsx
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat(plan-4): MarketingShell + about/privacy/terms/marketing i18n groups

Shared sticky header (logo + SignInDialog + Open-the-app CTA) and
footer (nav links + copyright) for the four marketing routes.
Strings for the three new pages added to en.ts; LandingPage
refactor follows in Task 5.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: AboutPage

**Files:**
- Create: `client/src/components/AboutPage.jsx`

Single-screen content page. No state. No conditional rendering.

- [ ] **Step 1: Create AboutPage.**

```jsx
// client/src/components/AboutPage.jsx
import MarketingShell from './MarketingShell'
import { en } from '../i18n/en'

const AUTHOR = 'lz'
const TWITTER = 'liuz99004'
const GITHUB = 'liugangdao'
const WALLET = '0x86f046Bd858c679fEc72652cC082568E2bA7fFD4'
const EMAIL = 'liuz99004@gmail.com'
const PARENT = 'https://basiscalc.xyz'

export default function AboutPage() {
  return (
    <MarketingShell>
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{en.about.title}</h1>
        <p className="text-lg leading-relaxed">{en.about.intro.replace('{author}', AUTHOR)}</p>
        <p className="text-sm text-muted leading-relaxed">{en.about.body}</p>
        <p className="text-sm leading-relaxed">{en.about.free}</p>

        <section className="pt-6 border-t border-border">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">{en.about.findMe}</h2>
          <ul className="space-y-2 text-sm">
            <li>
              {en.about.twitter}: <a className="text-accent hover:underline" href={`https://twitter.com/${TWITTER}`} rel="noopener noreferrer" target="_blank">@{TWITTER}</a>
            </li>
            <li>
              {en.about.github}: <a className="text-accent hover:underline" href={`https://github.com/${GITHUB}`} rel="noopener noreferrer" target="_blank">{GITHUB}</a>
            </li>
            <li className="break-all">
              {en.about.onchain}: <code className="text-xs bg-card border border-border px-1.5 py-0.5 rounded">{WALLET}</code>
              <span className="block text-xs text-muted mt-1">{en.about.onchainDesc}</span>
            </li>
            <li>
              {en.about.parent}: <a className="text-accent hover:underline" href={PARENT} rel="noopener noreferrer" target="_blank">basiscalc.xyz</a>
            </li>
            <li>
              {en.about.contact}: <a className="text-accent hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </li>
          </ul>
        </section>
      </article>
    </MarketingShell>
  )
}
```

- [ ] **Step 2: Verify.**

```bash
cd /home/lz/workspace/journal && pnpm test 2>&1 | tail -6
```

Expected: 36/36 passing.

- [ ] **Step 3: Commit.**

```bash
git add client/src/components/AboutPage.jsx
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat(plan-4): AboutPage with pseudonym lz, Twitter, GitHub, wallet, email

Plain static content. MarketingShell supplies the chrome.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PrivacyPage

**Files:**
- Create: `client/src/components/PrivacyPage.jsx`

- [ ] **Step 1: Create PrivacyPage.**

```jsx
// client/src/components/PrivacyPage.jsx
import MarketingShell from './MarketingShell'
import { en } from '../i18n/en'

const EMAIL = 'liuz99004@gmail.com'

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-sm text-muted leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <header>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{en.privacy.title}</h1>
          <p className="text-xs text-muted mt-2">{en.privacy.effective}</p>
        </header>

        <Section title={en.privacy.localTitle}>
          <p>{en.privacy.localBody}</p>
        </Section>

        <Section title={en.privacy.serverTitle}>
          <p>{en.privacy.serverBody}</p>
        </Section>

        <Section title={en.privacy.thirdTitle}>
          <ul className="list-disc pl-5 space-y-1">
            <li>{en.privacy.thirdResend}</li>
            <li>{en.privacy.thirdCloudflare}</li>
          </ul>
        </Section>

        <Section title={en.privacy.noTitle}>
          <p>{en.privacy.noBody}</p>
        </Section>

        <Section title={en.privacy.rightsTitle}>
          <ul className="list-disc pl-5 space-y-1">
            <li>{en.privacy.rightsExport}</li>
            <li>{en.privacy.rightsDelete}</li>
            <li>
              {en.privacy.rightsAccount} <a className="text-accent hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a>
            </li>
          </ul>
        </Section>

        <Section title={en.privacy.changesTitle}>
          <p>{en.privacy.changesBody}</p>
        </Section>
      </article>
    </MarketingShell>
  )
}
```

- [ ] **Step 2: Verify.**

```bash
pnpm test 2>&1 | tail -6
```

Expected: 36/36 passing.

- [ ] **Step 3: Commit.**

```bash
git add client/src/components/PrivacyPage.jsx
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat(plan-4): PrivacyPage covering local-first + Resend + Cloudflare

Sections: local storage, sign-in data, third-party processors,
what we don't use, user rights (export/delete/account), changes.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: TermsPage

**Files:**
- Create: `client/src/components/TermsPage.jsx`

- [ ] **Step 1: Create TermsPage.**

```jsx
// client/src/components/TermsPage.jsx
import MarketingShell from './MarketingShell'
import { en } from '../i18n/en'

const EMAIL = 'liuz99004@gmail.com'

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="text-sm text-muted leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <MarketingShell>
      <article className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-6">
        <header>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{en.terms.title}</h1>
          <p className="text-xs text-muted mt-2">{en.terms.effective}</p>
        </header>

        <Section title={en.terms.freeTitle}><p>{en.terms.freeBody}</p></Section>
        <Section title={en.terms.adviceTitle}><p>{en.terms.adviceBody}</p></Section>
        <Section title={en.terms.liabilityTitle}><p>{en.terms.liabilityBody}</p></Section>
        <Section title={en.terms.useTitle}><p>{en.terms.useBody}</p></Section>
        <Section title={en.terms.changesTitle}><p>{en.terms.changesBody}</p></Section>

        <Section title={en.terms.contact}>
          <p><a className="text-accent hover:underline" href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
        </Section>
      </article>
    </MarketingShell>
  )
}
```

- [ ] **Step 2: Verify.**

```bash
pnpm test 2>&1 | tail -6
```

Expected: 36/36 passing.

- [ ] **Step 3: Commit.**

```bash
git add client/src/components/TermsPage.jsx
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat(plan-4): TermsPage covering free-forever, disclaimer, liability

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire routing + LandingPage refactor + PWA English

**Files:**
- Modify: `client/src/main.jsx`
- Modify: `client/src/components/LandingPage.jsx`
- Modify: `server/index.js`
- Modify: `client/vite.config.js`

Plumbs the four marketing routes through `main.jsx`, refactors LandingPage to use MarketingShell, converts PWA manifest to English, and adds marketing routes on the server with env-gated Helmet CSP.

- [ ] **Step 1: Update main.jsx.**

Replace the existing routing block:

```jsx
// client/src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import LandingPage from './components/LandingPage'
import AboutPage from './components/AboutPage'
import PrivacyPage from './components/PrivacyPage'
import TermsPage from './components/TermsPage'

function pickRoot(pathname) {
  if (pathname === '/app' || pathname.startsWith('/app/')) return <App />
  if (pathname === '/about') return <AboutPage />
  if (pathname === '/privacy') return <PrivacyPage />
  if (pathname === '/terms') return <TermsPage />
  return <LandingPage />
}

const pathname = typeof window !== 'undefined' ? window.location.pathname : '/'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {pickRoot(pathname)}
  </StrictMode>
)
```

- [ ] **Step 2: Refactor LandingPage to use MarketingShell.**

Edit `client/src/components/LandingPage.jsx`. Remove the existing header, footer, ThemeToggle component, `signInOpen` state, `useTheme` hook, and trailing `<SignInDialog>` — MarketingShell owns these. The remaining content (hero + features + demo + bottom CTA) is wrapped in `<MarketingShell>`.

Full replacement:

```jsx
// client/src/components/LandingPage.jsx
import { ArrowRight, BookOpen, BarChart3, ShieldCheck, Lock } from 'lucide-react'
import Dashboard from './Dashboard'
import MarketingShell from './MarketingShell'
import { SAMPLE_TRADES } from '../lib/sampleTrades'
import { DEFAULT_PAIRS } from '../lib/defaults'
import { useTheme } from '../hooks/useTheme'
import { en } from '../i18n/en'

function FeatureCard({ icon: Icon, title, body }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6 hover:border-accent/40 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted leading-relaxed">{body}</p>
    </div>
  )
}

export default function LandingPage() {
  const { theme } = useTheme()
  const goToApp = () => { window.location.href = '/app' }

  return (
    <MarketingShell>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <div className="inline-block text-xs font-semibold tracking-wider text-accent uppercase mb-4">
          {en.landing.heroEyebrow}
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 max-w-4xl mx-auto leading-tight">
          {en.landing.heroTitle}
        </h1>
        <p className="text-base sm:text-lg text-muted max-w-2xl mx-auto mb-8 leading-relaxed">
          {en.landing.heroSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={goToApp}
            className="group bg-accent text-white px-7 py-3.5 rounded-xl text-base font-semibold cursor-pointer hover:brightness-110 transition-all duration-200 flex items-center gap-2"
          >
            {en.landing.heroCta}
            <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
        <p className="text-xs text-muted mt-4">{en.landing.heroCtaSub}</p>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">{en.landing.featuresTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard icon={BookOpen} title={en.landing.feature1Title} body={en.landing.feature1Body} />
          <FeatureCard icon={BarChart3} title={en.landing.feature2Title} body={en.landing.feature2Body} />
          <FeatureCard icon={ShieldCheck} title={en.landing.feature3Title} body={en.landing.feature3Body} />
          <FeatureCard icon={Lock} title={en.landing.feature4Title} body={en.landing.feature4Body} />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">{en.landing.demoTitle}</h2>
          <p className="text-sm text-muted max-w-xl mx-auto">{en.landing.demoSubtitle}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-lg">
          <Dashboard
            trades={SAMPLE_TRADES}
            pairs={DEFAULT_PAIRS}
            theme={theme}
          />
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-3">{en.landing.ctaTitle}</h2>
        <p className="text-sm text-muted mb-6">{en.landing.ctaSubtitle}</p>
        <button
          onClick={goToApp}
          className="group bg-accent text-white px-7 py-3.5 rounded-xl text-base font-semibold cursor-pointer hover:brightness-110 transition-all duration-200 inline-flex items-center gap-2"
        >
          {en.landing.ctaButton}
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </button>
      </section>
    </MarketingShell>
  )
}
```

- [ ] **Step 3: Update server/index.js — marketing routes + env-gated CSP.**

Find the existing static-serving block (after the auth / data routes, where `app.get('/', sendIndex)` lives). Replace with:

```js
// Static SPA assets (js/css/images). index:false so `/` doesn't auto-serve
// index.html — the explicit routes below decide which bundle entry renders.
app.use(express.static(path.join(__dirname, 'public'), { index: false }))

// Every marketing route + the app shell serves the same SPA bundle;
// main.jsx reads window.location.pathname at mount to pick the root.
function sendIndex(_req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
}
app.get(['/', '/about', '/privacy', '/terms', '/app', '/app/*path'], sendIndex)
```

Then find the existing `app.use(helmet({ contentSecurityPolicy: false }))` call near the top of the file and replace with:

```js
const isProd = process.env.NODE_ENV === 'production'
app.use(helmet({
  contentSecurityPolicy: isProd
    ? {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://challenges.cloudflare.com',
            'https://s3.tradingview.com',
            'https://s.tradingview.com',
          ],
          frameSrc: [
            'https://challenges.cloudflare.com',
            'https://s.tradingview.com',
          ],
          connectSrc: ["'self'", 'https://api.resend.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        },
      }
    : false,
}))
```

- [ ] **Step 4: PWA manifest → English.** Edit `client/vite.config.js`. In the `VitePWA({ manifest: ... })` block replace:

```js
      manifest: {
        name: 'Trading Journal',
        short_name: 'Journal',
        description: 'Forex, metals, and crypto perp trading journal. Works anonymously in your browser.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
```

- [ ] **Step 5: Run tests + build.**

```bash
cd /home/lz/workspace/journal && pnpm test 2>&1 | tail -6
cd /home/lz/workspace/journal/client && pnpm run build 2>&1 | tail -10
```

Expected: 36/36 passing; vite build reports success.

- [ ] **Step 6: Dev smoke.**

```bash
cd /home/lz/workspace/journal
rm -f data/journal.db data/journal.db-shm data/journal.db-wal
RESEND_API_KEY=dummy TURNSTILE_SECRET=dummy SESSION_SECRET=test \
  NODE_ENV=test BASE_URL=http://localhost:3001 \
  pnpm run dev > /tmp/plan4-t5.log 2>&1 &
DEV=$!
sleep 10
for p in / /about /privacy /terms /app; do
  curl -s --noproxy '*' -o /dev/null -w "$p  %{http_code}\n" http://localhost:3001${p}
done
kill $DEV 2>/dev/null
```

Expected: every path returns `200`.

- [ ] **Step 7: Commit + restore server/public artifacts.**

Vite's build writes to `server/public/`. Revert any cosmetic changes to `server/public/` (those are build outputs, tracked by mistake from Plan 1):

```bash
git checkout -- server/public/ 2>/dev/null || true
git add client/src/main.jsx client/src/components/LandingPage.jsx server/index.js client/vite.config.js
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat(plan-4): wire /about /privacy /terms routes + prod Helmet CSP + English PWA

main.jsx switches on pathname to pick LandingPage / AboutPage /
PrivacyPage / TermsPage / App. server/index.js registers the same
four marketing routes plus /app and /app/*path as aliases of
sendFile(index.html), and turns on a production-only Content
Security Policy covering Turnstile, TradingView, Resend, and
Google Fonts. LandingPage refactored to use MarketingShell so all
four marketing pages share one header + footer. PWA manifest
translated (name/short_name/description).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Dockerfile + compose + local prod run + tag plan-4-phase-1

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`
- Create: `.env.production.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create .dockerignore.**

```
node_modules
client/node_modules
server/node_modules
**/.git
**/.github
**/docs
**/*.md
!README.md
data
**/*.db
**/*.db-*
.env
.env.local
.env.production
**/__tests__
coverage
/tmp
*.log
.DS_Store
```

- [ ] **Step 2: Create Dockerfile (multi-stage, node:22-bookworm-slim).**

```dockerfile
# syntax=docker/dockerfile:1.7
# --- build ---
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Manifests first so the dep layer caches independently of source
COPY package.json pnpm-lock.yaml ./
COPY client/package.json client/pnpm-lock.yaml client/
COPY server/package.json server/pnpm-lock.yaml server/

RUN pnpm install --frozen-lockfile --dir .
RUN pnpm install --frozen-lockfile --dir client
RUN pnpm install --frozen-lockfile --dir server

# Source
COPY . .

# Client build bakes VITE_TURNSTILE_SITE_KEY into the bundle
ARG VITE_TURNSTILE_SITE_KEY
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
RUN pnpm --dir client run build

# Prune to prod-only server deps for the runtime copy
RUN pnpm --dir server install --frozen-lockfile --prod

# --- runtime ---
FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r app && useradd -r -g app app \
 && mkdir -p /app/data && chown -R app:app /app

COPY --from=build --chown=app:app /app/server ./server

USER app
ENV NODE_ENV=production PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
```

- [ ] **Step 3: Create docker-compose.yml (local dev form: builds from source).**

```yaml
services:
  app:
    build:
      context: .
      args:
        VITE_TURNSTILE_SITE_KEY: ${VITE_TURNSTILE_SITE_KEY}
    image: journal-local
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
    volumes:
      - ./data:/app/data
    env_file: .env.production
    mem_limit: 512m
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

- [ ] **Step 4: Create .env.production.example (committed; real `.env.production` never committed).**

```
NODE_ENV=production
PORT=3001
SESSION_SECRET=CHANGE_ME_64_RANDOM_CHARS
RESEND_API_KEY=CHANGE_ME_re_xxx
TURNSTILE_SECRET=CHANGE_ME_0x4AAA_xxx
VITE_TURNSTILE_SITE_KEY=0x4AAAAAAC92aXzxF0POyFp7
BASE_URL=https://journal.basiscalc.xyz
```

- [ ] **Step 5: Update .gitignore.**

Append to existing `.gitignore`:

```
# Plan 4 — production env vars (real secrets)
.env.production
```

- [ ] **Step 6: Create local .env.production (NOT committed).**

```bash
cd /home/lz/workspace/journal
cat > .env.production <<'EOF'
NODE_ENV=production
PORT=3001
SESSION_SECRET=local-dev-session-secret-do-not-use-in-prod-just-a-placeholder
RESEND_API_KEY=dummy
TURNSTILE_SECRET=dummy
VITE_TURNSTILE_SITE_KEY=0x4AAAAAAC92aXzxF0POyFp7
BASE_URL=http://localhost:3001
EOF
chmod 600 .env.production
```

- [ ] **Step 7: Build and run locally.**

```bash
export VITE_TURNSTILE_SITE_KEY=0x4AAAAAAC92aXzxF0POyFp7
docker compose up --build -d
sleep 20
docker compose logs app --tail=20
```

Expected: image builds in ~2-4 minutes, container starts, logs show `[db] applied migration 0001_init` and `[server] listening on :3001`.

- [ ] **Step 8: Smoke test.**

```bash
for p in / /about /privacy /terms /app /api/health; do
  curl -s --noproxy '*' -o /dev/null -w "$p  %{http_code}\n" http://localhost:3001${p}
done
```

Expected: every path returns `200`.

- [ ] **Step 9: Inspect CSP header (production CSP must be present).**

```bash
curl -sI --noproxy '*' http://localhost:3001/ | grep -i content-security-policy
```

Expected: a `content-security-policy:` header with `default-src 'self'` and the Cloudflare / TradingView / Resend domains listed.

- [ ] **Step 10: Teardown local container (keep data volume).**

```bash
docker compose down
```

- [ ] **Step 11: Commit + tag.**

```bash
cd /home/lz/workspace/journal
git checkout -- server/public/ 2>/dev/null || true
git add Dockerfile docker-compose.yml .dockerignore .env.production.example .gitignore
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "feat(plan-4): Dockerfile + compose for local production verification

Multi-stage Dockerfile on node:22-bookworm-slim (bookworm — not
alpine — because better-sqlite3 native module compiles against
glibc; alpine/musl needs extra care). Build stage installs pnpm
deps for root + client + server, runs vite build to emit
server/public, then prunes server to prod-only. Runtime stage
ships tini + wget + a non-root app user; exposes 3001; includes
a /api/health healthcheck.

docker-compose.yml binds 127.0.0.1:3001 only (Caddy will front
in Phase 2), mounts ./data for SQLite WAL persistence, enforces
512MB memlimit, reads .env.production (gitignored; example
committed as .env.production.example).

Local acceptance: all marketing routes + /app + /api/health
return 200 from the container, and the production CSP header is
present on marketing pages.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git tag -a plan-4-phase-1 -m "Plan 4 Phase 1 — local containerized prod"
git push && git push --tags
```

---

## Phase 2 — Manual VPS deploy

Tasks 7-9 take the Phase 1 image live at `journal.basiscalc.xyz`. Mix of Claude SSH ops and user dashboard steps.

### Task 7: VPS bootstrap — user, directories, ufw, Caddy install

**Files:** no local repo changes. Creates on VPS:
- User `lz` with docker group membership
- `/home/lz/deploy/journal/{data}` owned by `lz:lz`
- `/home/lz/.ssh/authorized_keys` seeded with your existing root key
- ufw enabled with rules for 22 / 80 / 443 / 8443
- Caddy installed and running (default landing page, no site configured yet)

- [ ] **Step 1: [Claude SSH] Create deploy user + docker group.**

```bash
ssh root@198.23.244.159 'set -e
  adduser --disabled-password --gecos "" lz
  usermod -aG docker lz
  install -d -o lz -g lz -m 0755 /home/lz/deploy /home/lz/deploy/journal /home/lz/deploy/journal/data
  install -d -o lz -g lz -m 0700 /home/lz/.ssh
  cp /root/.ssh/authorized_keys /home/lz/.ssh/authorized_keys
  chown lz:lz /home/lz/.ssh/authorized_keys
  chmod 600 /home/lz/.ssh/authorized_keys
  id lz
  ls -la /home/lz/deploy/
'
```

Expected output ends with `uid=1000(lz) gid=1000(lz) groups=1000(lz),999(docker)` and three directories listed.

- [ ] **Step 2: [Claude SSH] Verify lz can run docker.**

```bash
ssh root@198.23.244.159 'sudo -u lz docker ps'
```

Expected: empty table header (no containers yet) with exit 0. If "permission denied" — the docker group didn't take effect; `ssh root@VPS 'getent group docker'` and re-add `lz` if needed.

- [ ] **Step 3: [Claude SSH] Configure ufw.**

```bash
ssh root@198.23.244.159 'set -e
  apt-get update
  apt-get install -y ufw
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 8443/tcp
  ufw --force enable
  ufw status verbose
'
```

Expected: `Status: active`, rules for 22, 80, 443, 8443 listed as ALLOW IN.

- [ ] **Step 4: [Claude SSH] Install Caddy from the official repo.**

```bash
ssh root@198.23.244.159 'set -e
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
  caddy version
  systemctl status caddy --no-pager | head -10
'
```

Expected: `caddy version` prints v2.x; `systemctl status` shows `active (running)`. Caddy auto-started with the default Caddyfile serving `http://localhost` — harmless, we'll replace it in Task 8.

- [ ] **Step 5: Commit progress note.**

No code changes in this task. Move on to Task 8.

---

### Task 8: Cloudflare Origin Certificate + Caddyfile

**Files:** on VPS only.

- [ ] **Step 1: [User — Cloudflare dashboard] Issue Origin Certificate.**

Instructions to relay to the user (do not execute — user performs these in a browser):

1. Go to `https://dash.cloudflare.com/` → select the `basiscalc.xyz` zone.
2. Left sidebar → **SSL/TLS** → **Origin Server**.
3. Click **Create Certificate**.
4. Leave "Let Cloudflare generate a private key and a CSR" selected.
5. Hostnames field: `*.basiscalc.xyz, basiscalc.xyz` (both required).
6. Certificate validity: **15 years**.
7. Click **Create**.
8. Two text boxes appear: **Origin Certificate** (PEM) and **Private Key**. Paste BOTH into the chat — Claude writes them to the VPS.

- [ ] **Step 2: [Claude SSH] Write cert + key on VPS.**

After the user pastes PEM and key, save them to temp files locally then scp. Replace `<PEM>` and `<KEY>` blocks below with actual content received:

```bash
# Run on the local workstation:
cat > /tmp/origin-cert.pem <<'PEM'
<PASTE Origin Certificate content here, including -----BEGIN CERTIFICATE----- and -----END CERTIFICATE------>
PEM

cat > /tmp/origin-key.pem <<'KEY'
<PASTE Private Key content here, including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----->
KEY

# Push to VPS and install with correct perms
scp /tmp/origin-cert.pem /tmp/origin-key.pem root@198.23.244.159:/etc/caddy/
ssh root@198.23.244.159 'set -e
  chown caddy:caddy /etc/caddy/origin-cert.pem /etc/caddy/origin-key.pem
  chmod 644 /etc/caddy/origin-cert.pem
  chmod 600 /etc/caddy/origin-key.pem
  ls -l /etc/caddy/origin-*.pem
'

# Wipe local copies
shred -u /tmp/origin-cert.pem /tmp/origin-key.pem 2>/dev/null || rm -f /tmp/origin-cert.pem /tmp/origin-key.pem
```

Expected: both files exist on VPS with correct owner/perms.

- [ ] **Step 3: [Claude SSH] Install Caddyfile.**

```bash
ssh root@198.23.244.159 'cat > /etc/caddy/Caddyfile <<"CFG"
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
CFG
mkdir -p /var/log/caddy
chown caddy:caddy /var/log/caddy
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl status caddy --no-pager | head -10
'
```

Expected: `caddy validate` reports "Valid configuration"; `systemctl status` stays `active (running)`.

- [ ] **Step 4: [Claude SSH] Verify Caddy binds to 443.**

```bash
ssh root@198.23.244.159 'ss -tlnp | grep -E ":(80|443) "'
```

Expected: caddy listening on both `:80` and `:443`.

At this point Caddy is running with a valid cert, but nothing on port 3001 yet. The next task brings up the Docker container and flips CF SSL to Full (strict).

---

### Task 9: Deploy app container + flip CF SSL + smoke + tag plan-4-phase-2

**Files:**
- Create on VPS: `/home/lz/deploy/journal/docker-compose.yml`
- Create on VPS: `/home/lz/deploy/journal/.env.production`

- [ ] **Step 1: [Claude local] Generate a strong SESSION_SECRET.**

```bash
openssl rand -base64 48 | tr -d '=+/' | head -c 64
```

Record the output for the next step.

- [ ] **Step 2: [Claude SSH] Create .env.production on VPS.**

Replace `<SESSION_SECRET>` with the value from Step 1; other keys are known inputs:

```bash
ssh root@198.23.244.159 'cat > /home/lz/deploy/journal/.env.production <<"ENV"
NODE_ENV=production
PORT=3001
SESSION_SECRET=<SESSION_SECRET>
RESEND_API_KEY=re_Jh5cZ1uA_12PiwpeJmMt3Pt731whgbbYm
TURNSTILE_SECRET=0x4AAAAAAC92aTL_ynTN8ZWaAJ4q_Msf7lE
VITE_TURNSTILE_SITE_KEY=0x4AAAAAAC92aXzxF0POyFp7
BASE_URL=https://journal.basiscalc.xyz
ENV
chown lz:lz /home/lz/deploy/journal/.env.production
chmod 600 /home/lz/deploy/journal/.env.production
ls -l /home/lz/deploy/journal/.env.production
'
```

Expected: file permissions `-rw-------` owned by `lz:lz`.

- [ ] **Step 3: [Claude SSH] Create docker-compose.yml on VPS (prod form: pulls from GHCR).**

We haven't pushed an image to GHCR yet — so for this first deploy, build on VPS from a fresh git clone. Phase 3 switches to GHCR pull.

```bash
ssh root@198.23.244.159 'set -e
# Clone or update the repo
if [ ! -d /home/lz/deploy/source/journal ]; then
  sudo -u lz bash -lc "git clone https://github.com/liugangdao/journal.git /home/lz/deploy/source/journal"
fi
sudo -u lz bash -lc "cd /home/lz/deploy/source/journal && git fetch && git checkout main && git pull"
ls -la /home/lz/deploy/source/journal/
'
```

Expected: `/home/lz/deploy/source/journal/Dockerfile` exists.

Now install a Phase-2 compose file that builds from the cloned source:

```bash
ssh root@198.23.244.159 'cat > /home/lz/deploy/journal/docker-compose.yml <<"YAML"
services:
  app:
    build:
      context: /home/lz/deploy/source/journal
      args:
        VITE_TURNSTILE_SITE_KEY: ${VITE_TURNSTILE_SITE_KEY}
    image: journal:phase-2
    container_name: journal
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
    volumes:
      - /home/lz/deploy/journal/data:/app/data
    env_file: /home/lz/deploy/journal/.env.production
    mem_limit: 512m
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
YAML
chown lz:lz /home/lz/deploy/journal/docker-compose.yml
'
```

- [ ] **Step 4: [Claude SSH] Build + start as lz.**

```bash
ssh root@198.23.244.159 'sudo -u lz bash -lc "cd /home/lz/deploy/journal && docker compose up -d --build 2>&1 | tail -30"'
```

Expected build time: 2-5 minutes on the VPS. Final lines should read `Container journal  Started`.

- [ ] **Step 5: [Claude SSH] Verify container health.**

```bash
ssh root@198.23.244.159 'sudo -u lz bash -lc "cd /home/lz/deploy/journal && docker compose ps && docker compose logs app --tail=15"'
```

Expected: container state `Up (healthy)`, logs show `[server] listening on :3001`.

- [ ] **Step 6: [Claude SSH] Smoke Caddy → app path.**

```bash
ssh root@198.23.244.159 'curl -sSI http://localhost:3001/api/health && curl -sSIk https://localhost/ -H "Host: journal.basiscalc.xyz"'
```

Expected: first curl returns `HTTP/1.1 200`; second returns `HTTP/2 200` (Caddy serving the app shell via the Origin Cert locally).

- [ ] **Step 7: [User — Cloudflare dashboard] Flip SSL mode to Full (strict).**

Instructions:
1. Cloudflare dashboard → `basiscalc.xyz` zone → **SSL/TLS** → **Overview**.
2. Current mode likely reads **Flexible** or **Full**.
3. Change to **Full (strict)**.
4. Confirm.

- [ ] **Step 8: [Claude] Public smoke via Cloudflare.**

```bash
for p in / /about /privacy /terms /app /api/health; do
  curl -s --noproxy '*' -o /dev/null -w "$p  %{http_code}\n" https://journal.basiscalc.xyz${p}
done
```

Expected: every path returns `200`. If you see `525` or `526`, the SSL mode flip didn't take — re-check Cloudflare Step 7.

- [ ] **Step 9: [Claude] Browser smoke (manual).**

Open `https://journal.basiscalc.xyz/` in a browser:
- Landing page renders
- Demo dashboard displays sample trades with R/P&L numbers
- Footer links `/about`, `/privacy`, `/terms` each load their page
- Click "Open the app" → `/app` renders the trading journal with zero real trades
- Click "Sign in" → dialog opens; enter your email → Resend sends a magic-link email
- Open the email link → redirects to `/app?just_signed_in=1` with your session
- `useMigrationTrigger` drains any anonymous LocalStore data into the server

- [ ] **Step 10: [Claude] Tag phase-2.**

```bash
cd /home/lz/workspace/journal
git tag -a plan-4-phase-2 -m "Plan 4 Phase 2 — journal.basiscalc.xyz live on CF + Caddy + Docker

VPS: Caddy terminates with CF Origin Cert, reverse-proxies to a
Docker container bound to 127.0.0.1:3001. SSL mode Full (strict).
First deploy built from git clone on the VPS; Phase 3 switches
to GHCR pull."
git push --tags
```

---

## Phase 3 — Automation: CI/CD, backups, monitoring

### Task 10: CI workflow (tests only)

**Files:**
- Create: `.github/workflows/ci.yml`

Runs on every push and PR; fails the check if vitest reports any failure. Deploy workflow (Task 11) depends on this.

- [ ] **Step 1: Create the workflow file.**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - name: Install deps (root)
        run: pnpm install --frozen-lockfile
      - name: Install deps (client)
        run: pnpm install --frozen-lockfile
        working-directory: ./client
      - name: Install deps (server)
        run: pnpm install --frozen-lockfile
        working-directory: ./server
      - name: Run tests
        run: pnpm test
```

- [ ] **Step 2: Commit + push.**

```bash
cd /home/lz/workspace/journal
git add .github/workflows/ci.yml
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "ci(plan-4): run pnpm test on push + PR

Three-step install (root / client / server) since the repo isn't
a proper pnpm workspace — each package has its own lockfile.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 3: [User] Verify on GitHub.**

Open `https://github.com/liugangdao/journal/actions`. The push triggered a run named "CI". Confirm it goes green within ~3 minutes. If it fails, read the logs and fix before proceeding to Task 11.

---

### Task 11: Deploy workflow + SSH key + repo secrets

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify on VPS: `/home/lz/.ssh/authorized_keys`

- [ ] **Step 1: [Claude local] Generate a dedicated ed25519 SSH key pair for CI.**

```bash
mkdir -p /tmp/deploy-key
ssh-keygen -t ed25519 -C "gh-actions-journal-deploy" -f /tmp/deploy-key/id_ed25519 -N ''
cat /tmp/deploy-key/id_ed25519.pub
```

- [ ] **Step 2: [Claude SSH] Append public key to lz user authorized_keys.**

```bash
ssh root@198.23.244.159 "echo '$(cat /tmp/deploy-key/id_ed25519.pub)' >> /home/lz/.ssh/authorized_keys && chown lz:lz /home/lz/.ssh/authorized_keys && chmod 600 /home/lz/.ssh/authorized_keys"
```

- [ ] **Step 3: [Claude local] Verify CI key works.**

```bash
ssh -i /tmp/deploy-key/id_ed25519 -o StrictHostKeyChecking=accept-new lz@198.23.244.159 'whoami && docker ps'
```

Expected: `lz` and empty or running-container table.

- [ ] **Step 4: [User] Paste the private key into repo secrets.**

On GitHub → `journal` repo → Settings → Secrets and variables → Actions → New repository secret. Add these seven secrets:

| Name | Value source |
|---|---|
| `SSH_PRIVATE_KEY` | contents of `/tmp/deploy-key/id_ed25519` (BEGIN/END OPENSSH PRIVATE KEY lines included) |
| `VPS_HOST` | `198.23.244.159` |
| `VPS_USER` | `lz` |
| `SESSION_SECRET` | the 64-char value you set in the VPS `.env.production` |
| `RESEND_API_KEY` | `re_Jh5cZ1uA_12PiwpeJmMt3Pt731whgbbYm` |
| `TURNSTILE_SECRET` | `0x4AAAAAAC92aTL_ynTN8ZWaAJ4q_Msf7lE` |
| `TURNSTILE_SITE_KEY` | `0x4AAAAAAC92aXzxF0POyFp7` |

- [ ] **Step 5: [Claude local] Shred the local CI key file after the user confirms it's in repo secrets.**

```bash
shred -u /tmp/deploy-key/id_ed25519 /tmp/deploy-key/id_ed25519.pub 2>/dev/null || rm -rf /tmp/deploy-key
```

- [ ] **Step 6: Create deploy.yml.**

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-main
  cancel-in-progress: false

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    needs: []
    permissions:
      contents: read
      packages: write
    outputs:
      image_sha: ${{ steps.meta.outputs.sha }}
    steps:
      - uses: actions/checkout@v4

      - name: Run tests
        uses: ./.github/actions/noop
        if: false  # placeholder to keep yaml valid; CI workflow gates pushes separately

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - id: meta
        name: Compute image tags
        run: |
          echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: Build + push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/liugangdao/journal:${{ steps.meta.outputs.sha }}
            ghcr.io/liugangdao/journal:latest
          build-args: |
            VITE_TURNSTILE_SITE_KEY=${{ secrets.TURNSTILE_SITE_KEY }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Install ssh key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts

      - name: Pull latest image + restart
        run: |
          ssh -i ~/.ssh/id_ed25519 ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} <<'SSH'
            set -euo pipefail
            cd /home/lz/deploy/journal
            docker compose pull
            docker compose up -d
            docker image prune -f
          SSH
```

Remove the placeholder `./.github/actions/noop` block — yaml rejects unresolved actions. Full corrected deploy.yml (no placeholder):

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

concurrency:
  group: deploy-main
  cancel-in-progress: false

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image_sha: ${{ steps.meta.outputs.sha }}
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - id: meta
        run: echo "sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: Build + push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/liugangdao/journal:${{ steps.meta.outputs.sha }}
            ghcr.io/liugangdao/journal:latest
          build-args: |
            VITE_TURNSTILE_SITE_KEY=${{ secrets.TURNSTILE_SITE_KEY }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Install ssh key
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.SSH_PRIVATE_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H ${{ secrets.VPS_HOST }} >> ~/.ssh/known_hosts

      - name: Pull latest image + restart
        run: |
          ssh -i ~/.ssh/id_ed25519 ${{ secrets.VPS_USER }}@${{ secrets.VPS_HOST }} 'cd /home/lz/deploy/journal && docker compose pull && docker compose up -d && docker image prune -f'
```

Use the second (corrected) version.

- [ ] **Step 7: [Claude SSH] Switch VPS compose to pull from GHCR.**

Replace the Phase-2 build-from-source compose with a pull-based one:

```bash
ssh root@198.23.244.159 'cat > /home/lz/deploy/journal/docker-compose.yml <<"YAML"
services:
  app:
    image: ghcr.io/liugangdao/journal:latest
    container_name: journal
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
    volumes:
      - /home/lz/deploy/journal/data:/app/data
    env_file: /home/lz/deploy/journal/.env.production
    mem_limit: 512m
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
YAML
chown lz:lz /home/lz/deploy/journal/docker-compose.yml
'
```

- [ ] **Step 8: [Claude] GHCR package visibility (via GitHub web UI — tell user).**

After the first deploy workflow run succeeds, the GHCR package `ghcr.io/liugangdao/journal` appears under the user's packages. By default it's private. For `docker compose pull` from the VPS to work without a PAT, switch it to public:

1. GitHub → user profile → Packages → click `journal`.
2. Package settings → Danger Zone → **Change visibility** → Public.

(Alternative: keep private and add a `docker login ghcr.io` step on the VPS using a read-scope PAT. Public is simpler for an open-source journal project.)

- [ ] **Step 9: Commit + push deploy.yml.**

```bash
cd /home/lz/workspace/journal
git add .github/workflows/deploy.yml
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "ci(plan-4): deploy workflow — GHCR push + SSH docker compose pull

build-and-push: docker/build-push-action with gha cache, tags
ghcr.io/liugangdao/journal:{sha,latest}, bakes
VITE_TURNSTILE_SITE_KEY at build time.

deploy: ssh into lz@VPS, docker compose pull + up -d + image prune.
Concurrency group serializes deploys so a queued second push waits
for the first to finish.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 10: [User + Claude] Verify the end-to-end pipeline.**

This push triggers the deploy workflow. Open GitHub Actions and watch:
1. `build-and-push` job goes green in ~4-5 minutes.
2. `deploy` job goes green in ~15-30 seconds.
3. Re-run the public smoke from Task 9 Step 8 — everything still `200`.
4. `ssh root@198.23.244.159 'docker images | grep journal'` — the new `ghcr.io/liugangdao/journal:latest` tag should appear with a recent timestamp.

---

### Task 12: Daily SQLite backup to R2

**Files:**
- Create on VPS: `/home/lz/deploy/journal/backup.sh`
- Create on VPS: `/etc/cron.d/journal-backup`

- [ ] **Step 1: [User — Cloudflare dashboard] Create R2 bucket + API token.**

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**.
2. Bucket name: `journal-backup`. Location: Automatic. Click **Create bucket**.
3. Sidebar → **Manage R2 API Tokens** → **Create API token**.
4. Permissions: **Object Read & Write**. Specify bucket: `journal-backup`. TTL: forever.
5. Click **Create API token**. Paste the three values into chat: **Access Key ID**, **Secret Access Key**, and **Endpoint for S3 clients** (looks like `https://<accountid>.r2.cloudflarestorage.com`).

- [ ] **Step 2: [Claude SSH] Install sqlite3 + rclone on VPS.**

```bash
ssh root@198.23.244.159 'set -e
  apt-get install -y sqlite3 rclone
  sqlite3 -version
  rclone version
'
```

Expected: sqlite3 ≥ 3.40, rclone ≥ 1.60.

- [ ] **Step 3: [Claude SSH] Configure rclone remote `r2` as user `lz`.**

Replace `<ACCESS_KEY_ID>`, `<SECRET_ACCESS_KEY>`, `<ENDPOINT>` with values from Step 1:

```bash
ssh root@198.23.244.159 'sudo -u lz bash -lc "mkdir -p ~/.config/rclone && cat > ~/.config/rclone/rclone.conf <<EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = <ACCESS_KEY_ID>
secret_access_key = <SECRET_ACCESS_KEY>
endpoint = <ENDPOINT>
acl = private
EOF
chmod 600 ~/.config/rclone/rclone.conf
rclone lsd r2:
"'
```

Expected: `rclone lsd r2:` lists `journal-backup` with no error.

- [ ] **Step 4: [Claude SSH] Create backup.sh.**

```bash
ssh root@198.23.244.159 'cat > /home/lz/deploy/journal/backup.sh <<"SH"
#!/usr/bin/env bash
set -euo pipefail

DB="/home/lz/deploy/journal/data/journal.db"
STAMP=$(date -u +%Y-%m-%d)
TMP="/tmp/journal-${STAMP}.db"

# Online backup via SQLite .backup (safe against live WAL)
sqlite3 "$DB" ".backup ${TMP}"

# Upload
rclone copy --quiet "${TMP}" r2:journal-backup/

# Cleanup local temp + old R2 objects (retention: 30 days)
rm -f "${TMP}"
rclone delete --quiet --min-age 30d r2:journal-backup/
SH
chown lz:lz /home/lz/deploy/journal/backup.sh
chmod 0750 /home/lz/deploy/journal/backup.sh
'
```

- [ ] **Step 5: [Claude SSH] Test backup manually.**

```bash
ssh root@198.23.244.159 'sudo -u lz /home/lz/deploy/journal/backup.sh && sudo -u lz rclone ls r2:journal-backup/'
```

Expected: `rclone ls` prints one line `<bytes> journal-YYYY-MM-DD.db`.

- [ ] **Step 6: [Claude SSH] Install cron job (runs as lz via user crontab).**

```bash
ssh root@198.23.244.159 'sudo -u lz bash -lc "( crontab -l 2>/dev/null ; echo \"0 3 * * * /home/lz/deploy/journal/backup.sh >> /home/lz/deploy/journal/backup.log 2>&1\" ) | crontab -  && crontab -l"'
```

Expected: crontab lists one line starting with `0 3 * * *`.

No commit needed — backup lives entirely on VPS.

---

### Task 13: UptimeRobot monitors + RUNBOOK + final tag

**Files:**
- Create: `docs/RUNBOOK.md`

- [ ] **Step 1: [User — UptimeRobot] Create two monitors.**

1. Sign in at `https://uptimerobot.com/`. (Create free account if needed.)
2. Dashboard → **+ New monitor**.
3. Monitor 1:
   - Type: HTTP(s)
   - Friendly name: `journal-app-health`
   - URL: `https://journal.basiscalc.xyz/api/health`
   - Monitoring interval: **5 minutes**
   - Alert contacts: your email
4. Monitor 2:
   - Type: HTTP(s)
   - Friendly name: `journal-landing`
   - URL: `https://journal.basiscalc.xyz/`
   - Monitoring interval: **5 minutes**
   - Alert contacts: your email
5. Both should report "Up" within one cycle.

- [ ] **Step 2: Create docs/RUNBOOK.md.**

```markdown
# Journal Ops RUNBOOK

## Deploy
Push to `main` → GitHub Actions build-and-push + deploy jobs run automatically.
Monitor at https://github.com/liugangdao/journal/actions.

Manual deploy (if Actions is broken):
```
ssh lz@198.23.244.159 'cd /home/lz/deploy/journal && docker compose pull && docker compose up -d'
```

## Rollback
Rollback to previous image:
```
ssh lz@198.23.244.159 '
  cd /home/lz/deploy/journal
  docker images ghcr.io/liugangdao/journal --format "{{.Tag}}\t{{.CreatedAt}}"
  # Pick the previous SHA tag, then:
  sed -i "s|:latest|:<SHA>|" docker-compose.yml
  docker compose up -d
'
```

## Restore from backup
1. Provision fresh VPS, install Docker + Caddy per Plan 4 Tasks 7-8.
2. Restore cert + Caddyfile from backup or re-issue from Cloudflare.
3. Copy `.env.production` from secure storage (or re-generate `SESSION_SECRET` if invalidating sessions is OK).
4. Pull latest DB snapshot:
   ```
   rclone ls r2:journal-backup/ | sort | tail -1  # get latest filename
   rclone copy r2:journal-backup/journal-YYYY-MM-DD.db /home/lz/deploy/journal/data/
   mv /home/lz/deploy/journal/data/journal-YYYY-MM-DD.db /home/lz/deploy/journal/data/journal.db
   chown lz:lz /home/lz/deploy/journal/data/journal.db
   ```
5. `docker compose up -d`.
6. Update Cloudflare DNS `A journal` to new VPS IP.
7. Smoke: `curl -sSI https://journal.basiscalc.xyz/api/health`.

RTO target: 1-2 hours.

## Certificate renewal
Cloudflare Origin Cert valid until 2041. Calendar reminder set for 2040-10-01
to re-issue from the CF dashboard and rewrite `/etc/caddy/origin-{cert,key}.pem`.

## Secrets locations
- Repo secrets: GitHub → Settings → Secrets and variables → Actions
- VPS: `/home/lz/deploy/journal/.env.production` (perms 0600, owner lz:lz)
- Rclone R2 token: `/home/lz/.config/rclone/rclone.conf`
- SSH deploy key private half: GitHub repo secret `SSH_PRIVATE_KEY` only.

Rotation:
- `SESSION_SECRET` — rotating invalidates every active session; only rotate on compromise.
- `RESEND_API_KEY` — rotate via Resend dashboard → new API key → update both GH secret and VPS `.env.production` → restart container.
- `TURNSTILE_SECRET` — same flow via Cloudflare dashboard → Turnstile site settings.
- SSH key — re-run Task 11 Steps 1-5.

## Backup inspection
```
ssh lz@198.23.244.159 'rclone ls r2:journal-backup/ | tail -10'
```

## Logs
- App logs: `docker compose logs app --tail=200` on VPS
- Caddy logs: `/var/log/caddy/journal.log` on VPS (json format)
- Backup log: `/home/lz/deploy/journal/backup.log` on VPS

## Uptime
- UptimeRobot dashboard: https://stats.uptimerobot.com/ (your account)
- Monitors: `journal-app-health` (HEAD /api/health) and `journal-landing` (HEAD /).

## Container resource limits
- memlimit: 512MB. VPS total: 2.4GB. xray uses ~50MB, Caddy ~100MB, system ~400MB.
  Adding Umami in Plan 5 will push to ~1.2GB used; still 1.2GB headroom.
```

- [ ] **Step 3: Commit + final tag.**

```bash
cd /home/lz/workspace/journal
git add docs/RUNBOOK.md
git -c user.email="lz@basiscalc.xyz" -c user.name="lz" commit -m "docs(plan-4): RUNBOOK covering deploy/rollback/restore/rotation/monitoring

Captures the Plan 4 ops surface: CI deploy flow, rollback by
docker image SHA, disaster recovery from R2 nightly snapshot,
Cloudflare Origin Cert renewal schedule, secrets locations +
rotation procedures, log destinations, and UptimeRobot/resource
pointers.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git tag -a plan-4-complete -m "Plan 4 complete — marketing pages + production deployment

journal.basiscalc.xyz live behind Cloudflare + Caddy + Docker
on 198.23.244.159. Full CI/CD via GitHub Actions + GHCR. Nightly
R2 backups with 30-day retention. UptimeRobot monitors at 5-min
intervals.

Out of scope (Plan 5): blog, Umami, SSH hardening, paid features."
git push && git push --tags
```

---

## Self-Review Checklist

**Spec coverage:**
- §1 Goal — all 5 bullets covered (public URL in Task 9, auto-deploy in Task 11, daily backup in Task 12, UptimeRobot in Task 13, 3 marketing pages in Tasks 2-4) ✓
- §3.1 Routing — Task 5 ✓
- §3.2 Containerization — Task 6 ✓
- §3.3 Reverse proxy + TLS — Tasks 7-8 ✓
- §3.4 CSP — Task 5 Step 3 ✓
- §3.5 CI/CD — Tasks 10-11 ✓
- §3.6 Backup — Task 12 ✓
- §3.7 Monitoring — Task 13 ✓
- §4 Content — Tasks 2, 3, 4 (full strings in each task code block) ✓
- §5 Phased rollout — Phase tags in Tasks 6, 9, 13 ✓
- §6 Risks mitigated — CSP tested in local prod Task 6 Step 9; SSL mode gate in Task 9 Step 7; RAM limit baked into compose; GHCR public switch called out in Task 11 Step 8 ✓
- §8 Open items — all collected during the tasks that need them ✓

**Placeholder scan:** None (the one remaining placeholder is `<SESSION_SECRET>` in Task 9 Step 2 / Origin Cert PEM in Task 8 Step 2 / R2 credentials in Task 12 Step 3 — these are specified as "paste the output of the previous step" rather than "TBD").

**Type consistency:** `MarketingShell` signature (`{ children }`) consistent across Tasks 1-5. `en.about`, `en.privacy`, `en.terms`, `en.marketing` keys defined in Task 1 consumed in Tasks 2-5. Docker image tag `ghcr.io/liugangdao/journal` consistent across Tasks 6 (local build), 11 (CI push), 11 Step 7 (VPS pull). `.env.production` path `/home/lz/deploy/journal/.env.production` consistent across Tasks 9 and 12.

---

*End of plan.*
