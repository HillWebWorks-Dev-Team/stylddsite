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

Other ids: `"menu"`, `"visit"`, `"reviews"`, `"portfolio"`, `"faq"` — `[data-site-section="..."]` elements. The portfolio and FAQ sections manage their own `hidden` state in `populatePortfolio()` / `populateFaq()` (do not drive them from the generic visibility loop).

## Previous work portfolio (`portfolioItems`)

App path: **Site editor → Content → Previous work**

| Source | Fields |
|--------|--------|
| `site_content` | `reelsTitle`, `reelsBlurb`, `portfolioPlacement` (`above_menu` \| `below_menu`, default `above_menu`), `hiddenSections` includes `'portfolio'` to hide |
| `site_theme` | `portfolioItems: { storagePath, mediaType: 'image' \| 'video' }[]` (max 24). Legacy: `galleryImagePaths: string[]` |

**Media URLs:** Supabase bucket `style-covers`, public:
`{SUPABASE_URL}/storage/v1/object/public/style-covers/{storagePath}`  
Use `StyldTenant.resolveStyleCoverUrl(path)` when available.

**Routing** — `middleware.js` `TENANT_STATIC_PAGES`:
```js
'/portfolio': '/tenant/portfolio.html',
```

**Home + book pages** — carousel preview (not a full grid):

1. Header row in `.container`: title, blurb, **View more** → `/portfolio`
2. Full-bleed carousel below: `#profile-portfolio-carousel-track`, first **5** items, horizontal scroll + scroll-snap. If **>5 items**, append a **View more** slide linking to `/portfolio` and show header **View more** (hide both when ≤5). Slides are **3:4 portrait** with **`object-fit: cover`**. Carousel videos: `autoplay muted playsinline loop`. Tap any item → fullscreen lightbox.

**Catalog page** `tenant/portfolio.html` (`body.page-portfolio`):

- Nav: brand → `/`, Book Now → `/booking`
- Back link → `/`
- `#portfolio-catalog-title`, `#portfolio-catalog-blurb`, `#portfolio-catalog-grid` — all items in responsive grid

**JS** (`js/profile-content.js`):

- `populatePortfolio()` — carousel preview + View more link; placement above/below menu
- `populatePortfolioCatalog()` — full grid on `/portfolio`
- If `body.page-portfolio`, catalog populate only; early return from `applyStyldPreviewContent()`
- Exclude `'portfolio'` from generic `[data-site-section]` visibility loop

**CSS:** `.profile-portfolio-carousel`, `.profile-portfolio-carousel__slide`, `.profile-portfolio-view-more`, `.profile-portfolio-grid--catalog`

**Section order:** Hero → Reviews → Portfolio (if above menu) → Menu → Portfolio (if below menu) → FAQ → Location → Footer. Full catalog at `/portfolio`.

## FAQ section (`faqItems`)

| Source | Fields |
|--------|--------|
| `site_content` | `faqTitle` (default `"FAQ"`), optional `faqBlurb`, `faqItems: { question, answer }[]` (both required per item), `hiddenSections` includes `'faq'` to hide |

**Placement:** On `tenant/profile.html` and `tenant/book.html`, FAQ sits between `#profile-menu-section` and `#profile-location-section`. Do not move it above the menu. `populatePortfolio()` may reorder Previous work; FAQ stays after menu (and after portfolio when `portfolioPlacement === 'below_menu'`) via `insertBefore` on `#profile-location-section`.

**HTML structure** (`profile.html` / `book.html`):

- `#profile-faq-section.profile-faq-section`
- `.profile-faq-list` > `.profile-faq-item`
- Each item: `button.profile-faq-item__question` (`aria-expanded`) + `div.profile-faq-item__answer[hidden]`
- Toggle: `span.profile-faq-item__toggle` shows pink `+` (`--text-accent`); rotate 45deg when `.is-open` to become `×`

**Visual style — minimal accordion (NOT service cards):**

- Full-width rows separated by thin bottom borders (`--card-border`), no card boxes or shadows
- Question: bold, uses `--text-service-name`; generous vertical padding (~1.15rem)
- Answer: muted (`--text-muted`), sits directly under question, no border/background on answer panel
- Inline emphasis in answers: `**text**` in `faqItems[].answer` → `<strong>` via `formatFaqAnswer()` in `profile-content.js`

**JS** (`js/profile-content.js`):

- `populateFaq(content)` — called from `applyStyldPreviewContent()` after `populatePortfolio()`
- Exclude `'faq'` from the generic `[data-site-section]` visibility loop
- Accordion: clicking `.profile-faq-item__question` toggles answer `hidden`, `.is-open`, and `aria-expanded` (`setupFaqAccordion()`)
- Do not style FAQ as menu/service cards

**CSS:** `templatesite/css/styles.css` under `/* FAQ accordion */`. Match theme variables for light/dark (`--text-service-name`, `--text-muted`, `--text-accent`, `--card-border`).

**Hide when:** `'faq'` in `hiddenSections`, or no `faqItems` entries with both question and answer filled in.

## Header nav

**Pages:** `tenant/profile.html`, `tenant/book.html`, `tenant/portfolio.html`, `tenant/certifications.html`

Sticky `.profile-nav` with brand (home), optional section tabs, and Book Now.

| Breakpoint | Behavior |
|------------|----------|
| Desktop (≥768px) | `.profile-nav__links` shows pill tabs inline between brand and Book Now |
| Mobile | `.profile-nav__menu-btn` hamburger opens `.profile-nav__drawer` below nav |

**JS** (`js/profile-content.js`):

- `populateSiteNav(content)` — visibility, labels, `.is-active` when `body.page-certifications`
- `bindSiteNavMenu()` — drawer toggle (once per page load)
- For now one tab: Certifications → `/certifications` (`data-nav-page="certifications"`)
- Hide nav tab + drawer link when `hiddenSections` includes `'certifications'`

**Future tabs:** Add matching `<a class="profile-nav__link">` in `.profile-nav__links` and `.profile-nav__drawer-link` in drawer; add `body.page-*` per route; register in `middleware.js` `TENANT_STATIC_PAGES`.

## Certifications (`certificationItems`)

App path: **Site editor → Content → Certifications**

| Source | Fields |
|--------|--------|
| `site_content` | `certificationsTitle`, `certificationsBlurb`, `hiddenSections` includes `'certifications'` to hide |
| `site_theme` | `certificationItems: { storagePath, mediaType: 'image', caption?: string }[]` (max 24). Storage: `style-covers/{userId}/certifications/` |

**Route:** `/certifications` → `tenant/certifications.html` (`body.page-certifications`)

**Layout:** Vertical stack (`.certifications-catalog-list` > `.profile-certification-item` cards). Each image uses `object-fit: contain` so the full license/certificate is visible (not cropped). Optional **caption** centered below the image (`certificationItems[].caption`).

**Page:** `#certifications-catalog-grid`; tap image → `#profile-portfolio-lightbox` (shared with portfolio).

**JS:**

- `populateCertificationsCatalog(content, theme)` — full grid on `/certifications`; early return from `applyStyldPreviewContent()` like portfolio
- `tenant-site.js` exposes `certificationItems` on `window.__STYLD_SITE_THEME__`

**Hide when:** `'certifications'` in `hiddenSections`, or no valid `certificationItems`.

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

- No add-ons, no variants → `$35`
- With add-ons only → `$35–$55` (base through base + highest add-on price, en-dash)
- With variants → min–max from variant prices (en-dash)

Helpers: `normalizeAddons(raw)`, `normalizeVariants(raw)` (extras only), `formatStylePriceRange(basePrice, addons, variants)`. `buildBookingStyles` passes `base`, `defaultVariantLabel`, and extra `variants` on each style.

**Booking page (`/booking`):** Multi-step onboarding-style flow: **Personal** → **Service** → **Appointment** → **Pricing** (with payment on the last step when enabled). Deep links with `?style=` open a **version picker modal** when the service has multiple variants.

After selecting a service:

1. **Choose your version** (if stored extras exist) — version 1 comes from base price + `defaultVariantLabel`; modal on menu deep link, inline `#style-variant-field-wrap` on the service step
2. **Optional add-on** radio group (`#style-addon-field-wrap`) when add-ons exist.
3. Pricing uses **variant price** (or base when no variants) + selected add-on.

Saved on booking: `style_name` (e.g. `Knotless Braids — With hair provided + Beard trim`), `selected_variant_id`, `selected_variant_label`, `selected_variant_price`, plus existing `selected_addon_*` fields.

## Style versions (service options)

Data — `styld_site_records` → `site_setting.style_catalog_meta` + `style_price_overrides` per `styleId`:

- `style_price_overrides[styleId]` = **version 1 price** (always; the app “Price” field)
- `defaultVariantLabel` = label for version 1 when extra versions exist (fallback `"Standard"`)
- `variants[]` = **version 2+ only**: `{ id, label, price }[]` — each `price` is the full price for that version
- `addons[]` unchanged — optional extras on top of the chosen version
- `durationMinutes`: default slot length

App: **Price** field = version 1. **Add version** adds version 2+ only — do not store version 1 as a separate row in `variants[]`.

Tenant JS:

- `buildBookingStyles()` passes `base`, `defaultVariantLabel`, and `variants` (extras only)
- `formatStylePriceRange(base, addons, variants)`: when extras exist, range = min/max of `[base, ...extra prices]`
- `normalizeVariants(raw)` — validates extras-only array (same shape as app)

Booking (`booking.js` + `booking.html`):

- Profile menu: clicking a service with extra versions opens a **version popup** before navigating to `/booking?style={id}&variant={id}`
- `getStyleVariantsForStyle()` / `StyldTenant.getStyleVariantChoices()`: prepend version 1 from base + `defaultVariantLabel`, then extras
- With `?style=` set, the **service step is locked** — read-only “Your service” summary; no style dropdown or version picker. Add-ons, photos, notes, and appointment steps unchanged
- Version modal on `/booking` only when `?style=` has extras but no `?variant=` yet
- Estimate sidebar updates from the locked style + version + add-ons

HTML: `#style-selection-summary` replaces `#style-select-field-wrap` when locked. `#style-variant-field-wrap` before `#style-addon-field-wrap` when not locked.

**Example setup for Braids:**

- Title: Knotless Braids
- Price (version 1): $180 · `defaultVariantLabel`: “Without hair”
- Version 2 (in `variants[]`): “With hair provided” · $250
- Menu range: `$180–$250`

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

## Manual booking approval (`requireBookingApproval`)

When **Require booking approval** is on in the app (`styld_site_settings` → `booking_payment.requireBookingApproval === true`), the booking site must **not** treat the client as confirmed on submit.

### Site behavior (`js/booking.js`)

- `PAYMENT.requireBookingApproval` is loaded in `styld-tenant-booking.js`.
- `resolveBookingStatus()` → `pending_approval` after deposit paid or pay-in-person submit when approval is required; `confirmed` only when approval is off.
- Success redirect adds `?pending_approval=1` when approval is required.
- **Do not call `booking-client-email` from the site on submit when approval is required.** Confirmation email is sent only after the stylist accepts (app + edge function + DB trigger). Pay-in-person and deposit paths both skip client email on submit.
- `stripe-booking-confirm` already skips client email when approval is required — rely on that for Stripe deposits; do not add a duplicate site-side email invoke after payment.

### Client copy

**`booking-success.html` / `booking-success.js`** when `pending_approval=1`:

- Title: **Request received** (not “Booking confirmed”)
- Body: request received; we’ll email when approved or declined
- Optional deposit policy line if deposit was collected

**`booking-details.html` / `booking-details.js`** when `booking_status === "pending_approval"`:

- Status pill: **Pending approval**
- Messaging: awaiting approval; email when approved or declined
- Do not use confirmed/deposit-ok styling

### Emails (backend — coordinate, do not duplicate in browser)

| When | Client email |
|------|----------------|
| Submit with `pending_approval` | **None** (no premature “Booking confirmed”) |
| Stylist **Accept** | `booking-client-email` with `force: true` → “✓ Booking confirmed – {Business name}” |
| Status → `confirmed` (DB trigger backup) | `booking-client-email` if not already sent (`client_confirmation_email_sent_at`) |
| Stylist **Decline** | Decline email (app/backend) |
| Submit without approval required | `booking-client-email` / `stripe-booking-confirm` as today |

**`booking-client-email` rules:**

- Sends only when `booking_status` is `confirmed` or `completed`
- Supports `force: true` to resend after approval (ignores `already_sent`)
- Tracks `client_confirmation_email_sent_at` (not legacy `client_email_sent_at` alone)

**Deploy (backend):**

```bash
supabase db push   # includes 20260629120000_booking_confirmation_client_email.sql
supabase functions deploy booking-client-email
```

**Do not change** slot blocking or `resolveBookingStatus()` unless fixing a bug. Accept/decline stays in the mobile app.

## Promo codes (booking checkout)

Stylists manage promo codes in the mobile app: **Profile → Payments → Booking → Promos** tab. Codes are stored in Supabase as `site_setting` → `booking_promo_codes` on `styld_site_records`. **Never load the full promo list in the browser.**

### Data shape (`booking_promo_codes`)

Array of objects (managed in app, validated server-side only):

```json
[
  {
    "code": "SUMMER10",
    "kind": "percent",
    "value": 10,
    "label": "Summer sale",
    "expiresAt": "2026-09-01",
    "maxUses": 100,
    "enabled": true
  },
  {
    "code": "SAVE20",
    "kind": "fixed",
    "value": 20,
    "enabled": true
  }
]
```

- `kind`: `percent` (off subtotal) or `fixed` (dollar amount off)
- `value`: percent 0–100 or fixed dollars
- Optional: `label`, `expiresAt` (ISO date), `maxUses`, `enabled`

### Booking page UI (`booking.html`)

On the **Pricing** step, `#promo-code-section` sits after the price summary and before payment:

- `#promo-code-input` + `#promo-code-apply` (Apply button)
- `#promo-code-feedback` — success/error after Apply
- `#line-promo-row` in the price summary when a code is applied (`#line-promo-code`, `#line-promo-discount`)

Legacy sidebar IDs (`#side-promo-row`, etc.) are updated in JS if present but the sidebar was removed — pricing step rows are canonical.

### Client flow (`js/booking.js`)

1. **Apply only** — On Apply, POST edge function `validate-booking-promo`:

   ```json
   { "subdomain": "trial", "code": "SUMMER10", "subtotalCents": 20000 }
   ```

   `subtotalCents` = service total **before** discount (base + add-on, cents). Do not include deposit/service fee.

2. **Valid response** (example — field names may vary; normalize in JS):

   ```json
   { "valid": true, "code": "SUMMER10", "discountCents": 2000, "label": "Summer sale" }
   ```

3. **`computePricing()`** — `rawSubtotal = base + addonPrice`; `total = rawSubtotal - discount`. Deposit/full payment amounts are recalculated from the **discounted** total.

4. **Submit** — Block if the user typed a code but did not tap Apply (`hasUnappliedPromoInput()`).

5. **Booking row** — On insert, save:
   - `promo_code`
   - `promo_discount_amount` (dollars)
   - `subtotal_before_promo` (dollars, pre-discount service total)
   - `estimated_total` (discounted service total)

6. **Stripe** — POST `stripe-booking-pay` with `{ subdomain, bookingId, email, subtotalCents, promoCode }`. Server recomputes deposit/charge; do not trust client `amountCents` when `promoCode` is set. Without a promo, pass `amountCents` as before.

7. **Invalidation** — Clear applied promo when service/variant/add-on changes (subtotal no longer matches validated cents).

### Edge functions (deploy separately)

```bash
supabase functions deploy validate-booking-promo
supabase functions deploy stripe-booking-pay
```

No DB migration — promos use existing `styld_site_records` `site_setting` rows.

### Do not

- Fetch or expose `booking_promo_codes` to the client for local validation.
- Apply discounts without calling `validate-booking-promo`.
- Skip saving promo fields on the booking record when a code was applied.

