const ROOT_DOMAIN = process.env.STYLD_ROOT_DOMAIN || 'styldd.com';

export function coverStoragePath(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'object') {
    const nested = value.storage_path ?? value.storagePath ?? value.path ?? value.url;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return null;
}

export function publicCoverUrl(supabaseUrl, path) {
  const storagePath = coverStoragePath(path);
  if (!storagePath) return null;
  if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) return storagePath;
  const base = (supabaseUrl || '').replace(/\/$/, '');
  if (!base) return null;
  const objectPath = storagePath.replace(/^\/+/, '').replace(/^style-covers\//, '');
  return `${base}/storage/v1/object/public/style-covers/${objectPath}`;
}

function settingValue(row) {
  const data = row?.data;
  if (!data || typeof data !== 'object') return null;
  if (data.value != null) return data.value;
  return data;
}

export function resolveShareImageUrl(theme, covers, supabaseUrl) {
  theme = theme && typeof theme === 'object' ? theme : {};
  covers = covers && typeof covers === 'object' ? covers : {};
  const stackPaths = Array.isArray(theme.heroStackImagePaths) ? theme.heroStackImagePaths : [];
  const candidates = [
    theme.logoImagePath,
    theme.heroImagePath,
    stackPaths[0],
    ...Object.values(covers),
  ];
  for (const candidate of candidates) {
    const url = publicCoverUrl(supabaseUrl, candidate);
    if (url) return url;
  }
  return null;
}

export function buildShareMetaTags({ brandName, description, imageUrl, pageUrl, title }) {
  const safeTitle = escapeHtml(title || `${brandName || 'Book online'} | Book online`);
  const safeBrand = escapeHtml(brandName || 'Book online');
  const safeDescription = escapeHtml(description || `Book with ${brandName || 'us'} online.`);
  const safeUrl = escapeHtml(pageUrl || '');
  const safeImage = imageUrl ? escapeHtml(imageUrl) : '';

  let tags = [
    `<title>${safeTitle}</title>`,
    `<meta name="description" content="${safeDescription}">`,
  ];

  if (safeImage) {
    tags.push(
      `<link rel="icon" href="${safeImage}" type="image/png">`,
      `<link rel="apple-touch-icon" href="${safeImage}">`,
      `<meta property="og:image" content="${safeImage}">`,
      `<meta name="twitter:image" content="${safeImage}">`,
    );
  }

  tags.push(
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${safeBrand}">`,
    `<meta property="og:description" content="${safeDescription}">`,
    `<meta name="twitter:card" content="${safeImage ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${safeBrand}">`,
    `<meta name="twitter:description" content="${safeDescription}">`,
  );

  if (safeUrl) {
    tags.push(`<meta property="og:url" content="${safeUrl}">`);
  }

  return tags.join('\n    ');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function injectShareMetaIntoHtml(html, tags) {
  if (!html || !tags) return html;
  if (html.includes('data-styld-share-meta="1"')) return html;

  const marker = '<head>';
  if (!html.includes(marker)) return html;

  const cleaned = html
    .replace(/<title>[^<]*<\/title>\s*/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/i, '')
    .replace(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>\s*/gi, '')
    .replace(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>\s*/gi, '');

  return cleaned.replace(
    marker,
    `${marker}\n    ${tags}\n    <meta data-styld-share-meta="1" content="1">`,
  );
}

export async function fetchTenantShareMeta(subdomain, supabaseUrl, supabaseAnonKey) {
  if (!subdomain || !supabaseUrl || !supabaseAnonKey) return null;

  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };
  const base = supabaseUrl.replace(/\/$/, '');

  const subRes = await fetch(
    `${base}/rest/v1/styld_site_subdomains?subdomain=eq.${encodeURIComponent(subdomain)}&select=user_id,published_at`,
    { headers, cache: 'no-store' },
  );
  if (!subRes.ok) return null;
  const subRows = await subRes.json();
  const subRow = subRows?.[0];
  if (!subRow?.published_at) return null;

  const recordsRes = await fetch(
    `${base}/rest/v1/styld_site_records?user_id=eq.${encodeURIComponent(subRow.user_id)}&select=record_type,record_key,data`,
    { headers, cache: 'no-store' },
  );
  if (!recordsRes.ok) return null;
  const records = await recordsRes.json();

  let content = null;
  let theme = {};
  const covers = {};

  for (const record of records || []) {
    const value = settingValue(record);
    if (record.record_type === 'site_setting' && record.record_key === 'site_content') content = value;
    if (record.record_type === 'site_setting' && record.record_key === 'site_theme') {
      theme = value && typeof value === 'object' ? value : {};
    }
    if (record.record_type === 'style_cover_image' && record.record_key) {
      const coverPath = coverStoragePath(value);
      if (coverPath) covers[record.record_key] = coverPath;
    }
  }

  if (!content) return null;

  const brandName = String(content.brandName || subdomain).trim() || subdomain;
  const description =
    String(content.tagline || content.heroDescription || content.menuBlurb || '').trim() ||
    `Book appointments with ${brandName} online.`;
  const imageUrl = resolveShareImageUrl(theme, covers, supabaseUrl);

  return { brandName, description, imageUrl };
}

export function isHtmlDocumentRequest(request) {
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html') || accept.includes('*/*');
}

export function tenantPageUrl(request, subdomain) {
  const host = (request.headers.get('host') || '').split(':')[0];
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const path = new URL(request.url).pathname || '/';
  return `${proto}://${host || `${subdomain}.${ROOT_DOMAIN}`}${path}`;
}
