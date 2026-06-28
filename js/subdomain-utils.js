/** Shared subdomain validation (marketing + studio). */

export const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'app', 'admin', 'mail', 'staging', 'dev', 'test', 'support', 'help', 'blog', 'status',
]);

export function normalizeSubdomain(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

export function isValidSubdomain(subdomain) {
  if (subdomain.length < 2 || subdomain.length > 32) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain);
}

export function suggestAlternatives(slug) {
  const bases = [slug + '-studio', slug + '-2', slug + '-book', slug + '-pro'];
  const out = [];
  bases.forEach(function (base) {
    const s = normalizeSubdomain(base);
    if (isValidSubdomain(s) && !RESERVED_SUBDOMAINS.has(s) && out.indexOf(s) === -1) out.push(s);
  });
  return out.slice(0, 3);
}

export async function checkSubdomainAvailability(slug, cfg, currentUserId) {
  if (!slug) return { state: 'empty' };
  if (!isValidSubdomain(slug)) {
    return { state: 'invalid', message: 'Use 2–32 letters, numbers, or hyphens only.' };
  }
  if (RESERVED_SUBDOMAINS.has(slug)) {
    return { state: 'reserved', message: 'That name is reserved.' };
  }

  const url = cfg.supabaseUrl.replace(/\/$/, '') +
    '/rest/v1/styld_site_subdomains?subdomain=eq.' + encodeURIComponent(slug) +
    '&select=subdomain,published_at,user_id';

  const res = await fetch(url, {
    headers: {
      apikey: cfg.supabaseAnonKey,
      Authorization: 'Bearer ' + cfg.supabaseAnonKey,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('request_failed');
  const rows = await res.json();
  if (!rows || !rows.length) return { state: 'available', slug: slug };

  const row = rows[0];
  if (currentUserId && row.user_id === currentUserId) {
    return { state: 'yours', slug: slug, published: !!row.published_at };
  }
  return { state: 'taken', slug: slug, published: !!row.published_at };
}
