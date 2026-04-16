# SEO & Commercial Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximize organic traffic and affiliate revenue for basiscalc.xyz and journal.basiscalc.xyz by filling SEO gaps, adding a journal landing page on the main domain, and improving affiliate placement.

**Architecture:** basiscalc.xyz (Astro SSG) is the SEO hub — all indexable pages live here. journal.basiscalc.xyz (Express + React SPA) is the app — excluded from search indexing. A new Astro page at `/tools/trading-journal/` serves as the journal's SEO landing page, linking to the SPA at `journal.basiscalc.xyz/app`.

**Tech Stack:** Astro 5 (SSG), React 19, Express 5, Tailwind CSS v4, Buttondown API, Umami analytics

**Repos:**
- basiscalc: `/home/lz/workspace/basiscalc`
- journal: `/home/lz/workspace/journal`

---

## Task 1: basiscalc — OG Image + Twitter Cards

**Repo:** `/home/lz/workspace/basiscalc`

**Files:**
- Create: `public/images/og-default.png`
- Modify: `src/layouts/BaseLayout.astro:20-47`

This task adds `og:image` and Twitter Card meta tags to every page on basiscalc.xyz. The OG image is a static 1200x630 PNG placeholder — the user will replace it with a designed asset later.

- [ ] **Step 1: Create placeholder OG image**

Generate a simple 1200x630 OG image. This is a placeholder — the user will design a proper branded image later.

```bash
cd /home/lz/workspace/basiscalc
convert -size 1200x630 xc:'#0f172a' \
  -fill '#3b82f6' -font 'Inter' -pointsize 64 \
  -gravity center -annotate 0 'basiscalc.xyz' \
  public/images/og-default.png
```

If `convert` (ImageMagick) is not available, create a minimal placeholder by copying an existing image or asking the user to provide one. The file must exist at `public/images/og-default.png`.

- [ ] **Step 2: Add OG image + Twitter Card meta to BaseLayout**

In `src/layouts/BaseLayout.astro`, add an `ogImage` prop and new meta tags after the existing `og:type` tag (line 38):

```astro
---
import '../styles/globals.css';
import Header from '../components/layout/Header.astro';
import Footer from '../components/layout/Footer.astro';
import SchemaOrganization from '../components/seo/SchemaOrganization.astro';

interface Props {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
}
const { title, description, canonical, ogImage } = Astro.props;
const canonicalUrl = canonical ?? new URL(Astro.url.pathname, 'https://basiscalc.xyz').toString();
const ogImageUrl = ogImage ?? 'https://basiscalc.xyz/images/og-default.png';
const umamiScriptUrl = import.meta.env.PUBLIC_UMAMI_SCRIPT_URL as string | undefined;
const umamiWebsiteId = import.meta.env.PUBLIC_UMAMI_WEBSITE_ID as string | undefined;
const umamiEnabled = Boolean(umamiScriptUrl && umamiWebsiteId);
---
```

Then in the `<head>`, after `<meta property="og:type" content="website" />`, add:

```html
    <meta property="og:image" content={ogImageUrl} />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@liuz99004" />
    <meta name="twitter:creator" content="@liuz99004" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogImageUrl} />
```

- [ ] **Step 3: Verify build**

```bash
cd /home/lz/workspace/basiscalc
npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Verify output HTML contains new tags**

```bash
grep -E 'og:image|twitter:card|twitter:site' dist/index.html
```

Expected: All new meta tags present in the output.

- [ ] **Step 5: Commit**

```bash
cd /home/lz/workspace/basiscalc
git add public/images/og-default.png src/layouts/BaseLayout.astro
git commit -m "feat(seo): add OG image and Twitter Card meta tags to BaseLayout"
```

---

## Task 2: basiscalc — BreadcrumbList Schema Component

**Repo:** `/home/lz/workspace/basiscalc`

**Files:**
- Create: `src/components/seo/SchemaBreadcrumb.astro`
- Modify: `src/pages/guides/[slug].astro:27-46`
- Modify: `src/pages/tools/liquidation/hyperliquid.astro` (add breadcrumb schema)
- Modify: `src/pages/tools/liquidation/gmx.astro` (add breadcrumb schema)

- [ ] **Step 1: Create SchemaBreadcrumb component**

Create `src/components/seo/SchemaBreadcrumb.astro`:

```astro
---
interface Props {
  items: Array<{ name: string; url: string }>;
}
const { items } = Astro.props;
const json = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: item.url,
  })),
};
---
<script type="application/ld+json" set:html={JSON.stringify(json)} />
```

- [ ] **Step 2: Add SchemaBreadcrumb to guide pages**

In `src/pages/guides/[slug].astro`, import and add the component. After the existing `SchemaArticle` (line 28), add:

```astro
---
import SchemaBreadcrumb from '../../components/seo/SchemaBreadcrumb.astro';
// ... (existing imports stay)
---

<!-- Inside <BaseLayout>, after <SchemaArticle /> -->
  <SchemaBreadcrumb
    slot="head"
    items={[
      { name: 'Home', url: 'https://basiscalc.xyz/' },
      { name: 'Guides', url: 'https://basiscalc.xyz/guides/' },
      { name: entry.data.title, url: url },
    ]}
  />
```

- [ ] **Step 3: Add SchemaBreadcrumb to tool pages**

In both `src/pages/tools/liquidation/hyperliquid.astro` and `src/pages/tools/liquidation/gmx.astro`, import and add:

```astro
---
import SchemaBreadcrumb from '../../../components/seo/SchemaBreadcrumb.astro';
---

<!-- Inside <BaseLayout>, in the head slot -->
  <SchemaBreadcrumb
    slot="head"
    items={[
      { name: 'Home', url: 'https://basiscalc.xyz/' },
      { name: 'Tools', url: 'https://basiscalc.xyz/tools/' },
      { name: 'Liquidation', url: 'https://basiscalc.xyz/tools/liquidation/' },
      { name: '{Display Name}', url: 'https://basiscalc.xyz/tools/liquidation/{venue}/' },
    ]}
  />
```

Replace `{Display Name}` and `{venue}` with the actual venue display name and slug from props.

- [ ] **Step 4: Build and verify**

```bash
cd /home/lz/workspace/basiscalc
npm run build && grep -l 'BreadcrumbList' dist/guides/*/index.html | head -3
```

Expected: Build succeeds, BreadcrumbList JSON-LD found in guide pages.

- [ ] **Step 5: Commit**

```bash
git add src/components/seo/SchemaBreadcrumb.astro src/pages/guides/\[slug\].astro src/pages/tools/
git commit -m "feat(seo): add BreadcrumbList schema to guides and tool pages"
```

---

## Task 3: basiscalc — Footer Social Links

**Repo:** `/home/lz/workspace/basiscalc`

**Files:**
- Modify: `src/components/layout/Footer.astro`

- [ ] **Step 1: Add Twitter and GitHub links to Footer**

In `src/components/layout/Footer.astro`, add social links to the `<ul>` list after the existing links:

```astro
---
const year = new Date().getFullYear();
---
<footer class="border-t border-border mt-16">
  <div class="mx-auto max-w-4xl px-4 py-8 text-xs text-muted space-y-3">
    <p>
      Not financial advice. Educational purposes only. Affiliate links carry
      <code class="bg-input rounded px-1">rel="sponsored nofollow"</code> —
      <a class="text-text hover:text-accent underline" href="/about/">see full disclosure</a>.
    </p>
    <ul class="flex flex-wrap gap-x-4 gap-y-1">
      <li><a class="hover:text-text transition-colors" href="/about/">About</a></li>
      <li><a class="hover:text-text transition-colors" href="/changelog/">Changelog</a></li>
      <li><a class="hover:text-text transition-colors" href="/privacy/">Privacy</a></li>
      <li><a class="hover:text-text transition-colors" href="/terms/">Terms</a></li>
      <li><a class="hover:text-text transition-colors" href="https://x.com/liuz99004" target="_blank" rel="noopener">Twitter</a></li>
      <li><a class="hover:text-text transition-colors" href="https://github.com/liugangdao" target="_blank" rel="noopener">GitHub</a></li>
    </ul>
    <p>&copy; {year} basiscalc.xyz</p>
  </div>
</footer>
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/lz/workspace/basiscalc
npm run build && grep -E 'x\.com/liuz|github\.com/liugangdao' dist/index.html
```

Expected: Both social links present in output HTML.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Footer.astro
git commit -m "feat(seo): add Twitter and GitHub social links to footer"
```

---

## Task 4: basiscalc — 404 Page + apple-touch-icon

**Repo:** `/home/lz/workspace/basiscalc`

**Files:**
- Create: `src/pages/404.astro`
- Modify: `src/layouts/BaseLayout.astro` (add apple-touch-icon)

- [ ] **Step 1: Create 404 page**

Create `src/pages/404.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Page not found — basiscalc" description="The page you're looking for doesn't exist.">
  <div class="mx-auto max-w-4xl px-4 py-20 text-center">
    <h1 class="text-[28px] font-semibold tracking-tight">404 — Page not found</h1>
    <p class="mt-3 text-sm text-muted">The page you're looking for doesn't exist or has been moved.</p>
    <div class="mt-8 flex justify-center gap-4">
      <a href="/" class="text-sm font-semibold bg-accent text-white px-4 py-2 rounded-lg hover:brightness-110 transition-all">Home</a>
      <a href="/tools/liquidation/hyperliquid/" class="text-sm text-muted hover:text-text px-4 py-2 rounded-lg border border-border hover:border-accent/30 transition-all">Calculators</a>
      <a href="/guides/" class="text-sm text-muted hover:text-text px-4 py-2 rounded-lg border border-border hover:border-accent/30 transition-all">Guides</a>
    </div>
  </div>
</BaseLayout>
```

- [ ] **Step 2: Add apple-touch-icon to BaseLayout**

In `src/layouts/BaseLayout.astro`, after the favicon `<link>` tag (line 34), add:

```html
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

Create the icon file. If you have `convert` available:

```bash
cd /home/lz/workspace/basiscalc
convert -size 180x180 xc:'#0f172a' -fill '#3b82f6' -font 'Inter' -pointsize 72 -gravity center -annotate 0 'bc' public/apple-touch-icon.png
```

Otherwise, create a simple 180x180 PNG placeholder. The user will replace with a designed asset.

- [ ] **Step 3: Build and verify**

```bash
cd /home/lz/workspace/basiscalc
npm run build && ls dist/404.html && grep 'apple-touch-icon' dist/index.html
```

Expected: `dist/404.html` exists. apple-touch-icon link found in index.html.

- [ ] **Step 4: Commit**

```bash
git add src/pages/404.astro src/layouts/BaseLayout.astro public/apple-touch-icon.png
git commit -m "feat(seo): add 404 page and apple-touch-icon"
```

---

## Task 5: basiscalc — Trading Journal Landing Page

**Repo:** `/home/lz/workspace/basiscalc`

**Files:**
- Create: `src/pages/tools/trading-journal.astro`
- Modify: `src/pages/index.astro:47-55` (update journal link to internal route)
- Modify: `src/components/layout/Header.astro` (update journal nav link)

This is the key SEO page: journal's public-facing landing page lives on basiscalc.xyz for domain authority consolidation.

- [ ] **Step 1: Create the trading journal landing page**

Create `src/pages/tools/trading-journal.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import SchemaSoftwareApp from '../../components/seo/SchemaSoftwareApp.astro';
import SchemaBreadcrumb from '../../components/seo/SchemaBreadcrumb.astro';
import EmailSignup from '../../components/marketing/EmailSignup.tsx';
---
<BaseLayout
  title="Free Trading Journal — Track Forex & Crypto Trades | basiscalc"
  description="Free online trading journal for forex and crypto traders. Log trades, track P&L, analyze performance by pair, strategy, and timeframe. No ads, no paywalls."
>
  <SchemaSoftwareApp
    slot="head"
    name="Trading Journal"
    description="Free online trading journal for forex and crypto traders. Track trades, analyze performance, and improve your trading."
    url="https://basiscalc.xyz/tools/trading-journal/"
  />
  <SchemaBreadcrumb
    slot="head"
    items={[
      { name: 'Home', url: 'https://basiscalc.xyz/' },
      { name: 'Tools', url: 'https://basiscalc.xyz/' },
      { name: 'Trading Journal', url: 'https://basiscalc.xyz/tools/trading-journal/' },
    ]}
  />

  {/* Hero */}
  <section class="mx-auto max-w-4xl px-4 pt-14 pb-10">
    <h1 class="text-[28px] font-semibold tracking-tight leading-tight" style="letter-spacing:-0.025em;">
      Free Trading Journal for<br class="hidden sm:block" />
      Forex &amp; Crypto Traders
    </h1>
    <p class="mt-3 text-sm text-muted max-w-[480px] leading-relaxed">
      Log your trades, track P&amp;L, and analyze performance by pair, strategy, and timeframe. Free forever — no ads, no paywalls, no data selling.
    </p>
    <div class="mt-6 flex gap-3">
      <a
        href="https://journal.basiscalc.xyz/app"
        class="text-sm font-semibold bg-accent text-white px-5 py-2.5 rounded-lg hover:brightness-110 transition-all"
      >
        Start Journaling — Free
      </a>
    </div>
  </section>

  {/* Features */}
  <section class="mx-auto max-w-4xl px-4 pb-10">
    <p class="text-[11px] uppercase tracking-widest text-muted mb-3.5">Features</p>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="rounded-xl bg-card p-5 border border-border">
        <p class="text-[15px] font-medium text-text">Trade Logging</p>
        <p class="mt-1 text-xs text-muted leading-relaxed">Record entries, exits, lot sizes, and notes. Track open positions and closed trades separately.</p>
      </div>
      <div class="rounded-xl bg-card p-5 border border-border">
        <p class="text-[15px] font-medium text-text">Performance Analytics</p>
        <p class="mt-1 text-xs text-muted leading-relaxed">Win rate, average R-multiple, P&amp;L breakdowns by pair, strategy, emotion, and day of week.</p>
      </div>
      <div class="rounded-xl bg-card p-5 border border-border">
        <p class="text-[15px] font-medium text-text">Risk Management</p>
        <p class="mt-1 text-xs text-muted leading-relaxed">Define your trading policies, track violations per trade, and score execution quality A through D.</p>
      </div>
      <div class="rounded-xl bg-card p-5 border border-border">
        <p class="text-[15px] font-medium text-text">Weekly &amp; Monthly Reviews</p>
        <p class="mt-1 text-xs text-muted leading-relaxed">Write weekly and monthly notes with auto-aggregated stats. Review what worked and what didn't.</p>
      </div>
    </div>
  </section>

  {/* Screenshots */}
  <section class="mx-auto max-w-4xl px-4 pb-10">
    <p class="text-[11px] uppercase tracking-widest text-muted mb-3.5">Dashboard Preview</p>
    <div class="space-y-3">
      <img
        src="/images/journal/dashboard-stats.png"
        alt="Trading journal dashboard showing key performance metrics including win rate, average R-multiple, and total P&L"
        class="rounded-xl border border-border w-full"
        loading="lazy"
        width="1200"
        height="600"
      />
      <img
        src="/images/journal/dashboard-breakdowns.png"
        alt="Performance breakdown charts showing P&L by trading pair, strategy, and timeframe"
        class="rounded-xl border border-border w-full"
        loading="lazy"
        width="1200"
        height="600"
      />
    </div>
  </section>

  {/* CTA */}
  <section class="mx-auto max-w-4xl px-4 py-10 border-t border-border text-center">
    <h2 class="text-[17px] font-medium text-text">Start tracking your trades today</h2>
    <p class="mt-1.5 text-xs text-muted">Free forever. No credit card required.</p>
    <a
      href="https://journal.basiscalc.xyz/app"
      class="inline-block mt-4 text-sm font-semibold bg-accent text-white px-5 py-2.5 rounded-lg hover:brightness-110 transition-all"
    >
      Open Trading Journal
    </a>
  </section>

  {/* Email CTA */}
  <section class="mx-auto max-w-4xl px-4 py-10 border-t border-border">
    <h2 class="text-[17px] font-medium text-text">Monthly trading tool updates &amp; market structure guides</h2>
    <p class="mt-1.5 text-xs text-muted max-w-md">
      New calculators, trading insights, and tool updates. No spam.
    </p>
    <div class="mt-4">
      <EmailSignup client:load />
    </div>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Update homepage journal link**

In `src/pages/index.astro`, change the journal link (lines 47-55) from external to internal:

Old:
```html
    <a href="https://journal.basiscalc.xyz/"
       target="_blank" rel="noopener"
```

New:
```html
    <a href="/tools/trading-journal/"
```

Remove `target="_blank" rel="noopener"` since it's now an internal link. Remove the `↗` arrow icon.

- [ ] **Step 3: Update header journal nav link**

In `src/components/layout/Header.astro`, find the "Journal" navigation link and change it from `https://journal.basiscalc.xyz/` to `/tools/trading-journal/`. Remove `target="_blank"` and `rel="noopener"` attributes.

- [ ] **Step 4: Build and verify**

```bash
cd /home/lz/workspace/basiscalc
npm run build && cat dist/tools/trading-journal/index.html | head -30
```

Expected: Build succeeds. The output HTML has the correct title, description, SoftwareApplication schema, and BreadcrumbList schema.

- [ ] **Step 5: Verify sitemap includes new page**

```bash
grep 'trading-journal' dist/sitemap-*.xml
```

Expected: `/tools/trading-journal/` appears in the sitemap (auto-added by Astro sitemap integration).

- [ ] **Step 6: Commit**

```bash
git add src/pages/tools/trading-journal.astro src/pages/index.astro src/components/layout/Header.astro
git commit -m "feat(seo): add trading journal landing page on main domain"
```

---

## Task 6: basiscalc — Newsletter CTA Update

**Repo:** `/home/lz/workspace/basiscalc`

**Files:**
- Modify: `src/pages/index.astro:78-86`

- [ ] **Step 1: Update newsletter CTA copy on homepage**

In `src/pages/index.astro`, change the Email CTA section (lines 78-86):

Old:
```html
    <h2 class="text-[17px] font-medium text-text">Get updates when new tools ship</h2>
    <p class="mt-1.5 text-xs text-muted max-w-md">
      Occasional emails — new calculators, juicy arbitrage setups. No spam.
    </p>
```

New:
```html
    <h2 class="text-[17px] font-medium text-text">Monthly trading tool updates &amp; market structure guides</h2>
    <p class="mt-1.5 text-xs text-muted max-w-md">
      New calculators, trading insights, and strategy guides. No spam.
    </p>
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/lz/workspace/basiscalc
npm run build && grep 'Monthly trading tool' dist/index.html
```

Expected: Updated CTA copy in output.

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat(seo): update newsletter CTA to emphasize monthly value"
```

---

## Task 7: journal — Fix lang + Add Meta Tags + Canonical + OG

**Repo:** `/home/lz/workspace/journal`

**Files:**
- Modify: `client/index.html`

- [ ] **Step 1: Update index.html with SEO fixes**

Edit `client/index.html` with the following changes:
1. Change `lang="zh-CN"` to `lang="en"`
2. Add meta description
3. Add canonical tag
4. Add OG tags
5. Add Twitter Card tags

Updated file:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Trading Journal</title>
  <meta name="description" content="Free online trading journal for forex and crypto traders. Track trades, analyze performance, and improve your trading." />
  <link rel="canonical" href="https://journal.basiscalc.xyz/app" />
  <meta property="og:title" content="Trading Journal — Free Forex & Crypto Trade Tracker" />
  <meta property="og:description" content="Log trades, track P&L, and analyze performance by pair, strategy, and timeframe. Free forever." />
  <meta property="og:url" content="https://journal.basiscalc.xyz/app" />
  <meta property="og:type" content="website" />
  <meta property="og:image" content="https://journal.basiscalc.xyz/og-journal.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@liuz99004" />
  <meta name="twitter:title" content="Trading Journal — Free Forex & Crypto Trade Tracker" />
  <meta name="twitter:description" content="Log trades, track P&L, and analyze performance. Free forever." />
  <meta name="twitter:image" content="https://journal.basiscalc.xyz/og-journal.png" />
  <meta name="theme-color" content="#0f172a" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/pwa-192x192.png" />
  <script>
    (function(){
      var t = localStorage.getItem('theme');
      if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (t === 'dark') document.documentElement.classList.add('dark');
    })();
  </script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
</head>
<body class="bg-bg text-text min-h-screen">
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 2: Create placeholder OG image**

Create a placeholder OG image for journal. The user will design a proper one later.

```bash
cd /home/lz/workspace/journal
convert -size 1200x630 xc:'#0f172a' \
  -fill '#3b82f6' -font 'Inter' -pointsize 64 \
  -gravity center -annotate 0 'Trading Journal' \
  client/public/og-journal.png
```

If ImageMagick is unavailable, create any 1200x630 PNG placeholder at `client/public/og-journal.png`.

- [ ] **Step 3: Verify dev server**

```bash
cd /home/lz/workspace/journal
npm run build
```

Expected: Build succeeds. Check that `server/public/index.html` has `lang="en"` and the new meta tags.

- [ ] **Step 4: Commit**

```bash
cd /home/lz/workspace/journal
git add client/index.html client/public/og-journal.png
git commit -m "feat(seo): fix lang, add meta description, OG tags, Twitter cards, canonical"
```

---

## Task 8: journal — robots.txt Route

**Repo:** `/home/lz/workspace/journal`

**Files:**
- Modify: `server/index.js:87-96`

- [ ] **Step 1: Add robots.txt route**

In `server/index.js`, add a robots.txt route before the static file serving (before line 89):

```javascript
// SEO: block all indexing — public landing page lives on basiscalc.xyz
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n')
})
```

Insert this before the `app.use(express.static(...))` line.

- [ ] **Step 2: Test locally**

```bash
cd /home/lz/workspace/journal
npm run dev:server &
sleep 2
curl http://localhost:3001/robots.txt
kill %1
```

Expected output:
```
User-agent: *
Disallow: /
```

- [ ] **Step 3: Commit**

```bash
cd /home/lz/workspace/journal
git add server/index.js
git commit -m "feat(seo): add robots.txt route to block subdomain indexing"
```

---

## Task 9: journal — Umami Analytics Integration

**Repo:** `/home/lz/workspace/journal`

**Files:**
- Modify: `client/index.html`
- Modify: `server/index.js` (CSP update)

The user must first create a new site in their Umami instance at `analytics.basiscalc.xyz` and get the website ID. This task adds the tracking script.

- [ ] **Step 1: Add Umami script to index.html**

In `client/index.html`, add the Umami script just before the closing `</head>` tag:

```html
  <script defer src="https://analytics.basiscalc.xyz/script.js" data-website-id="JOURNAL_UMAMI_ID"></script>
</head>
```

Replace `JOURNAL_UMAMI_ID` with the actual website ID from the Umami dashboard. The user will fill this in when they set up the Umami site.

- [ ] **Step 2: Update CSP to allow Umami**

In `server/index.js`, update the `scriptSrc` array (line 34) to include the Umami domain:

```javascript
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://challenges.cloudflare.com',
            'https://s3.tradingview.com',
            'https://s.tradingview.com',
            'https://analytics.basiscalc.xyz',
          ],
```

Also add Umami to `connectSrc` (line 44) since the script sends analytics data:

```javascript
          connectSrc: ["'self'", 'https://api.resend.com', 'https://analytics.basiscalc.xyz'],
```

- [ ] **Step 3: Build and verify**

```bash
cd /home/lz/workspace/journal
npm run build && grep 'analytics.basiscalc.xyz' server/public/index.html
```

Expected: Umami script tag found in the output.

- [ ] **Step 4: Commit**

```bash
cd /home/lz/workspace/journal
git add client/index.html server/index.js
git commit -m "feat(seo): integrate Umami analytics for journal"
```

---

## Task 10: journal — "Powered by BasisCalc" Footer Link

**Repo:** `/home/lz/workspace/journal`

**Files:**
- Modify: `client/src/components/MarketingShell.jsx:52-61`

- [ ] **Step 1: Add BasisCalc link to footer**

In `client/src/components/MarketingShell.jsx`, update the footer (lines 52-61) to add a "Powered by" link:

Old:
```jsx
          <div>© {new Date().getFullYear()} {en.app.titleShort} · {en.marketing.footerTagline}</div>
```

New:
```jsx
          <div>
            © {new Date().getFullYear()} {en.app.titleShort} · {en.marketing.footerTagline}
            {' · '}
            <a href="https://basiscalc.xyz" className="hover:text-text transition-colors" target="_blank" rel="noopener">basiscalc.xyz</a>
          </div>
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/lz/workspace/journal
npm run build && grep 'basiscalc.xyz' server/public/index.html
```

Note: Since this is in a React component, it won't appear in the static HTML. Instead verify by running the dev server and checking the page source in the browser.

```bash
npm run dev &
sleep 3
curl -s http://localhost:3000 | grep -o 'basiscalc.xyz'
kill %1
```

- [ ] **Step 3: Commit**

```bash
cd /home/lz/workspace/journal
git add client/src/components/MarketingShell.jsx
git commit -m "feat(seo): add basiscalc.xyz backlink to marketing footer"
```

---

## Task 11: basiscalc — Image SEO Audit

**Repo:** `/home/lz/workspace/basiscalc`

**Files:**
- Modify: `src/pages/tools/trading-journal.astro` (already created in Task 5 — verify alt text)
- Audit: All `<img>` tags across the codebase for `alt` attributes

This is a review task, not a build task. Check all existing images for SEO compliance.

- [ ] **Step 1: Find all img tags and check alt attributes**

```bash
cd /home/lz/workspace/basiscalc
grep -rn '<img\|<Image' src/ --include="*.astro" --include="*.tsx" --include="*.mdx"
```

For each image found:
- Verify `alt` attribute is present and descriptive (not "screenshot" or "image")
- Verify `loading="lazy"` is set for below-the-fold images
- Verify `width` and `height` attributes are set (prevents CLS)

- [ ] **Step 2: Fix any issues found**

Update `alt` attributes to be descriptive and keyword-rich. For example:
- Bad: `alt="screenshot"`
- Good: `alt="Trading journal dashboard showing key performance metrics including win rate, average R-multiple, and total P&L"`

- [ ] **Step 3: Commit if changes were made**

```bash
cd /home/lz/workspace/basiscalc
git add -A && git commit -m "fix(seo): improve image alt attributes for accessibility and SEO"
```

---

## Task 12: Manual — Google Search Console Setup

**No code changes. This is a manual checklist for the user.**

- [ ] **Step 1: Register basiscalc.xyz in Google Search Console**

Go to https://search.google.com/search-console/ and add property `basiscalc.xyz`. Verify ownership via DNS TXT record or HTML file upload.

- [ ] **Step 2: Submit sitemap**

In Search Console, go to Sitemaps → submit `https://basiscalc.xyz/sitemap-index.xml`.

- [ ] **Step 3: Register journal.basiscalc.xyz**

Add property `journal.basiscalc.xyz` as a secondary property. This is optional since we're blocking indexing, but it helps monitor if Google is respecting robots.txt.

- [ ] **Step 4: Verify robots.txt is working**

In Search Console for journal.basiscalc.xyz, use the URL Inspection tool to confirm robots.txt is blocking crawling.

---

## Task 13: Manual — Lighthouse Verification

**No code changes. Run after all code tasks are deployed.**

- [ ] **Step 1: Run Lighthouse on basiscalc.xyz**

```bash
npx lighthouse https://basiscalc.xyz --only-categories=seo,performance --output=json --output-path=./lighthouse-basiscalc.json
```

Check:
- SEO score > 90
- LCP < 2.5s
- All meta tags detected

- [ ] **Step 2: Run Lighthouse on the journal landing page**

```bash
npx lighthouse https://basiscalc.xyz/tools/trading-journal/ --only-categories=seo,performance --output=json --output-path=./lighthouse-journal-landing.json
```

Check same criteria.

- [ ] **Step 3: Fix any issues flagged by Lighthouse**

Address any missing meta tags, performance issues, or accessibility warnings that affect SEO score.
