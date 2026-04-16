# SEO & Commercial Strategy: basiscalc.xyz + journal.basiscalc.xyz

**Date**: 2026-04-16
**Status**: Draft
**Goal**: Maximize organic traffic and affiliate revenue across both properties

## Context

- **basiscalc.xyz**: Astro SSG site with trading tools (Hyperliquid/GMX liquidation calculators), guides, and affiliate revenue model
- **journal.basiscalc.xyz**: React SPA trading journal served by Express, currently free with no monetization
- **Target audience**: English-speaking overseas crypto/forex traders
- **Revenue model**: Affiliate income (exchange referrals) + traffic growth. Both products stay free.
- **Content cadence**: 1-2 guides per month, AI-assisted drafting with user review

## Architecture Decision: Subdomain vs Subdirectory

**Decision**: Move journal's public-facing SEO pages to basiscalc.xyz main domain.

- `basiscalc.xyz/tools/trading-journal/` — journal landing page (Astro SSG)
- `journal.basiscalc.xyz/app` — the actual SPA app (React + Express, unchanged)
- `journal.basiscalc.xyz` — robots.txt `Disallow: /`, not indexed by search engines

**Rationale**: Subdomains are treated as separate sites by Google. A new site with low domain authority benefits from consolidating all SEO-facing pages under one domain. The journal app itself doesn't need indexing — only the landing/marketing page does.

## Part 1: basiscalc.xyz Improvements

### 1.1 OG Image + Twitter Cards

Currently missing `og:image` and all `twitter:*` meta tags.

- Create default OG image (1200x630px, WebP, <200KB) at `/public/images/og-default.webp`
- Add to BaseLayout `<head>`:
  - `og:image` pointing to default image (absolute URL)
  - `twitter:card` = `summary_large_image`
  - `twitter:site` = `@liuz99004`
  - `twitter:creator` = `@liuz99004`
- Per-guide OG images are optional (future enhancement)

### 1.2 Structured Data Additions

Current: Organization + SoftwareApplication schemas. Add:

- **BreadcrumbList** schema for nested routes (`/tools/liquidation/hyperliquid/`)
- **Article** schema for each guide (author, datePublished, dateModified)
- **FAQPage** schema where guide content has Q&A structure

### 1.3 Trading Journal Landing Page

New Astro page at `/tools/trading-journal/`:

- Hero section: value proposition ("Free Trading Journal for Forex & Crypto")
- Feature highlights (pulled from current journal LandingPage.jsx content)
- CTA button → `journal.basiscalc.xyz/app`
- JSON-LD: SoftwareApplication schema (category: FinanceApplication, offers: Free)
- Unique meta description targeting "free trading journal" keywords

### 1.4 Image SEO Standards

Apply to all existing and new images:

- Descriptive `alt` attributes (e.g., "Hyperliquid liquidation price calculation example" not "screenshot")
- Keyword-rich filenames (e.g., `hyperliquid-liquidation-calculator.webp`)
- Use Astro `<Image>` component for automatic optimization and WebP conversion
- Compress OG images to <200KB

### 1.5 Other Fixes

- Footer: add Twitter and GitHub social links
- `apple-touch-icon` meta tag
- Custom 404.astro page that guides users to useful content
- Verify all guide slugs contain target keywords (do not change existing slugs that have any traffic)

## Part 2: journal.basiscalc.xyz Improvements

### 2.1 Scope Reduction

With the landing page moved to basiscalc.xyz, journal's SEO scope is minimal:

- No SSR needed — app stays pure SPA
- No need for Express template rendering

### 2.2 Remaining Fixes

- **`lang` attribute**: Change `index.html` from `lang="zh-CN"` to `lang="en"`
- **robots.txt**: Express route serving `Disallow: /` — entire subdomain excluded from indexing
- **Basic meta tags**: Keep title "Trading Journal" and add a description in index.html for when users share the app URL directly
- **OG image**: Add journal-specific OG image for social sharing of app links
- **Canonical tag**: `<link rel="canonical" href="https://journal.basiscalc.xyz/app">`

### 2.3 Analytics

- Integrate Umami (same instance at `analytics.basiscalc.xyz`) with a separate site ID for journal
- Track in-app user behavior for product decisions

## Part 3: Affiliate Optimization

### 3.1 Link Placement Strategy

- **Guide mid-content CTA**: Natural contextual mention (e.g., "You can try this on Hyperliquid with a 5% fee discount")
- **Post-calculation CTA**: After user completes a calculation, show "Open this position on [Exchange] →" — highest conversion point
- **No affiliate links on landing pages** — landing pages build trust, not sell
- All affiliate links: `rel="sponsored nofollow"` (already implemented)

### 3.2 Affiliate Channel Expansion

Priority order:

1. **TradingView** (highest priority) — user base overlaps perfectly with trading journal users, strong brand credibility
2. **Bybit or Bitget** (pick one) — futures trading affiliate, pairs with liquidation calculator content
3. Keep Hyperliquid and GMX (existing)

Each new affiliate requires a corresponding guide or tool to provide context. Do not add affiliate links without supporting content.

### 3.3 Cross-Site Traffic Funnel

```
Google Search (long-tail keywords)
    ↓
basiscalc.xyz/guides/xxx
    ↓ (in-content CTA)
basiscalc.xyz/tools/xxx  ←→  affiliate conversion
    ↓ (navigation + guide recommendation)
journal.basiscalc.xyz/app  ←→  user retention + email collection
    ↓ (Buttondown newsletter)
Re-visit basiscalc guides  ←→  ongoing affiliate exposure
```

### 3.4 Internal Linking

- basiscalc guides naturally link to journal when mentioning trade tracking
- journal app footer: "Powered by BasisCalc" linking to basiscalc.xyz
- Cross-links between subdomain and main domain carry external link weight — leverage this

## Part 4: Content Strategy

### 4.1 Keyword Targeting

**Primary keywords** (long-term, competitive):
- "trading journal", "liquidation calculator"

**Long-tail keywords** (immediate opportunity, low competition):
- "free online trading journal no sign up"
- "hyperliquid liquidation price calculator 2026"
- "how to calculate gmx leverage liquidation"
- "best free trading journal app"
- "tradezella alternative free"
- "trading journal spreadsheet vs app"

**Content types**:
- Tool-specific guides (how to use calculators)
- Comparison articles ("X vs Y", "best free alternatives")
- Educational content (risk management, position sizing)

### 4.2 Guide Production

- 1-2 guides per month, AI-assisted drafting with user review
- Each guide targets 1-2 long-tail keywords
- Bottom CTA links to relevant tool or journal
- Article schema markup on each guide

### 4.3 Newsletter (Buttondown)

- Update signup CTA from "occasional emails" to "Monthly trading tool updates & market structure guides"
- Add email signup to journal landing page on basiscalc.xyz
- Monthly cadence: new guide summary + tool updates + trading tip
- Affiliate links embedded naturally in newsletter content

### 4.4 Social Distribution

- Post each new guide to Twitter (@liuz99004)
- Reddit (r/Forex, r/CryptoCurrency, r/FuturesTrading): build community reputation first with 20-30 valuable comments before mentioning tools. Never post direct ads.
- Crypto/trading Discord communities: participate in discussions, mention tools contextually

## Part 5: Infrastructure

### 5.1 Google Search Console

Register both properties:
- `basiscalc.xyz` (main, priority)
- `journal.basiscalc.xyz` (secondary, minimal indexing expected)

Submit sitemaps, monitor index coverage, track search performance.

### 5.2 Performance Targets (Core Web Vitals)

- LCP < 2.5s on all indexed pages
- basiscalc Astro SSG pages should hit this naturally
- journal landing page on basiscalc.xyz: same Astro SSG, no concern
- Verify with Lighthouse after implementation

### 5.3 Redirect Strategy

- If any existing URLs change, implement 301 redirects
- Do not change guide slugs that have any existing traffic
- Document redirect rules in a maintainable format

### 5.4 Mobile-First

- Verify all public pages render correctly on mobile
- Affiliate CTA buttons: minimum 48x48px touch targets
- Test with Chrome DevTools mobile emulation

## Execution Priority

Ordered by SEO impact / effort ratio:

1. Google Search Console registration (zero code, immediate value)
2. basiscalc OG image + Twitter cards (small change, unlocks social sharing)
3. journal `lang` fix + robots.txt (quick fixes)
4. basiscalc structured data additions (BreadcrumbList, Article)
5. Trading journal landing page on basiscalc.xyz (new Astro page)
6. journal OG image + canonical + basic meta tags
7. basiscalc image SEO standards + 404 page + footer social links
8. journal Umami integration
9. Newsletter CTA optimization
10. Content expansion (ongoing: 1-2 guides/month targeting long-tail keywords)
11. Affiliate channel expansion (TradingView first, then one exchange)

## Out of Scope

- Multi-language / i18n support (English-only for now)
- Paid advertising / SEM
- Journal SaaS pricing / payment integration
- Full journal migration to Astro
- Automated content generation pipeline
