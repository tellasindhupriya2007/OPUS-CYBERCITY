# Cybercity Opus Landing Page — PRD

## Original Problem Statement
Static HTML/CSS/JS landing page for Cybercity Opus (Grade-A commercial project on Road No. 45, Jubilee Hills, Hyderabad — marketed by KONU Real Estate Advisory). Hosted on Vercel at `https://opuscybercity-beige.vercel.app`. Repo: `github.com/tellasindhupriya2007/OPUS-CYBERCITY`. Iterations in this session focused on nav/hero layout refinements and a full SEO / AEO / GEO enrichment pass before a paid ad campaign.

## Architecture
- **Frontend:** single-page static HTML (`/app/index.html`) + supporting CSS/JS (`brochure.css`, `brochure.js`), post-conversion page `/app/thank-you.html`.
- **Server:** minimal Express static server (`/app/server.js`) on `0.0.0.0:3000`; also used by Vercel via `vercel.json`.
- **Styling:** Tailwind CSS — now compiled at build time (was CDN), output to `/app/dist/tailwind.css`.
- **Fonts:** Source Serif 4 (headings) + Source Sans 3 (body) — matching cybercity.in's official pair.
- **Structured data:** JSON-LD block covering Organization, WebSite, BreadcrumbList, RealEstateListing (with address, geo, offers, RERA identifier), FAQPage.
- **AI-crawlability:** `robots.txt` explicitly allows GPTBot, PerplexityBot, ClaudeBot, Google-Extended, OAI-SearchBot, Applebot-Extended, CCBot. `llms.txt` at root summarises the project factually for AI answer engines.

## User Personas
- **Corporate occupiers / regional HQs** shortlisting Grade-A office space in Jubilee Hills.
- **HNI / institutional investors** evaluating commercial real estate as an asset.
- **Luxury retail / F&B brands** looking for high-street frontage.
- **KONU sales/advisory team** — needs the page to convert cold traffic into qualified enquiries.

## Core Requirements (Static)
- Clean, editorial dark-theme presentation of the Cybercity Opus project.
- Nav lockup: KONU logo — Cybercity Builders logo — "Cybercity Opus / Jubilee Hills Road No 45".
- Hero: monumental OPUS CYBERCITY headline; CTAs "Enquire Now" and "Explore Landmark"; project meta ticker beneath (Road No. 45 · Jubilee Hills | Grade-A Office Space | G+1 High-Street Retail | Biophilic Deck | 2+5 Parking).
- Fully-crawlable, mobile-friendly, fast, AI-answer-engine-friendly.
- All content self-hosted (no dependency on temporary external CDNs).

## What's Been Implemented (dates)

### 2026-09-12 — Nav / hero refinements
- Added Cybercity Builders logo to nav; placed KONU — CYBERCITY — address text lockup at far left of the navbar.
- Stacked "Cybercity Opus / Jubilee Hills Road No 45" in extra-bold beside the logos.
- Removed "Road No. 45 · Jubilee Hills" eyebrow from above the hero headline and moved it into the info strip below the CTAs in champagne gold.
- Fixed info-strip alignment (no more orphaned pipes on wrapped lines); pipes now trail their labels.
- Swapped fonts to cybercity.in's official pair: Source Serif 4 + Source Sans 3.

### 2026-09-12 — SEO / AEO / GEO pass
- **Domain consistency:** every canonical, og:url, JSON-LD `url`, robots.txt Sitemap line, and sitemap.xml `<loc>` now uses `https://opuscybercity-beige.vercel.app`.
- **Tailwind moved off CDN:** installed `tailwindcss`, `@tailwindcss/forms`, `@tailwindcss/container-queries`, `postcss`, `autoprefixer`. Config in `/app/tailwind.config.js`, input at `/app/src/tailwind-input.css`, output at `/app/dist/tailwind.css` (~31 KB minified). Vercel build command: `npm run build`.
- **Schema enriched:** Organization now has address + `sameAs` (Instagram) + i18n contact point. RealEstateListing now has address, geo (17.4239, 78.4106), image array, RERA identifier `P02500004589`, and an AggregateOffer (offerCount 3, INR) breaking out Subdivided Suites (3,757–7,183 Sq.Ft.), Whole Floorplates (21,427–22,958 Sq.Ft.), and G+1 Retail. Added BreadcrumbList. FAQPage extended to 12 Q&As including price-per-Sq.Ft., possession timeline, and freehold/leasehold.
- **Self-hosted images:** map + 3 floor-plan images downloaded from `lh3.googleusercontent.com` into `/app/public/site/` and referenced locally; ZERO external hotlinks remain.
- **Viewport fixed:** removed `maximum-scale=1.0` and `user-scalable=no` (was blocking pinch-zoom on mobile).
- **AI-bot access:** robots.txt explicitly allows GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Claude-Web, Google-Extended, CCBot, Applebot-Extended.
- **llms.txt** added at repo root with factual project facts, RERA number, contact path.
- **Font weights trimmed:** Source Serif 4 400/500/600 and Source Sans 3 300/400/500/600/900 (was requesting weights that were unused).
- **Vercel cache headers:** immutable long-cache on `/dist/*` and `/public/*`.
- **Testing:** 26/26 backend pytest assertions passed, Playwright frontend checks passed at 1440x900 and 390x844 with zero console errors and zero horizontal overflow.

### 2026-09-12 — Enquiry form simplification
- Removed all 4 select dropdowns (Requirement Type, Purchase Purpose, Target Floor Area, Purchase Timeline) from `#enquiry-form`; only Full Name / Direct Phone Number / Official Email remain.
- Added SEO/a11y-friendly attributes: `name` (`full-name`, `phone`, `email`) + `autocomplete` (`name`, `tel-national`, `email`) on the 3 inputs.
- Testing: 5/5 Playwright checks passed — form structure, input attributes, submit → thank-you.html flow, empty-submit inline validation, and layout regression at 1440x900 + 390x844 (zero console errors, zero overflow).

## Prioritized Backlog

### P0 (before paid campaign)
- **Custom domain swap:** replace `opuscybercity-beige.vercel.app` with `https://cybercityopus.com` everywhere (index.html, robots.txt, sitemap.xml, llms.txt). User confirmed domain `https://cybercityopus.com`. Phone for CTAs: `+91 9100505070` (wa.me/919100505070).
- **Sticky mobile CTA bar:** Call (tel:+919100505070) · WhatsApp (wa.me/919100505070 pre-filled) · Enquire (#section-07) pinned to bottom on phones only (sm:hidden).
- **Trust strip under hero:** "Built by Cybercity Builders · 20+ Years · 7,500+ Homes · RERA P02500004589".
- **Lead backend:** user deferred — wire form to Resend/SendGrid later; destination email TBD.

### P1
- Replace the approximate lat/long (17.4239, 78.4106) with the exact building coordinates once confirmed.
- Add real LinkedIn / Facebook / X profile URLs into `Organization.sameAs`.
- Sticky mobile bottom bar: Call · WhatsApp · Enquire (KONU brand touch, matches cybercity.in pattern).
- Trust strip below hero: "Built by Cybercity Builders · 20+ Years · 7,500+ Homes · RERA P02500004589".

### P2
- Brochure download gate (name + phone → PDF).
- Convert images to WebP/AVIF with `<picture>` fallbacks for a further Core Web Vitals win.
- Add Google Tag Manager + Meta Pixel for the ad campaign.
- Rich-Results-Test the final canonical URL once live and iterate on any warnings.
