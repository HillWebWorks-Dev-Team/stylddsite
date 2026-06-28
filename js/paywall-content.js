/**
 * Paywall marketing copy — port of mobile paywallContent (Part 8).
 */

export const PAYWALL_PLANS = {
  monthly: {
    id: 'styld_monthly',
    label: 'Monthly',
    price: '$24.99',
    period: '/mo',
    badge: null,
  },
  yearly: {
    id: 'styld_yearly',
    label: 'Yearly',
    price: '$199.99',
    period: '/yr',
    badge: 'Save $100',
  },
};

export const PAYWALL_FEATURES = [
  'Live booking site on your own subdomain',
  'Unlimited appointments & client CRM',
  'Stripe payouts with Styld Pay',
  'Analytics, reminders & review collection',
];

export function paywallHeadline(businessType) {
  const type = String(businessType || '').toLowerCase();
  const map = {
    stylist: 'Grow your chair with Styld Pro',
    barber: 'Fill your chair with Styld Pro',
    makeup: 'Book more clients with Styld Pro',
    lash: 'Scale your lash business with Styld Pro',
    nails: 'Run your nail studio with Styld Pro',
  };
  return map[type] || 'Run your beauty business with Styld Pro';
}

export function paywallSubheadline(mandatory) {
  if (mandatory) {
    return 'Your subscription lapsed and your booking site is offline. Resubscribe to restore full studio access.';
  }
  return 'Publish your site, take bookings, and get paid — one subscription for your whole business.';
}

export function manageSubscriptionUrl(subscription) {
  if (!subscription || subscription.entitled !== true) return null;
  const product = String(subscription.productIdentifier || '').toLowerCase();
  if (product.includes('web') || subscription.store === 'stripe') {
    return 'https://billing.revenuecat.com/';
  }
  return 'https://apps.apple.com/account/subscriptions';
}
