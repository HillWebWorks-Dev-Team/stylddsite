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

Functions that must match exactly:

- `normalizeMainSectionOrder` / `mergeMainSectionOrder`
- `resolveMainSectionOrder`
- `resolveHeroSidebarSections`
- `isHeroProfileGroupInMain` / `getHeroProfileGroupSectionIds`
- `reorderMainSections` (live JS) ↔ `orderMainSections` (preview TS)

After editing either file, diff the algorithms side by side and verify identical behavior.

---

## SECTION ORDERING — exact behavioral spec

### Reorderable section IDs (exactly 7)

`'aboutMe' | 'policies' | 'reviews' | 'portfolio' | 'menu' | 'faq' | 'visit'`

Default order:

```js
['aboutMe', 'policies', 'reviews', 'portfolio', 'menu', 'faq', 'visit']
```

### DOM element map

| Section ID | Element ID | Wrapper when moved to main |
|------------|------------|----------------------------|
| aboutMe | `#profile-about-block` | `.profile-ordered-block-section` |
| policies | `#profile-policy-block` | `.profile-ordered-block-section` |
| reviews | `#profile-reviews-section` | (none) |
| portfolio | `#profile-portfolio-section` | (none) |
| menu | `#profile-menu-section` | (none) |
| faq | `#profile-faq-section` | (none) |
| visit | `#profile-location-section` | (none) |
| profile grp | `#profile-header-main-section` | `.profile-header-main-section` |

### Normalization (`resolveMainSectionOrder`)

1. Filter saved order to valid unique IDs, preserving order.
2. Insert any missing IDs at their default template positions.
3. If result length ≠ 7, fall back to full default order.
4. `hiddenSections` hides content but does **not** remove IDs from order.

### Rule A — Hero sidebar vs main (split layout only)

Applies when **all** of:

- `heroLayout === 'split'`
- `heroAboutBesidePhoto !== false` (default: true)
- `heroPhotoEnabled !== false` (photo visible)

About Me + Policies can live beside the header photo in `.profile-info` inside `.profile-hero`.

`resolveHeroSidebarSections(order)`:

1. Find first index of `aboutMe` or `policies` in order.
2. If neither exists → sidebar is empty.
3. If **any** non-hero section (`reviews`, `portfolio`, `menu`, `faq`, `visit`) appears **before** that index → sidebar is empty → about/policies move to `<main>`.
4. Otherwise → all `aboutMe` + `policies` in order go to hero sidebar.

### Rule B — Profile header group in main

When split + about-beside-photo ON, but sidebar rules fail (another section is above about/policies):

- `isHeroProfileGroupInMain === true`
- Create composite `#profile-header-main-section` in `<main>`
- Contains: header photo + about + policies inline (`.profile-header-main-section`)
- Top hero gets `.profile-hero--hidden` (photo moves into main composite)

### Rule C — About beside photo OFF (`heroAboutBesidePhoto: false`)

- About and policies **never** go in hero sidebar
- They only appear in `<main>` following `mainSectionOrder`
- Wrapped in `.profile-ordered-block-section` when in main
- Hero photo still shows at top (unless `heroPhotoEnabled: false`)

### Rule D — Cover layout

**Home** (`page-splash` / `page-cover-splash`):

- Full-screen cover splash only
- All `.profile-below-hero` content hidden
- Overlay shows brand name + centered Book Now CTA

**Book page** (`page-book`):

- No hero section
- About/policies use split placement rules with `treatAsSplit: true`
- All other sections in `<main>` follow `mainSectionOrder`
- Nav Book Now links to `/booking`

### Rule E — Stack layout

- Pinned banner images at top (`.profile-hero--stack`)
- Wide: aspect-ratio 3/1 full width; tall: 4/9, max-width 400px centered
- Photo column in split grid hidden; banner replaces it
- Sections below follow `mainSectionOrder` in `<main>`

### Rule F — No photo / minimal

- `heroPhotoEnabled: false` → hide photo column, grid gets `--no-photo` modifier
- `heroLayout: 'minimal'` → entire `.profile-hero` hidden
- Cover splash can still use hero image when `heroPhotoEnabled: false`

### `reorderMainSections` algorithm

For each ID in `resolveMainSectionOrder(content)`:

1. Skip `aboutMe`/`policies` if already in hero sidebar
2. If `profileGroupInMain` and this is the first hero-group section → emit `#profile-header-main-section` once
3. Otherwise emit the section's DOM node into `<main>` in order
4. When `aboutMe`/`policies` are in main (not sidebar, not composite) → wrap in `.profile-ordered-block-section`

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
