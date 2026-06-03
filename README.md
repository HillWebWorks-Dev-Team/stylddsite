# Styld

Coming soon landing page + **subdomain booking pages** for the Styld CRM (salons & braiders).

## How subdomains work

| URL | What shows |
|-----|------------|
| `styldd.com` | Marketing / coming soon site |
| `www.styldd.com` | Marketing site |
| `jjj.styldd.com` | **Jjj** booking page (tenant) |
| `{any-name}.styldd.com` | That business's booking page |

Subdomain routing runs in `subdomain.js` on the client. Each slug becomes the business name (e.g. `maya-hair` → "Maya Hair").

## Vercel setup (required for `*.styldd.com`)

In the [Vercel project](https://vercel.com) for this repo, add these domains:

1. `styldd.com`
2. `www.styldd.com`
3. `*.styldd.com` (wildcard — needed for all business subdomains)

## DNS (at your registrar)

| Type | Name | Value |
|------|------|--------|
| A | `@` | `76.76.21.21` (Vercel) |
| CNAME | `www` | `cname.vercel-dns.com` |
| CNAME | `*` | `cname.vercel-dns.com` |

The wildcard `*` record sends every subdomain (e.g. `jjj.styldd.com`) to Vercel.

## Local preview

```bash
npx serve .
```

To test a subdomain locally, edit your hosts file or use the slug in the URL on a dev domain.
