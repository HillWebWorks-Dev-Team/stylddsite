/**
 * Background subscription ↔ site sync (Part 8).
 */
import {
  fetchSubscriptionStatus,
  isSubscribed,
  syncSubscriptionSite,
} from './studio-subscription.js';

const SYNC_MS = 30000;
let stopFn = null;

function siteWasLive(ctx) {
  const sitePublish = ctx?.sitePublish || {};
  const subdomain = ctx?.subdomain || null;
  return Boolean(
    sitePublish.published ||
      sitePublish.publishedAt ||
      sitePublish.published_at ||
      (subdomain && subdomain.published_at),
  );
}

export function startSubscriptionSiteSync(ctx) {
  stopSubscriptionSiteSync();
  if (!ctx || !ctx.session) return;

  let timer = null;

  async function runSync() {
    try {
      const sub = await fetchSubscriptionStatus({ fresh: true });
      if (sub.configured === true && !isSubscribed(sub, ctx.session) && siteWasLive(ctx)) {
        await syncSubscriptionSite();
      }
    } catch (_) {}
  }

  runSync();
  timer = setInterval(runSync, SYNC_MS);
  const onVis = function () {
    if (document.visibilityState === 'visible') runSync();
  };
  document.addEventListener('visibilitychange', onVis);

  stopFn = function () {
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVis);
    stopFn = null;
  };
}

export function stopSubscriptionSiteSync() {
  if (stopFn) stopFn();
}

export async function republishAfterSubscribe(ctx) {
  const { publishSiteSubdomain } = await import('./studio-api.js');
  const slug = ctx?.subdomain?.subdomain || ctx?.sitePublish?.subdomain;
  if (!slug) return null;
  const name = ctx?.profile?.business_name || ctx?.profile?.full_name || '';
  return publishSiteSubdomain(ctx.session.user.id, slug, name);
}
