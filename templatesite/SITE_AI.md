# Instructions for Site / Template AI

Use this when editing tenant sites on Vercel (`*.styldd.com`).

**Code locations in this repo** (there is no separate `templatesite/` app folder — the Vercel project root *is* the template):

| Area | Path |
|------|------|
| Subdomain routing | `middleware.js` |
| Published-site gate + shared loader | `js/styld-tenant-shared.js` (`loadPublishedSite`) |
| Profile / home tenant bootstrap | `js/tenant-site.js` |
| Booking flow | `js/styld-tenant-booking.js`, `js/booking.js` |
| Tenant HTML shells | `tenant/`, `booking.html`, etc. |

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
