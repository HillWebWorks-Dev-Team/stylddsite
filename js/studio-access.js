/**

 * Web Studio access phases — mirrors mobile AppAccessContext rules.

 */



export { computeAccessPhase, isSubscribed, subscriptionLabel } from './studio-subscription.js';
export { STUDIO_NAV, STUDIO_NAV_GROUPS } from './studio-nav.js';

export function settingValue(row) {
  if (!row || !row.data || typeof row.data !== 'object') return null;

  if (row.data.value != null) return row.data.value;

  return row.data;
}



export function liveSiteUrl(subdomain, rootDomain) {

  if (!subdomain) return null;

  const root = rootDomain || 'styldd.com';

  return 'https://' + subdomain + '.' + root;

}



export function studioRoutePath(pathname) {

  const clean = String(pathname || '/studio/dashboard').replace(/\/$/, '') || '/studio';

  if (clean === '/studio') return '/studio/dashboard';

  if (!clean.startsWith('/studio/')) return '/studio/dashboard';

  return clean;

}

