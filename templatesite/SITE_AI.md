# Instructions for Site / Template AI

Use this when editing tenant sites on Vercel (`*.styldd.com`).

**Code locations in this repo** (there is no separate `templatesite/` app folder — the Vercel project root *is* the template):

| Area | Path |
|------|------|
| Subdomain routing | `middleware.js` |
| Published-site gate + shared loader | `js/styld-tenant-shared.js` (`loadPublishedSite`) |
| Profile / home tenant bootstrap | `js/tenant-site.js` |
| Booking flow | `js/styld-tenant-booking.js`, `js/booking.js` |
| Profile layout + cover hero | `js/profile-content.js`, `css/styles.css`, `tenant/profile.html`, `tenant/book.html` |
| Legacy index preview hero | `js/preview-content.js`, `tenant/index.html` |

## Hero layout: `cover` (Full screen splash)

When `site_theme.heroLayout === 'cover'`:

1. **Screen 1 — `/` (splash only)** — full-viewport hero photo, centered `brandName` + **Book Now** below the name. No About, policies, menu, or location. `overflow: hidden` on `html`/`body`; no scroll.
2. **Splash Book Now** — navigates to **`/book`** (real page load). Does **not** scroll on the same page and does **not** go to `/booking` (checkout).
3. **Nav Book Now on splash** — also links to **`/book`**. Nav **Book Now on `/book`** links to **`/booking`** (checkout).
4. **Screen 2 — `/book`** — About Me, Policies, services menu, location (same blocks as split layout’s main content). Nav brand links back to `/`.

| File | Role |
|------|------|
| `tenant/profile.html` | Splash page when `heroLayout === 'cover'` |
| `tenant/book.html` | About + policies + menu + location |
| `middleware.js` | `'/book': '/tenant/book.html'` |
| `js/profile-content.js` | Splash vs book page detection (`page-splash`, `page-cover-splash`, `profile-nav--cover-splash`) |
| `scripts/sync-cover-header-to-live.ps1` | Copy + validate cover assets into `templatesite/` mirror |
| `scripts/enable-cover-header-layout.sql` | Set `heroLayout: cover` in Supabase for a user |

Splash cover also supports `theme.heroCoverBlur` (soft blur on hero bg) and `theme.textColors` (see below). `hideBookNowButton` only hides `.profile-nav .profile-book-btn`, not the splash overlay CTA.

The mobile app exposes **Site editor → Photos → Header style → Full screen**, which persists `heroLayout: 'cover'` in `site_theme` JSON. In-app preview should show splash only for cover mode; **Book Now** opens `/book` on the live site.

## Granular text colors (`textColors`)

The app stores optional hex overrides in `site_theme.textColors`. `applySiteTheme()` in `js/styld-tenant-shared.js` maps each key to a CSS variable on `:root`. Omit any key to keep the default (heading/price/serviceName → `--ink`, body/muted → `--muted`, accent/link → `--pink`).

| Key | CSS variable | Used for |
|-----|--------------|----------|
| `heading` | `--text-heading` | Section titles (Menu, About Me, Policies, Location, Reviews) |
| `body` | `--text-body` | Bio paragraphs, policy bullets, service descriptions |
| `muted` | `--text-muted` | Menu blurbs, durations, small labels |
| `serviceName` | `--text-service-name` | Menu card titles |
| `price` | `--text-price` | Menu card prices |
| `accent` | `--text-accent` | Title underlines, active category tabs |
| `link` | `--text-link` | Address, email, Instagram links |
| `nav` | `--text-nav` (+ `--nav-text`) | Nav bar brand name |
| `navButton` | `--text-nav-button` | Top-right Book Now label |
| `navButtonBg` | `--text-nav-button-bg` | Top-right Book Now background |
| `splashBrand` | `--text-splash-brand` | Full-screen splash business name |
| `splashButton` | `--text-splash-button` | Splash centered Book Now text |
| `splashButtonBg` | `--text-splash-button-bg` | Splash centered Book Now background |

Example:

```json
{
  "primaryColor": "#2563eb",
  "secondaryColor": "#0a0a0a",
  "textColors": {
    "heading": "#111827",
    "body": "#4b5563",
    "muted": "#9ca3af",
    "price": "#111827",
    "serviceName": "#111827",
    "accent": "#2563eb",
    "link": "#2563eb",
    "splashBrand": "#ffffff",
    "splashButton": "#111827",
    "splashButtonBg": "#ffffff"
  }
}
```

Profile CSS uses fallbacks, e.g. `color: var(--text-price, var(--ink));` — do **not** hardcode colors on `.profile-*` when a token exists.

`textColorSources[key]` links a token to the palette (`accent`, `text`, `background`, `navbar`) or `custom` (uses `textColors[key]` hex). Linked colors re-resolve when palette changes in `applySiteTheme()`.

## Hide About Me / Policies (`hiddenSections`)

`site_content.hiddenSections` is a string array. If an id is **in** the array, that block is hidden on the live site.

| Toggle off in app | `hiddenSections` includes | Live effect |
|-------------------|---------------------------|-------------|
| About Me | `"aboutMe"` | `#profile-about-block` hidden |
| Policies | `"policies"` | `#profile-policy-block` hidden |

On **`/book`** (cover layout): if both hidden, `.profile-book-intro` is hidden and the page starts at the menu. On **split** home: `.profile-info` beside the hero hides when both are off.

Other ids: `"menu"`, `"visit"`, `"reviews"` — `[data-site-section="..."]` elements.

## Style add-ons (`style_catalog_meta`)

Optional add-ons per style in `site_setting` → `style_catalog_meta`:

```json
{
  "studio-skin-fade": {
    "title": "Skin Fade",
    "durationMinutes": 45,
    "addons": [
      { "id": "addon-abc", "name": "Beard trim", "price": 15 }
    ]
  }
}
```

Base price stays in `style_price_overrides`. Menu display in `tenant-site.js` / `styld-tenant-shared.js`:

- No add-ons → `$35`
- With add-ons → `$35–$55` (base through base + highest add-on price, en-dash)

Helpers: `normalizeAddons(raw)`, `formatStylePriceRange(basePrice, addons)`. `buildBookingStyles` passes `addons` on each style.

**Booking page (`/booking`):** After selecting a service with add-ons, an **Optional add-on** radio group appears. Pricing shows service base, optional add-on line, and total (base + selected add-on). Deposit recalculates from total. Saved on booking: `style_name` (e.g. `Skin Fade + Beard trim`), `selected_addon_id`, `selected_addon_name`, `selected_addon_price`.

## Subscription-gated domains

Styld sites are **not free hosting**. A stylist must have an **active Styld subscription** (RevenueCat entitlement `pro`, products `styld_monthly` / `styld_yearly`) to keep a live subdomain.

### Rules

1. **Publish requires subscription** — The mobile app checks RevenueCat before first publish. Server function `subscription-site-sync` verifies again on publish.
2. **Live = `published_at` is set** — Public tenant pages only load when `styld_site_subdomains.published_at` is not null for that subdomain.
3. **Cancel mid-term → site goes offline** — When subscription lapses, `subscription-site-sync` clears `published_at` (and registry `published_at`). The subdomain slug is kept; content stays in `styld_site_records`.
4. **Resubscribe → publish again** — After paying, the stylist taps Publish in the app (or mandatory paywall flow republishes) to set `published_at` and bring `https://{subdomain}.styldd.com` back.

### What tenant JS must do

- Resolve subdomain from host (`{slug}.styldd.com`) or `?subdomain=` query.
- Load `styld_site_subdomains` and require `published_at` before loading `styld_site_records`.
- Use `cache: 'no-store'` (or equivalent) when fetching the subdomain row — do not treat tenant sites as permanently live in HTTP cache.
- If missing or unpublished, show a friendly offline message — **do not** render booking UI or accept payments.

**Offline copy** (constant `StyldTenant.SITE_OFFLINE_MESSAGE` in `js/styld-tenant-shared.js`):

> This site is temporarily offline. The owner needs an active Styld subscription to keep their booking site live.

### Do not

- Bypass `published_at` checks.
- Cache tenant HTML as “always live” without revalidating subdomain row.
- Store subscription state in static files — always read Supabase.

### Supabase sources of truth

| Check | Table / RPC |
|-------|-------------|
| Is subdomain live? | `styld_site_subdomains.published_at IS NOT NULL` |
| Tenant data | `styld_site_records` for resolved `user_id` |
| Bookings / payments | RPCs using `styld_resolve_published_user_id(subdomain)` |

**Supabase project:** `gogpjxxsrcjpbugocvnd`

### Edge functions (main Supabase project)

- `subscription-site-sync` — `verify` (pre-publish) or `sync` (unpublish if not entitled)
- `revenuecat-subscription-status` — app subscription check

### App behavior

- No subscription + not yet published → paywall before publish.
- Was published + subscription lapsed → paywall + site offline until resubscribe and republish.

### Deploy

Redeploy this Vercel project after changing tenant JS or offline copy so `*.styldd.com` picks it up.

### Known gap

If someone cancels and never opens the app, unpublish runs on next app open. For instant takedown without opening the app, add a RevenueCat webhook later.

