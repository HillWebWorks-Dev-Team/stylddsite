import { rewrite } from '@vercel/functions';
import {
  buildShareMetaTags,
  fetchTenantShareMeta,
  injectShareMetaIntoHtml,
  isHtmlDocumentRequest,
  tenantPageUrl,
} from './lib/tenant-share-meta.js';

const ROOT_DOMAIN = process.env.STYLD_ROOT_DOMAIN || 'styldd.com';
const SUPABASE_URL = process.env.STYLD_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.STYLD_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const MAYA_CUSTOM_HOSTS = new Set([
  'mayaafricanhairbraid.com',
  'www.mayaafricanhairbraid.com',
]);
const MAYA_CANONICAL_ORIGIN = 'https://mayahair.styldd.com';

const MARKETING_PAGES = {
  '/support': '/marketing/support.html',
  '/privacy': '/marketing/privacy.html',
  '/terms': '/marketing/terms.html',
  '/login': '/marketing/login.html',
  '/signup': '/marketing/login.html',
  '/onboarding': '/marketing/onboarding.html',
  '/dashboard': '/marketing/dashboard.html',
  '/studio': '/marketing/studio.html',
};

function isAppStudioHost(host) {
  return host === `app.${ROOT_DOMAIN}`;
}

function rewriteStudioRoutes(url) {
  const clean = url.pathname.replace(/\/$/, '').toLowerCase();
  if (clean.startsWith('/studio/website/edit')) {
    url.pathname = '/marketing/studio-edit.html';
    return rewrite(url);
  }
  if (clean.startsWith('/studio')) {
    url.pathname = '/marketing/studio.html';
    return rewrite(url);
  }
  return null;
}

function rewriteAppStudioHost(url) {
  const studioRewrite = rewriteStudioRoutes(url);
  if (studioRewrite) return studioRewrite;
  const clean = url.pathname.replace(/\/$/, '').toLowerCase();
  if (MARKETING_PAGES[clean]) {
    url.pathname = MARKETING_PAGES[clean];
    return rewrite(url);
  }
  if (url.pathname === '/' || !url.pathname.includes('.')) {
    url.pathname = '/marketing/studio.html';
    return rewrite(url);
  }
  return null;
}

const TENANT_STATIC_PAGES = {
  '/book': '/tenant/book.html',
  '/booking': '/booking.html',
  '/booking-lookup': '/booking-lookup.html',
  '/booking-success': '/booking-success.html',
  '/manage-booking': '/manage-booking.html',
  '/booking-details': '/booking-details.html',
  '/styles-catalog': '/styles-catalog.html',
  '/gallery': '/gallery.html',
  '/portfolio': '/tenant/portfolio.html',
  '/certifications': '/tenant/certifications.html',
  '/products': '/tenant/products.html',
  '/products/order': '/tenant/products-order.html',
  '/review': '/review.html',
};

function isRootHost(host) {
  return host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`;
}

function resolveTenantHtmlPath(pathname) {
  if (!pathname || pathname === '/') {
    return '/tenant/profile.html';
  }
  const clean = pathname.replace(/\/$/, '').toLowerCase();
  if (TENANT_STATIC_PAGES[clean]) {
    return TENANT_STATIC_PAGES[clean];
  }
  if (clean.endsWith('.html')) {
    return clean;
  }
  return '/tenant/profile.html';
}

async function htmlWithTenantShareMeta(request, subdomain, htmlPath) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !isHtmlDocumentRequest(request)) {
    return null;
  }

  const meta = await fetchTenantShareMeta(subdomain, SUPABASE_URL, SUPABASE_ANON_KEY);
  if (!meta) return null;

  const origin = new URL(request.url).origin;
  const htmlRes = await fetch(`${origin}${htmlPath}`, {
    headers: { Accept: 'text/html' },
  });
  if (!htmlRes.ok) return null;

  const html = await htmlRes.text();
  const pageUrl = tenantPageUrl(request, subdomain);
  const tags = buildShareMetaTags({
    brandName: meta.brandName,
    description: meta.description,
    imageUrl: meta.imageUrl,
    pageUrl,
    title: `${meta.brandName} | Book online`,
  });
  const enriched = injectShareMetaIntoHtml(html, tags);
  if (enriched === html) return null;

  return new Response(enriched, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}

export default async function middleware(request) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const url = new URL(request.url);

  if (MAYA_CUSTOM_HOSTS.has(host)) {
    return Response.redirect(new URL(url.pathname + url.search, MAYA_CANONICAL_ORIGIN), 308);
  }

  if (!host || host.endsWith('.vercel.app')) {
    return;
  }

  if (!isRootHost(host)) {
    if (url.pathname.startsWith('/marketing/admin')) {
      return new Response('Not found', { status: 404 });
    }
  }

  if (isRootHost(host)) {
    if (url.pathname.startsWith('/marketing/')) {
      return;
    }
    const studioRewrite = rewriteStudioRoutes(url);
    if (studioRewrite) return studioRewrite;
    const clean = url.pathname.replace(/\/$/, '').toLowerCase();
    if (MARKETING_PAGES[clean]) {
      url.pathname = MARKETING_PAGES[clean];
      return rewrite(url);
    }
    if (url.pathname === '/' || !url.pathname.includes('.')) {
      url.pathname = '/marketing/index.html';
      return rewrite(url);
    }
    return;
  }

  if (isAppStudioHost(host)) {
    if (url.pathname.startsWith('/marketing/')) {
      return;
    }
    const appRewrite = rewriteAppStudioHost(url);
    if (appRewrite) return appRewrite;
    return;
  }

  if (!host.endsWith(`.${ROOT_DOMAIN}`)) {
    return;
  }

  const subdomain = host.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!subdomain || subdomain.includes('.') || subdomain === 'app') {
    return;
  }

  const htmlPath = resolveTenantHtmlPath(url.pathname);
  const enriched = await htmlWithTenantShareMeta(request, subdomain, htmlPath);
  if (enriched) {
    return enriched;
  }

  url.pathname = htmlPath;
  url.searchParams.set('subdomain', subdomain);
  return rewrite(url);
}

export const config = {
  matcher: ['/((?!_vercel|assets|css|js|tenant|marketing|favicon|.*\\..*).*)'],
};
