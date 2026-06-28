/**
 * Web Studio Paywall — Part 8.
 */
import { bootstrapStudio, signOut } from '/js/studio-api.js';
import {
  PAYWALL_FEATURES,
  PAYWALL_PLANS,
  manageSubscriptionUrl,
  paywallHeadline,
  paywallSubheadline,
} from '/js/paywall-content.js';
import { republishAfterSubscribe } from '/js/subscription-sync.js';
import {
  clearSubscriptionCache,
  fetchSubscriptionStatus,
  isSubscribed,
  subscriptionLabel,
} from '/js/studio-subscription.js';

let ctx = null;
let selectedPlan = 'yearly';
let checking = false;
let pollTimer = null;
let statusMessage = '';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isSubscribeRoute(r) {
  return String(r || '').replace(/\/$/, '') === '/studio/subscribe';
}

function isMandatory(ctxRef) {
  return ctxRef && ctxRef.accessPhase === 'paywall';
}

function planCardsHtml() {
  return Object.keys(PAYWALL_PLANS)
    .map(function (key) {
      const plan = PAYWALL_PLANS[key];
      return (
        '<button type="button" class="studio-paywall-plan' +
        (selectedPlan === key ? ' is-selected' : '') +
        '" data-plan="' +
        esc(key) +
        '">' +
        (plan.badge ? '<span class="studio-paywall-plan__badge">' + esc(plan.badge) + '</span>' : '') +
        '<span class="studio-paywall-plan__label">' +
        esc(plan.label) +
        '</span><strong class="studio-paywall-plan__price">' +
        esc(plan.price) +
        '<span class="studio-paywall-plan__period">' +
        esc(plan.period) +
        '</span></strong></button>'
      );
    })
    .join('');
}

function renderPaywall(mandatory, embedded) {
  const businessType = ctx?.onboardingState?.business_type || ctx?.onboardingState?.businessType;
  const subscribed = isSubscribed(ctx?.subscription, ctx?.session);
  const manageUrl = manageSubscriptionUrl(ctx?.subscription);

  if (subscribed && !mandatory) {
    return (
      '<div class="studio-paywall' +
      (embedded ? ' studio-paywall--embedded' : '') +
      '">' +
      (embedded
        ? ''
        : '<header class="studio-paywall__header"><a href="/studio/dashboard" class="studio-paywall__brand"><img src="/assets/styld-icon.png" alt=""> Styld</a><button type="button" class="studio-btn studio-btn--ghost" id="paywall-signout">Sign out</button></header>') +
      '<main class="studio-paywall__main"><span class="studio-paywall__tag">Subscribed</span>' +
      '<h1>You&rsquo;re on Styld Pro</h1>' +
      '<p class="studio-paywall__lead">Plan: <strong>' +
      esc(subscriptionLabel(ctx?.subscription)) +
      '</strong></p>' +
      (manageUrl
        ? '<a class="studio-btn studio-btn--primary studio-paywall__cta" href="' +
          esc(manageUrl) +
          '" target="_blank" rel="noopener noreferrer">Manage subscription</a>'
        : '') +
      '<a class="studio-btn studio-btn--ghost studio-paywall__cta" href="/studio/dashboard">Back to studio</a></main></div>'
    );
  }

  return (
    '<div class="studio-paywall' +
    (embedded ? ' studio-paywall--embedded' : '') +
    '">' +
    (embedded
      ? ''
      : '<header class="studio-paywall__header"><span class="studio-paywall__brand"><img src="/assets/styld-icon.png" alt=""> Styld Pro</span>' +
        '<button type="button" class="studio-btn studio-btn--ghost" id="paywall-signout">Sign out</button></header>') +
    '<main class="studio-paywall__main">' +
    '<span class="studio-paywall__tag">' +
    (mandatory ? 'Subscription required' : 'Styld Pro') +
    '</span>' +
    '<h1>' +
    esc(paywallHeadline(businessType)) +
    '</h1>' +
    '<p class="studio-paywall__lead">' +
    esc(paywallSubheadline(mandatory)) +
    '</p>' +
    '<ul class="studio-paywall__features">' +
    PAYWALL_FEATURES.map(function (f) {
      return '<li>' + esc(f) + '</li>';
    }).join('') +
    '</ul>' +
    '<div class="studio-paywall__ios-note"><strong>Subscribe on iPhone or iPad</strong> — Open the Styld app, sign in with <em>' +
    esc(ctx?.session?.user?.email || 'your account') +
    '</em>, choose ' +
    esc(PAYWALL_PLANS[selectedPlan].label) +
    ', then tap <strong>I&rsquo;ve subscribed</strong> below. Web billing via RevenueCat is coming soon.</div>' +
    '<div class="studio-paywall__plans">' +
    planCardsHtml() +
    '</div>' +
    '<button type="button" class="studio-btn studio-btn--primary studio-paywall__cta" id="paywall-subscribe"' +
    (checking ? ' disabled' : '') +
    '>Subscribe &amp; Continue</button>' +
    '<div class="studio-paywall__secondary">' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="paywall-refresh"' +
    (checking ? ' disabled' : '') +
    '>I&rsquo;ve subscribed — refresh</button>' +
    (!mandatory ? '<a class="studio-btn studio-btn--ghost" href="/studio/dashboard">Not now</a>' : '') +
    '</div>' +
    '<div class="studio-paywall__status' +
    (statusMessage.indexOf('✓') === 0 ? ' is-success' : statusMessage ? ' is-error' : '') +
    '" id="paywall-status">' +
    esc(statusMessage) +
    '</div>' +
    '<p class="studio-paywall__footer">Cancel anytime. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/support">Support</a></p>' +
    '</main></div>'
  );
}

async function handleSubscribed() {
  clearSubscriptionCache();
  ctx = await bootstrapStudio();
  if (!isSubscribed(ctx.subscription, ctx.session)) {
    statusMessage = 'Subscription not detected yet. Finish checkout in the Styld app, then refresh.';
    paint();
    return;
  }

  statusMessage = '✓ Subscription active — restoring your studio…';
  paint();

  try {
    if (isMandatory(ctx)) {
      await republishAfterSubscribe(ctx);
    }
  } catch (_) {}

  window.location.replace('/studio/dashboard');
}

async function refreshStatus() {
  if (checking) return;
  checking = true;
  statusMessage = 'Checking subscription…';
  paint();
  try {
    clearSubscriptionCache();
    ctx = await bootstrapStudio();
    if (isSubscribed(ctx.subscription, ctx.session)) {
      await handleSubscribed();
      return;
    }
    statusMessage = 'No active subscription found. Subscribe in the Styld iOS app with the same email, then try again.';
  } catch (err) {
    statusMessage = err && err.message ? err.message : 'Could not verify subscription.';
  } finally {
    checking = false;
    paint();
  }
}

function startPolling() {
  stopPolling();
  let attempts = 0;
  pollTimer = setInterval(function () {
    attempts += 1;
    if (attempts > 12) {
      stopPolling();
      return;
    }
    refreshStatus();
  }, 5000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function bindEvents() {
  document.querySelectorAll('[data-plan]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectedPlan = btn.getAttribute('data-plan') || 'yearly';
      paint();
    });
  });

  document.getElementById('paywall-subscribe')?.addEventListener('click', function () {
    statusMessage = 'Complete subscription in the Styld iOS app, then tap “I’ve subscribed — refresh”.';
    paint();
    startPolling();
  });

  document.getElementById('paywall-refresh')?.addEventListener('click', refreshStatus);

  document.getElementById('paywall-signout')?.addEventListener('click', function () {
    signOut().finally(function () {
      window.location.href = '/login';
    });
  });
}

function paint() {
  const root = document.getElementById('studio-paywall-root');
  if (!root || !ctx) return;
  const mandatory = isMandatory(ctx);
  root.innerHTML = renderPaywall(mandatory, true);
  bindEvents();
}

export function renderSubscribePage(mountCtx) {
  ctx = mountCtx;
  selectedPlan = 'yearly';
  statusMessage = '';
  paint();
}

export function disposeSubscribe() {
  stopPolling();
  ctx = null;
  checking = false;
  statusMessage = '';
}

export async function mountSubscribe(mountCtx) {
  renderSubscribePage(mountCtx);
}
