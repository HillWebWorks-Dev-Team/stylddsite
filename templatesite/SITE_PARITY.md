# Live site ↔ preview parity

The **in-app Site Editor preview is the source of truth** for how tenant sites should look and behave. Any divergence is a bug unless explicitly documented here or in `SITE_AI.md`.

## Project context

Styld is an Expo/React Native app where stylists edit their booking site. The preview is built as inline HTML in the app — it does **not** load `templatesite/css/styles.css`. The live site loads tenant HTML + `profile-content.js` + `styles.css` from Supabase data.

### Architecture

**APP (preview):**

- `src/lib/sitePreviewHtml.ts` — builds full inline HTML + embedded `SITE_PREVIEW_CSS`
- `src/components/site/SitePreviewWebView.tsx` — renders preview in WebView
- `src/data/siteContent.ts` — section order logic (TypeScript source of truth)
- `src/data/siteTheme.ts` — hero layout, photo settings, colors
- `src/lib/siteTextColors.ts` — text color CSS variable resolution
- `src/components/site/SiteSectionOrderEditor.tsx` — Order tab UI

**LIVE (tenant site — this repo):**

| Area | Path |
|------|------|
| Home / splash | `tenant/profile.html` |
| Book page | `tenant/book.html` |
| Content + reorder | `js/profile-content.js` |
| Supabase bootstrap | `js/tenant-site.js` |
| Shared loader / theme | `js/styld-tenant-shared.js` |
| Styles | `css/styles.css` |
| Ops docs | `templatesite/SITE_AI.md` |

Data saved from app → Supabase `styld_site_records`:

- `site_content.mainSectionOrder` — section order array
- `site_content.hiddenSections` — hidden but still in order
- `site_content.portfolioPlacement` — legacy, synced from order
- `site_theme` — hero layout, photos, colors, fonts, etc.

---

## CRITICAL RULE: duplicate logic must stay identical

These two files implement **the same** ordering/hero rules. Any change to one **must** be mirrored in the other:

1. `src/data/siteContent.ts` (TypeScript, app repo)
2. `js/profile-content.js` (JavaScript mirror, this repo)

Functions that must match in **behavior** (preview TS may use different helper names):

- `resolveMainSectionOrder`
- `shouldPlaceAboutBesidePhoto` / hero sidebar (About Me **only** — not Policies)
- `reorderMainSections` (live JS) ↔ `orderMainSections` (preview TS)
- `resetHeroLayoutState` before applying `heroLayout`
- `normalizeSiteTheme` on load (`heroLayout` / `hero_layout`, lowercase)

After editing either file, diff the algorithms side by side and verify identical behavior.

---

## SECTION ORDERING — exact behavioral spec

### Reorderable section IDs (exactly 7)

`'aboutMe' | 'policies' | 'reviews' | 'portfolio' | 'menu' | 'faq' | 'visit'`

Default order:

```js
['aboutMe', 'policies', 'reviews', 'portfolio', 'menu', 'faq', 'visit']
```

### DOM element map (live site)

| Section ID | Element ID | Notes |
|------------|------------|-------|
| aboutMe | `#profile-about-block` | May move into `#profile-info-block` beside photo (split home) or `#profile-book-intro` on `/book` when first in order |
| policies | `#profile-policy-block` | Always in `<main>` at order position (wrapped in `.profile-ordered-block-section`) |
| reviews | `#profile-reviews-section` | (none) |
| portfolio | `#profile-portfolio-section` | (none) |
| menu | `#profile-menu-section` | (none) |
| faq | `#profile-faq-section` | (none) |
| visit | `#profile-location-section` | (none) |

**Shell elements:** `#profile-info-block` (`.profile-info`), `.profile-main-intro`, `#profile-book-intro` (cover `/book`), `.profile-ordered-block-section` wraps for About/Policies in main flow.

**Removed (do not reintroduce):** `#profile-header-main-section` composite, `#profile-hero-about-slot`, `#profile-about-section`, `#profile-policies-section`.

### Normalization (`resolveMainSectionOrder`)

1. Filter saved order to valid unique IDs, preserving order.
2. Insert any missing IDs at their default template positions.
3. If result length ≠ 7, fall back to full default order.
4. `hiddenSections` hides content but does **not** remove IDs from order.

### Rule A — About Me beside photo (split home only)

Applies when **all** of:

- `heroLayout === 'split'`
- Not `/book`, not cover splash (`body.page-cover-splash` only — not all `page-home`)
- `heroAboutBesidePhoto !== false`
- `heroPhotoEnabled !== false`
- `aboutMe` is **index 0** in `mainSectionOrder`
- About Me has body text and is not hidden

→ Move `#profile-about-block` into `#profile-info-block` in the hero grid. **Policies never** go beside photo.

### Rule B — About beside photo OFF or not first in order

- About Me stays in `<main>` at its order position
- Policies always in `<main>` at their order position

### Rule C — Cover layout

**Home** (`page-cover-splash` only — added by JS, not default HTML):

- Full-screen cover splash only
- All `.profile-below-hero` content hidden
- Overlay shows brand name + centered Book Now CTA

**Book page** (`page-book`):

- No hero section
- When `aboutMe` is first in order → About in `#profile-book-intro` > `#profile-info-block`
- All other sections (including Policies) in `<main>` follow `mainSectionOrder`
- Nav Book Now links to `/booking`

### Rule D — Stack layout

- Pinned banner images at top (`.profile-hero--stack`)
- Wide: aspect-ratio 3/1 full width; tall: 4/9, max-width 400px centered
- Photo column in split grid hidden; banner replaces it
- Sections below follow `mainSectionOrder` in `<main>`

### Rule E — No photo / minimal

- `heroPhotoEnabled: false` → hide photo column, grid gets `--no-photo` modifier
- `heroLayout: 'minimal'` → entire `.profile-hero` hidden
- Cover splash can still use hero image when `heroPhotoEnabled: false`

### `reorderMainSections` algorithm

1. `populateAboutMe()` / `populatePolicies()` on `#profile-about-block` / `#profile-policy-block`
2. If split home + Rule A → About in `#profile-info-block` beside photo via `layoutProfileInfo()`
3. If `/book` + About first → About in `#profile-book-intro`; else About in main with `.profile-ordered-block-section` wrap
4. Policies always appended to `<main>` at order position inside `.profile-ordered-block-section`
5. Other sections appended to `<main>` in `resolveMainSectionOrder` order

**Do not** use `insertBefore` in `populatePortfolio()` or elsewhere — all ordering goes through `reorderMainSections`.

---

## REVIEWS SECTION

Show only when **all** true:

- `reviews_settings.enabled !== false`
- `'reviews'` not in `hiddenSections`
- at least 1 review exists

Title: **Client Reviews** — centered, **no** underline on title.

Marquee: ~42s linear infinite, pauses on hover. Cards: no avatars, name, yellow stars, 72-char truncate, click opens modal.

---

## MENU CATEGORY FILTERS — underline tabs (not pills)

```css
.profile-menu-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 1px solid rgba(0,0,0,.08);
  margin-bottom: 1.25rem;
}
.profile-menu-filter {
  padding: .45rem .9rem;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  background: transparent;
  font-weight: 600;
  color: var(--text-heading, var(--ink));
  cursor: pointer;
}
.profile-menu-filter--active {
  color: var(--text-heading, var(--ink));
  border-bottom-color: var(--text-accent, var(--pink));
}
```

NOT pill tabs. NOT filled background on active. NOT `--muted` for inactive text.

---

## TEXT / THEME COLOR VARIABLES

Both preview and live must resolve CSS variables on `:root` from `site_theme`. See `SITE_AI.md` for the full token table.

**Required on live:** `tenant-site.js` → `__STYLD_SITE_THEME__` must include:

- `heroPhotoEnabled`
- `heroAboutBesidePhoto`
- `textColors`
- `textColorSources`

`profile-content.js` reads these flags — missing fields cause live to ignore explicit `false` values.

---

## CSS SYNC WORKFLOW

Preview CSS lives inline in `sitePreviewHtml.ts` as `SITE_PREVIEW_CSS`. Live CSS lives in `css/styles.css`.

When you change any `.profile-*` visual rule:

1. Update `css/styles.css` (live)
2. Mirror the same rule into `SITE_PREVIEW_CSS` in the app repo
3. Mirror theme override block rules if present

---

## TASK WORKFLOW

1. Read `sitePreviewHtml.ts` for the feature you are syncing
2. Read `siteContent.ts` for ordering/hero logic
3. Mirror logic in `js/profile-content.js`
4. Mirror CSS from `SITE_PREVIEW_CSS` into `css/styles.css`
5. Verify tenant HTML has correct element IDs
6. Update `SITE_AI.md` / this file if behavior docs change
7. Run parity checklist below

When fixing a bug: fix preview first (if preview is wrong), then sync live. If live is wrong and preview is right, fix live only.

---

## PARITY TEST CHECKLIST

Test the **same** stylist config in app preview **and** live site.

### Section order

- [ ] Default order shows all 7 sections top to bottom
- [ ] Drag portfolio below menu → live matches preview
- [ ] Move reviews to bottom → marquee after FAQ on both
- [ ] Split + about beside ON: about/policies first → beside photo in hero
- [ ] Split + about beside ON: menu above aboutMe → about/policies in `<main>` wrapped
- [ ] Split + about beside ON: menu above about → `#profile-header-main-section` composite
- [ ] Split + about beside OFF: about/policies only in `<main>`, photo at top
- [ ] Cover home: splash only; cover `/book`: sections in order
- [ ] `hiddenSections`: hidden on both, still in Order tab

### Hero / photos

- [ ] Split photo with drag-to-reposition focus
- [ ] Stack wide and tall formats
- [ ] Cover blur on/off
- [ ] No header photo toggle
- [ ] `hideBookNowButton`

### Reviews

- [ ] Off in settings → hidden both
- [ ] Zero reviews → hidden both
- [ ] 3+ reviews → marquee + modal both

### Menu

- [ ] Category underline tabs with primary text + accent underline
- [ ] Filter by category hides cards
- [ ] Outlined card layout + custom outline color

### Colors

- [ ] All text color groups from Site editor → Text colors tab
- [ ] Section heading underlines use accent color

### Regression triggers

- [ ] Edited `siteContent.ts` → updated `profile-content.js`
- [ ] Edited `styles.css` `.profile-*` → updated `SITE_PREVIEW_CSS`
- [ ] Added theme field → updated `tenant-site.js` + app `SitePreviewTheme` type
- [ ] Changed HTML section IDs → updated `getMainSectionElement` + preview builders

---

## How to use this doc

1. **Full parity pass** — “Audit live vs preview and fix all gaps listed.”
2. **One feature** — “Only fix section reordering today” or “Only sync menu category filter CSS.”
3. **After preview edit** — “I changed `sitePreviewHtml.ts` — sync live to match.”

Goal: a stylist drags sections in the Order tab, toggles Photos settings, picks colors — and publishes to see the **exact same page** they saw in the app preview.
