import { rewrite } from '@vercel/functions';

const ROOT_DOMAIN = process.env.STYLD_ROOT_DOMAIN || 'styldd.com';

const TENANT_STATIC_PAGES = {
  '/booking': '/booking.html',
  '/booking-lookup': '/booking-lookup.html',
  '/booking-success': '/booking-success.html',
  '/manage-booking': '/manage-booking.html',
  '/booking-details': '/booking-details.html',
  '/styles-catalog': '/styles-catalog.html',
  '/gallery': '/gallery.html',
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

export default function middleware(request) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const url = new URL(request.url);

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
    if (url.pathname === '/' || !url.pathname.includes('.')) {
      url.pathname = '/marketing/index.html';
      return rewrite(url);
    }
    return;
  }

  if (!host.endsWith(`.${ROOT_DOMAIN}`)) {
    return;
  }

  const subdomain = host.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!subdomain || subdomain.includes('.')) {
    return;
  }

  url.pathname = resolveTenantHtmlPath(url.pathname);
  url.searchParams.set('subdomain', subdomain);
  return rewrite(url);
}

export const config = {
  matcher: ['/((?!_vercel|assets|css|js|tenant|marketing|favicon|.*\\..*).*)'],
};
