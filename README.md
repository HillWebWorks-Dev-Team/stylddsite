# Styld

Multi-tenant salon site platform deployed on Vercel.

## How routing works

| URL | Serves |
|-----|--------|
| `styldd.com` / `www.styldd.com` | Marketing site (`/marketing/`) |
| `{business}.styldd.com` | Tenant booking site (`/tenant/` + Supabase data) |

Routing is handled by `middleware.js` — **do not** add a catch-all rewrite to `index.html` in `vercel.json` or subdomains will break.

## Vercel domains

- `styldd.com`
- `www.styldd.com`
- `*.styldd.com`

## Local preview

```bash
npm install
npx serve .
```

Note: subdomain routing requires Vercel middleware in production.
