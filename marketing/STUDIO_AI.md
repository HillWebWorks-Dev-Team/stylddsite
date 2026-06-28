# Styld Web Studio

## Part 1 — Foundation ✓

Auth, shell, access phases, onboarding. See routes in prior doc.

## Part 2 — Website editor ✓

| URL | Purpose |
|-----|---------|
| `/studio/website` | Overview: status, Edit site, View live site |
| `/studio/website/edit` | Full editor (5 tabs) |

### Modules

- `js/site-normalize.js` — `normalizeSiteContent`, `normalizeSiteTheme`, defaults
- `js/site-preview.js` — iframe srcdoc preview from in-memory content
- `js/subdomain-utils.js` — validation + availability check
- `js/studio-api.js` — `loadSiteEditorState`, `uploadToStyleCovers`, `publishSiteSubdomain`
- `marketing/studio/website-editor.js` — editor UI
- `marketing/studio-edit.html` — editor entry page

### Editor tabs

Style, Photos, Content, Location, Publish — autosave 700ms debounce to `styld_site_records`.

### Publish flow

1. Flush pending saves
2. Verify subscription (`subscription-site-sync` verify + `canPublish`, via `js/studio-subscription.js`)
3. Validate subdomain
4. Upsert `styld_site_subdomains` + `site_publish`
5. Optional `vercel-redeploy`, `subscription-site-sync` sync

### Not in Part 2

Styles/pricing CRUD (Part 6), portfolio/certifications media managers (basic FAQ/content only), web paywall billing (Part 8).

## Subscription (RevenueCat)

- **Never store subscription in Supabase tables** — always call edge functions with the user JWT.
- **`app_user_id`** = Supabase `auth.users.id` (same as mobile `Purchases.logIn(user.id)`).
- **Entitlement:** `Styld: The CRM For Hair Salons Pro` (not `pro`).
- **Products:** `styld_monthly`, `styld_yearly`.
- **Check:** `POST /functions/v1/revenuecat-subscription-status` → `entitled === true`.
- **Publish verify:** `POST /functions/v1/subscription-site-sync` `{ action: 'verify', platform: 'ios' }` → `canPublish === true`.
- **Module:** `js/studio-subscription.js` (60s cache for nav; fresh call for publish/paywall).

### Access phases

| Phase | Condition |
|-------|-----------|
| `account_onboarding` | Onboarding incomplete |
| `build_site` | Never published — editor OK; paywall at publish if not entitled |
| `paywall` | `site_publish.publishedAt` set + `entitled === false` |
| `full` | Entitled (+ published for live site) |

Platform admins (`app_metadata.role === platform_admin` or `marketing-config` admin email) skip paywall.

---

## Part 3+

Dashboard, calendar, clients, settings, analytics — not started.
