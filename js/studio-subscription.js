/**

 * RevenueCat subscription checks for Web Studio.

 */

import { invokeEdgeFunction, marketingCfg } from './studio-http.js';



export const STYLD_ENTITLEMENT_ID = 'Styld: The CRM For Hair Salons Pro';

export const STYLD_PRODUCT_IDS = ['styld_monthly', 'styld_yearly'];



const CACHE_MS = 60 * 1000;

const STATUS_TIMEOUT_MS = 12000;

let statusCache = null;



export function isPlatformAdmin(session) {

  const user = session && session.user;

  if (!user) return false;

  if (user.app_metadata && user.app_metadata.role === 'platform_admin') return true;

  const adminEmail = String(marketingCfg().adminEmail || '').trim().toLowerCase();

  const userEmail = String(user.email || '').trim().toLowerCase();

  return adminEmail && userEmail && adminEmail === userEmail;

}



export function isSubscribed(status, session) {

  if (isPlatformAdmin(session)) return true;

  if (!status || status.configured !== true) return false;

  return status.entitled === true;

}



export function subscriptionLabel(status) {

  if (!status || status.configured !== true) return 'Unknown';

  if (status.entitled === true) {

    if (status.productIdentifier === 'styld_yearly') return 'Yearly';

    if (status.productIdentifier === 'styld_monthly') return 'Monthly';

    return 'Active';

  }

  if (status.entitled === false) return 'Not subscribed';

  return 'Unavailable';

}



function normalizeLegacyDashboardSub(sub) {

  if (!sub || typeof sub !== 'object') {

    return { configured: false, entitled: null, entitlementId: STYLD_ENTITLEMENT_ID };

  }

  const entitled =

    sub.is_active === true || sub.status === 'active' || sub.status === 'trialing';

  return {

    configured: true,

    entitled: entitled,

    entitlementId: STYLD_ENTITLEMENT_ID,

    productIdentifier: sub.plan_label || null,

    expiresDate: sub.expires_date || null,

    legacy: true,

  };

}



function unavailableStatus(error) {

  return {

    configured: false,

    entitled: null,

    entitlementId: STYLD_ENTITLEMENT_ID,

    error: error ? String(error.message || error) : 'unavailable',

  };

}



export async function fetchSubscriptionStatus(options) {

  options = options || {};

  if (!options.fresh && statusCache && Date.now() - statusCache.at < CACHE_MS) {

    return statusCache.data;

  }



  try {

    const data = await invokeEdgeFunction(

      'revenuecat-subscription-status',

      { platform: 'ios' },

      { timeoutMs: STATUS_TIMEOUT_MS },

    );

    statusCache = { at: Date.now(), data: data };

    return data;

  } catch (primaryErr) {

    try {

      const dash = await invokeEdgeFunction(

        'styld-admin-dashboard',

        { action: 'owner_dashboard' },

        { timeoutMs: STATUS_TIMEOUT_MS },

      );

      const normalized = normalizeLegacyDashboardSub(dash.subscription);

      statusCache = { at: Date.now(), data: normalized };

      return normalized;

    } catch (_) {

      const fallback = unavailableStatus(primaryErr);

      statusCache = { at: Date.now(), data: fallback };

      return fallback;

    }

  }

}



export function clearSubscriptionCache() {

  statusCache = null;

}



export async function canUserPublish() {

  try {

    const data = await invokeEdgeFunction(

      'subscription-site-sync',

      { action: 'verify', platform: 'ios' },

      { timeoutMs: STATUS_TIMEOUT_MS },

    );

    if (data && data.canPublish === true) return data;

    if (data && data.entitled === true) return data;

    throw new Error('subscription_required');

  } catch (err) {

    if (String(err && err.message) === 'subscription_required') throw err;

    const sub = await fetchSubscriptionStatus({ fresh: true });

    if (isSubscribed(sub)) return { canPublish: true, entitled: true };

    throw new Error('subscription_required');

  }

}



export async function syncSubscriptionSite() {

  try {

    return await invokeEdgeFunction(

      'subscription-site-sync',

      { action: 'sync', platform: 'ios' },

      { timeoutMs: STATUS_TIMEOUT_MS },

    );

  } catch (_) {

    return null;

  }

}



export function computeAccessPhase(ctx) {

  const session = ctx.session || null;

  const onboardingDone = ctx.onboardingDone ?? !!(ctx.onboardingState && ctx.onboardingState.completed);

  const sitePublish = ctx.sitePublish || {};

  const subdomain = ctx.subdomain || ctx.subdomains || null;

  const subscription = ctx.subscription || {};



  if (!onboardingDone) return 'account_onboarding';



  if (isPlatformAdmin(session)) {

    return subdomain && subdomain.published_at ? 'full' : 'build_site';

  }



  const wasLive = Boolean(
    sitePublish.published ||
      sitePublish.publishedAt ||
      sitePublish.published_at ||
      (subdomain && subdomain.published_at),
  );

  const entitled = isSubscribed(subscription, session);

  const configured = subscription.configured === true;



  if (configured && !entitled && wasLive) return 'paywall';

  if (!wasLive && !(subdomain && subdomain.published_at)) return 'build_site';

  if (entitled) return 'full';

  return 'build_site';

}


