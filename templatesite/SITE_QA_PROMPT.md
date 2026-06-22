# Styld Site AI — Full QA & Parity Audit Prompt

Use this when auditing tenant sites, in-app previews, and the mobile site editor.

**Repo note:** Live tenant sites deploy from the **repo root** (`tenant/`, `js/`, `css/`, `middleware.js`). The `templatesite/` folder is a mirror + docs for Site AI. App code (`src/lib/sitePreviewHtml.ts`, `SiteEditorScreen.tsx`, etc.) lives in the **Expo app repo**, not here.

---

## System architecture (must understand first)

Styld has **three surfaces** that must stay aligned:

1. **Live tenant sites** — repo root, deployed to Vercel (`stylddsite` project). Served at `{subdomain}.styldd.com`. Loaded via `js/tenant-site.js` → `js/profile-content.js` (and booking JS).
2. **In-app WebView preview** — `src/lib/sitePreviewHtml.ts` generates inline HTML/CSS/JS bundled in the Expo app. Used on Site tab, Site Editor, onboarding.
3. **Mobile site editor** — React Native in `src/components/site/`, `src/screens/SiteEditorScreen.tsx`, theme stored in Supabase `styld_site_records` under `site_theme` JSON.

**Critical rule:** Changes to live site behavior require updates in **both** live template files **and** `src/lib/sitePreviewHtml.ts`. If only one is updated, previews will lie to users.

**Deploy rule:** Live sites only update after Vercel production deploy from repo root. App preview updates on app reload. Never claim parity without checking both.

---

## Subscription & publish gating (non-negotiable)

Verify per `templatesite/SITE_AI.md`:

- [ ] Tenant pages only load when `styld_site_subdomains.published_at IS NOT NULL`.
- [ ] Unpublished or lapsed subscription shows offline message — **no booking UI, no payments**.
- [ ] `subscription-site-sync` and RevenueCat `EXPIRATION` webhook unpublish correctly.
- [ ] App publish flow checks subscription before setting `published_at`.
- [ ] Do **not** bypass publish checks in tenant JS, middleware, or RPCs.

Test: unpublished subdomain → friendly offline page. Republish after subscription → site returns.

---

## Hero layouts — all 5 must work on live + preview

Supported layouts (`SiteTheme.heroLayout`):

| Layout | Behavior |
|--------|----------|
| `split` | Text beside tall hero photo (4:5), about/policy beside photo on desktop |
| `stack` | Vertical collage of header images (no single hero photo) |
| `cover` | Full-screen splash on home; Book Now → `/book` page with about, policies, menu |
| `image-below` | Hero photo above centered headline |
| `minimal` | Text-only hero, no photo |

**Audit checklist:**

- [ ] Each layout renders correctly in `tenant/profile.html` + `profile-content.js`.
- [ ] Same layout logic exists in `sitePreviewHtml.ts` (`buildProfileSitePreviewHtml`, `buildHeroInnerHtml`).
- [ ] Switching layout in app editor updates preview immediately and persists to Supabase.
- [ ] Live site reflects saved `heroLayout` after deploy.
- [ ] Mobile responsive behavior matches (split stacks on mobile, profile image bleeds full width, etc.).

**Cover layout specifics:**

- [ ] Splash shows brand name + Book Now; top-left brand text uses **`--text-splash-brand`** (white default), NOT dark nav text.
- [ ] `/book` shows about, policies, services menu — not on splash.
- [ ] Optional `heroCoverBlur` softens background image on splash.
- [ ] Preview WebView `fitCoverPreview()` works in compact editor pane.
- [ ] Cover splash nav brand color matches live site.

**Split / single hero photo:**

- [ ] Hero image uses `heroImageFocusX` / `heroImageFocusY` (or legacy `heroImagePosition`) for `object-position` / `background-position`.
- [ ] Editor drag-to-reposition matches live crop.
- [ ] Aspect ratio ~4:5 for split hero.

---

## Stack layout — detailed requirements

Stack uses `heroStackImagePaths[]` + `heroStackImageFocus[]` + `heroStackImageFormat` (`wide` | `tall`).

**Image format:**

- `wide` (default): **3:1**, full-bleed width (`.profile-hero-stack--wide`)
- `tall`: **4:9**, centered column max ~400px (`.profile-hero-stack--tall`)

**CSS must exist in all three places:**

- `css/styles.css` — live
- `templatesite/css/styles.css` — mirror
- `sitePreviewHtml.ts` inline CSS — app repo

**JS must apply format class:**

- `profile-content.js`: `stackEl.className = 'profile-hero-stack profile-hero-stack--' + stackFormat`
- `tenant-site.js`: passes `heroStackImageFormat`, `heroStackImageFocus` in `window.__STYLD_SITE_THEME__`

**Image count:** No maximum — users can add 0, 1, or many stack images.

---

## Theme, colors & typography

Brand colors, text colors (`textColors`, `textColorSources`), fonts, style cards (`styleCardLayout`: `card` | `outlined`).

---

## Site content sections

Brand name, taglines, about, policies, menu, visit & connect, reviews, `hideBookNowButton`, `hiddenSections` / `isSectionHidden`.

---

## Style catalog & add-ons (booking-critical)

Add-ons in `style_catalog_meta`. Menu price ranges. Booking page add-on picker. See `SITE_AI.md`.

---

## Booking & payments

Payment modes: `in_person` / `none`, `deposit`, `full`. Styld Pay gating: when Stripe not ready, fall back to no online payment.

Files: `js/booking.js`, `js/styld-tenant-booking.js`, `js/styld-tenant-shared.js` (`resolveEffectiveBookingPayment`).

---

## Preview ↔ live parity matrix

Compare `sitePreviewHtml.ts` (app) vs live template for each hero layout, stack format, colors, fonts, menu cards, CTAs, breakpoints.

**Known sync points:**

- `src/lib/sitePreviewHtml.ts` ↔ `css/styles.css`
- `js/profile-content.js` ↔ preview hero rendering logic
- `js/tenant-site.js` ↔ `buildSitePreviewTheme()` theme field passthrough

---

## Regression tests to run manually

1. Stack wide — 3 images, drag focus, preview + publish, verify live.
2. Stack tall — 2 portrait images, centered 4:9 frames.
3. Stack unlimited — 10+ images, no cap.
4. Cover — blur, light splash brand, Book Now → `/book`.
5. Split — hero crop matches live.
6. Colors — drag picker + hex, CSS vars on preview + live.
7. Add-ons — book on live site, price updates.
8. Pay in person — Styld Pay disconnected → no checkout.
9. Unpublished site — offline message only.

---

# Audit results (2026-06-07)

Audited **live template in this repo** by tracing code. App preview (`sitePreviewHtml.ts`) is **out of scope here** — must be verified in the Expo app repo separately.

## Summary

| Section | Status | Notes |
|---------|--------|-------|
| Subscription & publish gating | **Pass** | `js/styld-tenant-shared.js` `loadPublishedSite()` requires `published_at`; offline message, no booking when unpublished |
| Cover layout (live) | **Pass** | Two-page flow: `/` splash, `/book` content; `middleware.js`, `profile-content.js`, `css/styles.css` |
| Cover nav brand color | **Pass** (fixed) | `.profile-nav--cover-splash .profile-brand` now uses `--text-splash-brand` |
| Split layout + hero focus | **Pass** | `heroImageFocusX/Y`, `heroBackgroundPosition()` in `profile-content.js`; 3:4 `.profile-photo` |
| Stack layout | **Pass** (fixed) | `heroStackImageFormat`, `heroStackImageFocus`, `--wide`/`--tall` CSS, per-image `object-position` |
| `image-below` / `minimal` (live) | **Pass** (fixed) | Added to `profile-content.js` + CSS; was only in legacy `preview-content.js` |
| Text colors | **Pass** | `applySiteTheme()` → `--text-*` vars; profile CSS uses fallbacks |
| Hidden sections | **Pass** | `hiddenSections`: aboutMe, policies, menu, visit, reviews |
| Footer | **Pass** | Always dark; not themed from `backgroundColor` |
| Style add-ons + menu ranges | **Pass** | `normalizeAddons`, `formatStylePriceRange`, booking add-on UI in `booking.js` |
| `styleCardLayout` on live menu | **Pass** (fixed) | `buildProfileServiceCards()` respects `outlined` |
| Booking payment / Styld Pay fallback | **Pass** (fixed) | `resolveEffectiveBookingPayment()` forces `mode: none` when Stripe unavailable |
| Stack image cap | **Pass** | No `length < 6` checks in live template |
| RevenueCat instant unpublish webhook | **Partial** | Documented gap in `SITE_AI.md`; relies on `subscription-site-sync` cron |
| App preview parity | **Cannot verify** | `src/lib/sitePreviewHtml.ts` not in this repo |
| Mobile editor UX (drag picker, stack editor) | **Cannot verify** | App repo only |
| Booking confirmation emails | **Not audited** | Resend edge functions not traced in this pass |
| `normalizeSiteTheme()` defaults | **Cannot verify** | `src/data/siteTheme.ts` in app repo |

## Files changed in this audit pass

| File | Change |
|------|--------|
| `js/profile-content.js` | Stack format/focus; minimal + image-below; styleCardLayout; stack cleanup |
| `js/tenant-site.js` | Pass `heroStackImageFormat`, `heroStackImageFocus` |
| `js/styld-tenant-shared.js` | `resolveEffectiveBookingPayment()` |
| `js/styld-tenant-booking.js` | Apply payment fallback before booking.js loads |
| `css/styles.css` | Stack wide/tall, minimal, image-below, cover nav brand token |
| `tenant/profile.html`, `tenant/book.html` | CSS cache bust `v=51` |
| `scripts/sync-cover-header-to-live.ps1` | Sync booking + stack markers |
| `templatesite/*` | Mirror synced |

## Deploy note

**Vercel redeploy required** for all live template fixes. After deploy, hard-refresh tenant sites (`Ctrl+Shift+R`). App preview changes require a separate update to `sitePreviewHtml.ts` in the Expo repo.

## Remaining work (app repo / infra)

1. **`sitePreviewHtml.ts`** — mirror stack format/focus, minimal, image-below, cover nav brand, styleCardLayout, payment UI labels if preview shows booking settings.
2. **RevenueCat `EXPIRATION` webhook** — instant unpublish if not already wired.
3. **Manual regression** — run the 9 tests above on a staging subdomain after deploy.
