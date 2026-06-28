# Styld Admin Dashboard — Complete Reference

Use this document when wiring **App AI**, internal tools, or support workflows. It lists every screen, API action, Supabase source, and field the web admin shows today.

---

## Access & auth

| Item | Value |
|------|--------|
| **Web UI** | `https://styldd.com/marketing/admin.html` |
| **Entry** | Footer “Admin” on marketing site → PIN modal (`marketing/admin-access.js`) |
| **PIN** | Validated server-side via `ADMIN_PIN` secret on edge function (default dev: `0000`) |
| **Session** | PIN stored in `sessionStorage` key `styld_admin_pin` for the browser tab |
| **API** | `POST {supabaseUrl}/functions/v1/styld-admin-dashboard` |
| **Request body** | `{ "pin": "…", "action": "…", "filters": { … } }` |
| **Headers** | `apikey`, `Authorization: Bearer {supabaseAnonKey}`, `Content-Type: application/json` |
| **Config** | `js/marketing-config.js` → `window.__STYLD_MARKETING__.supabaseUrl` + `supabaseAnonKey` |

**Rate limit:** 8 wrong PINs → 15 min lockout per IP.

**For App AI:** Prefer calling the same edge function actions (never expose service-role keys in the mobile app). Alternatively, an authenticated **owner-only** in-app admin could call `user_detail` with `filters.user_id` = the signed-in stylist’s UUID.

---

## Main navigation (11 tabs)

| Tab | API `action` | Search filters | Export |
|-----|--------------|----------------|--------|
| Overview | `overview` | — | — |
| Styld Revenue | `styld_revenue` | `range`, `month`, `year` | — |
| Salons | `users` | `search` | — |
| Bookings | `bookings` | `search` | Export bookings CSV |
| Clients | `clients` | `search` | — |
| Cancellations | `cancellations` | — | — |
| Inquiries | `inquiries` | `search` | — |
| Reviews | `reviews` | — | — |
| Emails | `emails` | `search`, `limit` | — |
| Onboarding | `onboarding` | — | Export onboarding |
| Analytics | `analytics` | — | — |

**Toolbar:** Refresh, number format (full/compact), hide money (`***`), sign out.

---

## Salon drill-down (click any salon row)

Opens full-screen salon view with 6 sub-tabs. Loaded via **`user_detail`** with `filters.user_id`.

| Sub-tab | Shows |
|---------|--------|
| **Analytics** | Revenue stats, views 7/30/90d, daily sparkline, top paths, devices, booking/payment status charts, recent 6 bookings |
| **Bookings** | Last 15 booking cards (click → drawer) |
| **Clients** | Per-salon client list from bookings (name, email, phone, spend, visits, favorite service) |
| **Reviews** | Review cards + average rating |
| **Emails** | Last 100 sent emails for that salon |
| **Business** | Account, contact, subscription, Stripe, onboarding, booking settings, **site design**, **style menu & add-ons**, cancellation policy, inquiries |

---

## Side drawers (detail views)

| Trigger | API | Shows |
|---------|-----|--------|
| Booking card / row | `booking_detail` `{ booking_id }` | Full appointment, client, **service + add-on breakdown**, payment, photos (signed URLs), notes, Stripe PI, salon link |
| Email card | `email_detail` `{ email_id }` | Template type, recipient, subject, HTML preview (`srcdoc`) |
| Client card | Uses loaded salon/global client data | Client history at salon |

---

## API actions — request & response shapes

### `overview`

Platform-wide KPIs.

```json
{
  "total_stylists": 0,
  "published_sites": 0,
  "draft_sites": 0,
  "total_bookings": 0,
  "unique_clients_per_stylist": 0,
  "unique_clients_global": 0,
  "total_inquiries": 0,
  "total_reviews": 0,
  "stripe_merchants_live": 0,
  "subscriptions_note": "string",
  "payments": {
    "gross": 0,
    "collected": 0,
    "pending": 0,
    "customer_charges": 0,
    "estimated_service_fees": 0,
    "estimated_platform_fees": 0,
    "estimated_processing_fees": 0,
    "refunds_total": 0,
    "refunds_count": 0,
    "payment_status": [{ "status": "paid", "count": 0 }]
  },
  "stripe_connect": {
    "merchants_total": 0,
    "merchants_live": 0,
    "merchants_payouts_enabled": 0,
    "balance_available_cents": 0,
    "balance_pending_cents": 0,
    "balance_available": 0,
    "balance_pending": 0,
    "balance_total": 0,
    "accounts_with_balance": 0
  },
  "top_salons_by_collected": [{
    "user_id": "uuid",
    "brand_name": "string",
    "subdomain": "string|null",
    "gross": 0,
    "collected": 0,
    "pending": 0
  }],
  "fee_note": "string"
}
```

---

### `styld_revenue`

Filters: `{ "range": "month"|"year"|"all", "month": "2026-06", "year": "2026" }`

```json
{
  "period": { "range": "month", "label": "2026-06", "month": "2026-06", "year": null },
  "platform": {
    "platform_fees": 0,
    "service_fees": 0,
    "customer_charges": 0,
    "collected": 0,
    "paid_bookings": 0
  },
  "platform_timeline": [{ "month": "2026-01", "platform_fees": 0, "collected": 0 }],
  "platform_timeline_filtered": [],
  "subscriptions": {
    "total_salons": 0,
    "active": 0,
    "active_monthly": 0,
    "active_yearly": 0,
    "active_other": 0,
    "free": 0,
    "expired": 0,
    "errors": 0,
    "new_in_period": 0,
    "estimated_mrr": 0,
    "monthly_price": 24.99,
    "yearly_price": 199.99,
    "plans": { "monthly": {}, "yearly": {}, "other": {}, "total_mrr": 0 },
    "revenuecat_overview": null,
    "subscribers": [{ "user_id": "uuid", "brand_name": "", "email": "", "status": "active", "plan_label": "Pro Monthly" }]
  },
  "combined": {
    "platform_cut": 0,
    "estimated_subscription_mrr": 0,
    "estimated_subscription_monthly_gross": 0,
    "estimated_subscription_yearly_gross": 0,
    "note": "string"
  },
  "available_months": ["2026-06"],
  "available_years": ["2026"],
  "pricing_note": "string"
}
```

---

### `users` (Salons list)

Filter: `{ "search": "optional lowercase substring" }`

Each item in `users[]`:

| Field | Source |
|-------|--------|
| `user_id` | `profiles.id` |
| `email`, `full_name`, `business_name`, `avatar_url` | `profiles` |
| `brand_name` | `site_content.brandName` → profile fallback |
| `image_url` | logo / hero / avatar URL |
| `created_at`, `updated_at` | `profiles` |
| `total_revenue`, `revenue_collected`, `revenue_pending` | Sum of booking `data.estimated_total` / deposits |
| `last_sign_in_at`, `email_confirmed_at`, `provider` | Supabase Auth |
| `subdomain`, `published_at`, `public_url` | `styld_user_sites` / `styld_site_subdomains` |
| `onboarding_completed` | `onboarding_state.completed` |
| `onboarding_responses_saved` | bool |
| `site_published` | `site_publish` |
| `stripe.*` | `styld_stripe_accounts` (charges, payouts, balances) |
| `push_tokens` | count from `styld_push_tokens` |
| `booking_count`, `inquiry_count`, `review_count` | `styld_site_records` counts |
| `reviews_avg_rating` | avg from review records |
| `page_views_7d`, `page_views_30d` | `styld_analytics_events` or `styld_site_page_views` |
| `hero_layout`, `hero_layout_label` | `site_theme.heroLayout` |
| `style_count`, `addon_count` | parsed from `style_catalog_meta` |
| `payment_mode`, `payment_mode_label` | `booking_payment.mode` |
| `subscription` | RevenueCat (see below) |

**Salon row UI:** brand, email, subdomain, layout, style/add-on counts, revenue, bookings, rating, collected, subscription pill.

---

### `user_detail` (single salon — richest payload)

Filter: `{ "user_id": "uuid" }`

**Top-level fields:**

| Field | Description |
|-------|-------------|
| `profile` | Full `profiles` row |
| `brand_name`, `tagline`, `image_url`, `subdomain`, `public_url`, `published_at` | Site identity |
| `last_sign_in_at`, `email_confirmed_at` | Auth |
| `contact` | phone, email, instagram, address, city, state, timezone |
| `revenue_summary` | gross, collected, pending, booking_count, cancelled_count, unique_clients |
| `analytics` | Per-salon analytics object (see Analytics section) |
| `clients[]` | Derived from bookings at this salon |
| `site_settings` | **Raw** all `site_setting` records keyed by `record_key` |
| `site_theme_summary` | Parsed theme (see Site design) |
| `site_content_summary` | Parsed content visibility |
| `style_catalog[]` | Parsed services + add-ons |
| `style_count`, `addon_count` | counts |
| `booking_payment`, `booking_hours`, `cancellation_policy` | Settings objects |
| `onboarding_responses` | Survey JSON |
| `bookings[]` | Up to 500 parsed bookings |
| `inquiries[]`, `reviews[]` | Record wrappers `{ id, created_at, data }` |
| `blocked_intervals[]` | Schedule blocks |
| `style_covers[]` | Style cover image paths |
| `stripe` | Full Stripe Connect row |
| `push_tokens[]` | Device tokens |
| `cancellations[]` | From `styld_cancellation_events` |
| `subscription` | RevenueCat |
| `emails[]` | Last 100 from `styld_sent_emails` |

#### `site_settings` record keys (Supabase `styld_site_records`)

| `record_key` | Purpose |
|--------------|---------|
| `site_content` | Brand, taglines, about, policies, menu copy, address, social, hidden sections |
| `site_theme` | Colors, fonts, hero layout, stack images, text colors |
| `site_publish` | Subdomain, publish timestamps |
| `style_catalog_meta` | Per-style title, duration, category, description, **addons[]** |
| `style_price_overrides` | Base price per style id |
| `booking_payment` | mode: `none`/`in_person`/`deposit`/`full`, deposit rules, photo requirements |
| `booking_hours` | Slots, closed days, lead time, capacity |
| `cancellation_policy` | Refund window, summary text |
| `onboarding_state` | Completion flags |
| `onboarding_responses` | Survey answers |

#### `site_theme_summary` (displayed in Business → Site design)

| Field | Maps from `site_theme` |
|-------|------------------------|
| `hero_layout` | `split` \| `stack` \| `cover` \| `image-below` \| `minimal` |
| `hero_layout_label` | Human label |
| `hero_stack_format` | `wide` (3:1) or `tall` (4:9) |
| `hero_stack_image_count` | `heroStackImagePaths.length` |
| `hero_cover_blur` | bool |
| `style_card_layout` | `card` \| `outlined` |
| `hide_book_now_button` | bool |
| `font_family` | e.g. `cormorant` |
| `primary_color`, `secondary_color`, `background_color`, `navbar_color` | hex |
| `custom_text_colors` | count of `textColors` keys |
| `has_logo`, `has_hero_image` | bool |

Full `site_theme` JSON also includes: `heroImagePath`, `heroImageFocusX/Y`, `heroStackImageFocus[]`, `textColors`, `textColorSources`, `heroCoverBlur`, etc.

#### `site_content_summary`

| Field | Maps from `site_content` |
|-------|--------------------------|
| `menu_title`, `menu_blurb`, `tagline_*` | copy |
| `has_about`, `has_policies` | bool |
| `hidden_sections[]` | e.g. `aboutMe`, `policies`, `menu`, `visit`, `reviews` |
| `hidden_location_parts[]` | `address`, `contact`, `social`, `map` |
| `instagram_handle`, `phone_display`, `email` | contact |

#### `style_catalog[]` (each service)

```json
{
  "id": "studio-skin-fade",
  "title": "Skin Fade",
  "duration_minutes": 45,
  "category": "Haircuts",
  "base_price": 35,
  "addon_count": 2,
  "addons": [{ "id": "addon-abc", "name": "Beard trim", "price": 15 }],
  "price_label": "$35–$50",
  "description": "optional string"
}
```

#### `booking_payment` (displayed in Business → Booking settings)

| Field | Meaning |
|-------|---------|
| `mode` | `none`, `in_person`, `deposit`, `full` |
| `depositKind` | `percent` \| flat |
| `depositValue` | number |
| `requireCurrentHairPhoto` | bool (default true) |
| `requireReferencePhoto` | bool |

#### `booking_hours`

| Field | Meaning |
|-------|---------|
| `slotDayStartHour/Minute`, `slotDayEndHour/Minute` | daily window |
| `slotStepMinutes` | slot length |
| `closedWeekdays[]` | 0=Sun … 6=Sat |
| `sameDayLeadMinutes` | minimum notice |
| `concurrentAppointmentCapacity` | parallel bookings |

#### `subscription` (RevenueCat)

| Field | Values |
|-------|--------|
| `status` | `active`, `none`, `expired`, `unknown`, `error` |
| `entitlement` | `pro` |
| `product` | `styld_monthly`, `styld_yearly` |
| `plan_label` | Pro Monthly / Pro Yearly / Free |
| `expires_date`, `purchase_date` | ISO |
| `store` | App Store / Google Play |
| `will_renew`, `billing_issues`, `unsubscribe_detected_at` | bool / dates |

---

### `bookings`

Filter: `{ "search", "limit" }` (default 500, max 1000)

Each booking (flattened from `styld_site_records.data` where `record_type = booking`):

| Field | Description |
|-------|-------------|
| `row_id` | Supabase record UUID |
| `user_id` | Salon owner |
| `id` | Booking UUID in JSON |
| `full_name`, `email`, `phone` | Client |
| `style_id`, `style_name` | Service (name may include add-on: `"Fade + Beard trim"`) |
| `selected_addon_id`, `selected_addon_name`, `selected_addon_price` | **Add-on selection** |
| `service_base_price` | computed total − add-on |
| `appointment_starts_at`, `appointment_date`, `appointment_slot` | When |
| `duration_minutes` | int |
| `service_address` | optional mobile service |
| `estimated_total`, `deposit_amount` | money |
| `booking_status` | pending, confirmed, cancelled, etc. |
| `payment_status` | none, unpaid, deposit_paid, paid |
| `stripe_payment_intent_id` | Stripe |
| `photo_hair_path`, `photo_ref_path` | storage paths |
| `notes`, `source` | text |
| `refund_status`, `refund_amount_cents` | if refunded |
| `google_calendar_id`, `review_token` | integrations |
| `brand_name`, `subdomain` | enriched salon meta |
| `created_at`, `updated_at` | record timestamps |

---

### `booking_detail`

Filter: `{ "booking_id": "row uuid OR data.id" }`

Returns `{ booking: { …all fields above, photo_hair_url, photo_ref_url }, salon: { user_id, brand_name, subdomain, public_url } }`.

---

### `clients`

Filter: `{ "search" }`

Global clients aggregated across all salons (key = user_id + email + phone):

| Field | Description |
|-------|-------------|
| `user_id` | which salon (last seen / primary in list) |
| `client_name`, `email`, `phone` | |
| `booking_count`, `last_booking_at`, `total_spend` | |
| `brand_name`, `subdomain` | enriched |

Per-salon `clients[]` inside `user_detail` also includes: `collected_spend`, `pending_spend`, `first_booking_at`, `cancelled_count`, `completed_count`, `favorite_service`.

---

### `cancellations`

From `styld_cancellation_events` (limit 500):

| Field | Description |
|-------|-------------|
| `booking_id` | links to booking drawer |
| `cancelled_by` | who cancelled |
| `refund_status`, `refund_amount_cents` | |
| `created_at` | |
| `brand_name`, `subdomain` | enriched |

---

### `inquiries`

From `styld_site_records` where `record_type = inquiry`:

| Field | In `data` JSON (typical) |
|-------|--------------------------|
| `full_name` / `name` | sender |
| `email`, `phone` | contact |
| `message` / `notes` / `body` | text |

Plus `id`, `user_id`, `created_at`, salon meta.

---

### `reviews`

From `styld_site_records` where `record_type = review`:

| Field | In `data` JSON |
|-------|----------------|
| `rating` | 1–5 |
| `review_text` / `comment` | text |
| `client_name` | optional |
| `booking_id` | optional link |

---

### `onboarding`

From `site_setting` / `onboarding_responses`:

```json
{
  "survey": {
    "heardFrom": "string",
    "whyStyld": ["string"],
    "dreamOutcome": "string"
  },
  "business": {
    "name": "string",
    "phone": "string"
  }
}
```

---

### `emails`

Filter: `{ "search", "limit", "user_id" }` (optional salon scope)

From `styld_sent_emails`:

| Field | Description |
|-------|-------------|
| `template_key` | see template list below |
| `recipient_email`, `recipient_name` | |
| `subject`, `preview_text` | |
| `booking_id`, `client_email` | links |
| `status` | sent, failed, queued |
| `provider` | e.g. resend |
| `brand_name`, `subdomain` | enriched |

**Email template keys:**

| Key | Label |
|-----|-------|
| `salon-booking` | Salon: new booking |
| `customer-confirmation` | Customer: booking received |
| `customer-reminder` | Customer: reminder |
| `daily-digest` | Owner: daily digest |
| `deposit-received` | Customer: deposit received |
| `salon-cancelled` | Salon: cancelled |
| `customer-cancelled` | Customer: cancelled |
| `salon-rescheduled` | Salon: rescheduled |
| `customer-rescheduled` | Customer: rescheduled |
| `review-request` | Customer: review request |

`email_detail` adds `html_body`, `text_body`, `metadata`, `provider_message_id`.

---

### `analytics` (global)

Uses `styld_analytics_events` (fallback: `styld_site_page_views`):

```json
{
  "source": "styld_analytics_events",
  "total_events": 0,
  "by_subdomain": [{ "subdomain": "salon", "views": 0 }],
  "top_paths": [{ "path": "/", "views": 0 }],
  "by_device": [{ "device_type": "mobile", "views": 0 }]
}
```

#### Per-salon `analytics` (inside `user_detail`)

```json
{
  "source": "string",
  "total_views": 0,
  "views_7d": 0,
  "views_30d": 0,
  "views_90d": 0,
  "daily_views": [{ "day": "2026-06-07", "views": 0 }],
  "top_paths": [],
  "by_page_type": [],
  "by_device": [],
  "revenue_by_month": [{ "month": "2026-06", "revenue": 0, "collected": 0, "bookings": 0 }],
  "top_services": [{ "name": "Fade + Beard", "count": 0, "revenue": 0 }],
  "booking_status": [{ "status": "confirmed", "count": 0 }],
  "payment_status": [{ "status": "paid", "count": 0 }],
  "reviews_avg_rating": 4.8,
  "reviews_count": 0
}
```

---

### `export`

Filter: `{ "type": "bookings"|"onboarding" }` — returns same shape as bookings/onboarding with higher limit.

---

## Supabase tables touched

| Table | Used for |
|-------|----------|
| `profiles` | Stylist accounts |
| `styld_user_sites` | Publish state, subdomain |
| `styld_site_subdomains` | Live subdomain + `published_at` gate |
| `styld_site_records` | Bookings, inquiries, reviews, all `site_setting` JSON |
| `styld_stripe_accounts` | Connect onboarding, balances |
| `styld_push_tokens` | Push notification devices |
| `styld_site_page_views` | Legacy page views |
| `styld_analytics_events` | Page views with device/path |
| `styld_cancellation_events` | Cancel + refund audit |
| `styld_sent_emails` | Transactional email log |
| Auth users | last sign-in, email verified (service role) |

---

## Business tab cards (salon detail)

1. **Account** — joined, last sign-in, published date, email verified  
2. **Contact & location** — phone, email, Instagram, address, timezone  
3. **Subscription** — RevenueCat plan, expiry, store, billing issues  
4. **Stripe Connect** — available/pending balance, charges/payouts enabled  
5. **Onboarding** — heard from, why Styld, dream outcome, business name/phone  
6. **Booking settings** — payment mode, deposit rules, photo requirements, hours window, slots, closed days, lead time, capacity  
7. **Site design** — hero layout, stack format/count, cover blur, menu card style, font, Book Now visibility, custom text color count, brand hex swatches; live content summary + hidden sections  
8. **Style menu & add-ons** — every service with price range, duration, category, description, nested add-ons with prices  
9. **Cancellation policy** — summary or refund window  
10. **Inquiries** — contact form messages  

---

## Example API calls (for App AI / scripts)

```bash
# Overview
curl -X POST "$SUPABASE_URL/functions/v1/styld-admin-dashboard" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"pin":"YOUR_PIN","action":"overview"}'

# Single salon (everything)
curl -X POST "$SUPABASE_URL/functions/v1/styld-admin-dashboard" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"pin":"YOUR_PIN","action":"user_detail","filters":{"user_id":"592fb4b7-dff2-4fdc-bac0-c837c1228278"}}'

# Booking with add-on detail
curl -X POST "$SUPABASE_URL/functions/v1/styld-admin-dashboard" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"pin":"YOUR_PIN","action":"booking_detail","filters":{"booking_id":"BOOKING_UUID"}}'
```

---

## Suggested in-app admin (for App AI)

To mirror the web admin inside the Expo app:

1. **Do not** embed the web PIN in the app binary — use a server-checked admin flag or separate admin auth.  
2. Reuse **`user_detail`** for the signed-in owner’s own `user_id` (salon dashboard).  
3. For platform-wide admin, keep using the edge function + PIN or a dedicated admin role JWT.  
4. Priority screens to port: **Business** (site design + style/add-ons + booking settings), **Bookings** (with add-on line items), **Clients**, **Emails**.  
5. Raw JSON for debugging: `site_settings` on `user_detail` has the full Supabase payload unchanged.

---

## File map

| File | Role |
|------|------|
| `marketing/admin.html` | Shell + tabs |
| `marketing/admin.js` | All UI rendering |
| `marketing/admin.css` | Styles |
| `marketing/admin-access.js` | PIN gate on marketing site |
| `supabase/functions/styld-admin-dashboard/index.ts` | All API logic |
| `js/marketing-config.js` | Supabase URL + anon key |

Deploy edge function after API changes: `supabase functions deploy styld-admin-dashboard`
