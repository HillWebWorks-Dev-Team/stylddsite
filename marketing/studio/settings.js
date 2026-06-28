/**
 * Web Studio Business Settings — Part 6.
 */
import { DEFAULT_BOOKING_HOURS } from '/js/booking-hours.js';
import { fmtMoney } from '/js/site-data.js';
import { fetchStripeConnectStatus } from '/js/studio-bookings.js';
import { invokeFunction } from '/js/studio-api.js';
import {
  bindAccountSettingsEvents,
  loadAccountSettingsData,
  renderAccountSettingsView,
  renderConnectedAccountsView,
} from '/marketing/studio/account-settings.js';
import { subscriptionLabel } from '/js/studio-subscription.js';
import {
  DEFAULT_BOOKING_PAYMENT,
  DEFAULT_PRODUCTS_SETTINGS,
  buildPolicySummary,
  loadSettingsBundle,
  loadSiteReviews,
  deleteSiteReview,
  normalizeBookingPayment,
  normalizeCancellationPolicy,
  normalizePromoCodes,
  paymentPreviewSummary,
  saveBookingPayment,
  saveBookingHoursSetting,
  saveCancellationPolicy,
  saveCertificationsBundle,
  saveProductsBundle,
  savePromoCodes,
  saveReviewsSettings,
  saveStyleCatalog,
  uploadStyleCover,
  publicMediaUrl,
} from '/js/studio-settings-data.js';

let ctx = null;
let route = '/studio/settings';
let bundle = null;
let stripe = null;
let reviews = [];
let accountBundle = null;
let paymentsTab = 'form';
let formSection = 'payments';
let scheduleTab = 'hours';
let editingStyleId = null;
let saving = false;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseSettingsRoute(pathname) {
  const clean = String(pathname || '').replace(/\/$/, '');
  if (clean === '/studio/settings/payments') return { view: 'payments' };
  if (clean === '/studio/settings/styles') return { view: 'styles' };
  if (clean === '/studio/settings/schedule') return { view: 'schedule' };
  if (clean === '/studio/settings/reviews') return { view: 'reviews' };
  if (clean === '/studio/settings/certifications') return { view: 'certifications' };
  if (clean === '/studio/settings/products') return { view: 'products' };
  if (clean === '/studio/settings/account') return { view: 'account' };
  if (clean === '/studio/settings/connected-accounts') return { view: 'connected' };
  return { view: 'hub' };
}

export function isSettingsRoute(r) {
  return String(r || '') === '/studio/settings' || String(r || '').startsWith('/studio/settings/');
}

export function settingsPageTitle(r) {
  const v = parseSettingsRoute(r).view;
  const map = {
    hub: 'Settings',
    payments: 'Form & Payments',
    styles: 'Styles & Services',
    schedule: 'Schedule',
    reviews: 'Reviews',
    certifications: 'Certifications',
    products: 'Products',
    account: 'Account',
    connected: 'Connected accounts',
  };
  return map[v] || 'Settings';
}

const HUB_SECTIONS = [
  {
    title: 'Account & billing',
    tiles: [
      { href: '/studio/subscribe', title: 'Subscription', desc: 'Styld Pro plan and billing', dynamic: 'subscription' },
      { href: '/studio/settings/account', title: 'Account', desc: 'Profile, email, password' },
      { href: '/studio/settings/connected-accounts', title: 'Connected accounts', desc: 'Stripe Connect / Styld Pay' },
    ],
  },
  {
    title: 'Business setup',
    tiles: [
      { href: '/studio/settings/payments', title: 'Payments', desc: 'Deposits, promos, payouts' },
      { href: '/studio/settings/styles', title: 'Styles & services', desc: 'Prices, duration, covers' },
      { href: '/studio/settings/schedule', title: 'Schedule', desc: 'Hours, book & block time' },
      { href: '/studio/settings/reviews', title: 'Reviews', desc: 'Collect & manage reviews' },
      { href: '/studio/settings/certifications', title: 'Certifications', desc: 'Credentials on your site' },
      { href: '/studio/settings/products', title: 'Products', desc: 'Shop catalog' },
    ],
  },
  {
    title: 'Your site',
    tiles: [{ href: '/studio/website/edit', title: 'Edit website', desc: 'Brand, content, publish' }],
  },
];

function backHub() {
  return '<a class="studio-back-link" href="/studio/settings">← Settings</a>';
}

function renderHub() {
  const subLabel = ctx?.subscription ? subscriptionLabel(ctx.subscription) : '';
  const sections = HUB_SECTIONS.map(function (section) {
    const tiles = section.tiles
      .map(function (t) {
        const desc =
          t.dynamic === 'subscription' && subLabel ? subLabel + ' · ' + t.desc : t.desc;
        return (
          '<a class="studio-settings-tile" href="' +
          esc(t.href) +
          '"><strong>' +
          esc(t.title) +
          '</strong><span>' +
          esc(desc) +
          '</span><span class="studio-settings-tile__arrow" aria-hidden="true">→</span></a>'
        );
      })
      .join('');
    return (
      '<section class="studio-settings-hub-section"><h2 class="studio-settings-hub-section__title">' +
      esc(section.title) +
      '</h2><div class="studio-settings__hub">' +
      tiles +
      '</div></section>'
    );
  }).join('');
  return (
    '<div class="studio-settings studio-settings--hub">' +
    '<header class="studio-page-header"><h1>Settings</h1><p>Manage your account, business, and booking site.</p></header>' +
    sections +
    '</div>'
  );
}

function stripeReady() {
  return stripe && stripe.status === 'ready';
}

function renderPayoutsTab() {
  const status = (stripe && stripe.status) || 'not_started';
  const statusLabel = {
    not_started: 'Not set up',
    onboarding: 'Onboarding',
    pending_review: 'Pending review',
    ready: 'Ready',
  }[status] || status;
  const avail = stripe ? (stripe.balanceAvailableCents || 0) / 100 : 0;
  const pending = stripe ? (stripe.balancePendingCents || 0) / 100 : 0;
  const bank = stripe && stripe.bankAccount ? stripe.bankAccount : null;

  return (
    '<div class="studio-settings-section"><h3>Styld Pay (Stripe Connect)</h3>' +
    '<div class="studio-settings-row">' +
    '<span class="studio-settings-pill">Status: <strong>' +
    esc(statusLabel) +
    '</strong></span>' +
    '<span class="studio-settings-pill">Available: <strong>' +
    esc(fmtMoney(avail)) +
    '</strong></span>' +
    '<span class="studio-settings-pill">Processing: <strong>' +
    esc(fmtMoney(pending)) +
    '</strong></span></div>' +
    (bank
      ? '<p style="color:var(--white-muted);font-size:0.85rem;margin:0.65rem 0 0">Bank ·••• ' +
        esc(bank.last4 || '****') +
        (bank.bank_name ? ' · ' + esc(bank.bank_name) : '') +
        '</p>'
      : '') +
    '<div class="studio-settings-row" style="margin-top:0.75rem">' +
    (status !== 'ready'
      ? '<button type="button" class="studio-btn studio-btn--primary" id="stripe-onboard">Set up Styld Pay</button>'
      : '<button type="button" class="studio-btn studio-btn--ghost" id="stripe-sync">Refresh status</button>') +
    (stripeReady() && avail > 0
      ? '<button type="button" class="studio-btn studio-btn--primary" id="stripe-payout">Request payout</button>'
      : '') +
    '</div></div>'
  );
}

function renderFormTab() {
  const p = bundle.bookingPayment;
  const promos = bundle.promoCodes;
  const policy = bundle.cancellationPolicy;
  const preview = paymentPreviewSummary(p, 200);
  const onlineBlocked = (p.mode === 'deposit' || p.mode === 'full') && !stripeReady();

  const formNav = ['payments', 'form', 'promos', 'policy', 'preview']
    .map(function (id) {
      const labels = { payments: 'Payments', form: 'Form', promos: 'Promos', policy: 'Policy', preview: 'Preview' };
      return (
        '<button type="button" data-form-section="' +
        id +
        '" class="' +
        (formSection === id ? 'is-active' : '') +
        '">' +
        labels[id] +
        '</button>'
      );
    })
    .join('');

  let body = '';

  if (formSection === 'payments') {
    body =
      '<div class="studio-settings-grid">' +
      '<label>Payment mode<select class="studio-field" id="pay-mode"><option value="in_person"' +
      (p.mode === 'in_person' ? ' selected' : '') +
      '>Pay in person</option><option value="deposit"' +
      (p.mode === 'deposit' ? ' selected' : '') +
      (stripeReady() ? '' : ' disabled') +
      '>Deposit online</option><option value="full"' +
      (p.mode === 'full' ? ' selected' : '') +
      (stripeReady() ? '' : ' disabled') +
      '>Full payment upfront</option></select></label>' +
      (onlineBlocked
        ? '<p style="color:#fbbf24;font-size:0.82rem;margin:0">Set up Styld Pay (Payouts tab) before enabling deposit or full payment.</p>'
        : '') +
      '<label>Deposit type<select class="studio-field" id="pay-deposit-kind"><option value="percent"' +
      (p.depositKind === 'percent' ? ' selected' : '') +
      '>Percent</option><option value="fixed"' +
      (p.depositKind === 'fixed' ? ' selected' : '') +
      '>Fixed amount</option></select></label>' +
      '<label>Deposit value<input class="studio-field" type="number" id="pay-deposit-value" value="' +
      esc(p.depositValue) +
      '"></label>' +
      '<label><input type="checkbox" id="pay-deposit-included"' +
      (p.depositIncludedInPrice ? ' checked' : '') +
      '> Deposit included in service price</label></div>';
  } else if (formSection === 'form') {
    body =
      '<div class="studio-settings-grid">' +
      '<label><input type="checkbox" id="pay-hair-photo"' +
      (p.requireCurrentHairPhoto ? ' checked' : '') +
      '> Require current hair photo</label>' +
      '<label><input type="checkbox" id="pay-ref-photo"' +
      (p.requireReferencePhoto ? ' checked' : '') +
      '> Require reference photo</label>' +
      '<label><input type="checkbox" id="pay-approval"' +
      (p.requireBookingApproval ? ' checked' : '') +
      '> Manual approval — paid bookings start as pending approval</label></div>';
  } else if (formSection === 'promos') {
    body =
      '<div id="promo-list">' +
      promos
        .map(function (pr, i) {
          return (
            '<div class="studio-promo-row" data-promo-index="' +
            i +
            '"><span><strong>' +
            esc(pr.code) +
            '</strong> · ' +
            esc(pr.discountKind === 'percent' ? pr.discountValue + '%' : '$' + pr.discountValue) +
            (pr.enabled ? '' : ' (disabled)') +
            '</span><button type="button" class="studio-btn studio-btn--ghost" data-remove-promo="' +
            i +
            '">Remove</button></div>'
          );
        })
        .join('') +
      (promos.length ? '' : '<div class="studio-empty">No promo codes yet.</div>') +
      '</div><button type="button" class="studio-btn studio-btn--ghost" id="add-promo" style="margin-top:0.5rem">Add promo code</button>';
  } else if (formSection === 'policy') {
    body =
      '<div class="studio-settings-grid">' +
      '<label>Preset<select class="studio-field" id="policy-preset"><option value="7_days"' +
      (policy.preset === '7_days' ? ' selected' : '') +
      '>7 days notice</option><option value="24_hours"' +
      (policy.preset === '24_hours' ? ' selected' : '') +
      '>24 hours notice</option><option value="custom"' +
      (policy.preset === 'custom' ? ' selected' : '') +
      '>Custom</option></select></label>' +
      '<label>Full refund notice (hours)<input class="studio-field" type="number" id="policy-hours" value="' +
      esc(policy.fullRefundNoticeHours) +
      '"></label>' +
      '<label>Refund applies to<select class="studio-field" id="policy-applies"><option value="deposit"' +
      (policy.refundAppliesTo === 'deposit' ? ' selected' : '') +
      '>Deposit</option><option value="full"' +
      (policy.refundAppliesTo === 'full' ? ' selected' : '') +
      '>Full payment</option><option value="both"' +
      (policy.refundAppliesTo === 'both' ? ' selected' : '') +
      '>Both</option><option value="none"' +
      (policy.refundAppliesTo === 'none' ? ' selected' : '') +
      '>None</option></select></label>' +
      '<div class="studio-settings-preview" id="policy-summary">' +
      esc(policy.policySummary || buildPolicySummary(policy)) +
      '</div></div>';
  } else {
    body =
      '<div class="studio-settings-preview">' +
      '<p><strong>Mode:</strong> ' +
      esc(preview.modeLabel) +
      '</p><p><strong>Sample $200 service — due now:</strong> ' +
      esc(fmtMoney(preview.dueNow)) +
      '</p><p><strong>Approval:</strong> ' +
      esc(preview.approval) +
      '</p><p><strong>Cancellation:</strong> ' +
      esc(bundle.cancellationPolicy.policySummary) +
      '</p></div>';
  }

  return (
    '<div class="studio-settings-tabs">' +
    formNav +
    '</div>' +
    '<div class="studio-settings-section">' +
    body +
    '</div>' +
    '<div class="studio-settings-save"><button type="button" class="studio-btn studio-btn--primary" id="save-payments"' +
    (saving ? ' disabled' : '') +
    '>' +
    (saving ? 'Saving…' : 'Save form settings') +
    '</button></div>'
  );
}

function renderPayments() {
  const tabs =
    '<div class="studio-settings-tabs">' +
    '<button type="button" data-pay-tab="form" class="' +
    (paymentsTab === 'form' ? 'is-active' : '') +
    '">Form</button>' +
    '<button type="button" data-pay-tab="payouts" class="' +
    (paymentsTab === 'payouts' ? 'is-active' : '') +
    '">Payouts</button></div>';

  return (
    '<div class="studio-settings">' +
    backHub() +
    '<h1 style="margin:0">Form & Payments</h1>' +
    tabs +
    (paymentsTab === 'payouts' ? renderPayoutsTab() : renderFormTab()) +
    '</div>'
  );
}

function renderStyles() {
  const cats = bundle.catalog.byCategory;
  let cards = '';
  Object.keys(cats)
    .sort()
    .forEach(function (cat) {
      cards += '<h3 style="margin:1rem 0 0.35rem;font-size:0.85rem;color:var(--white-dim)">' + esc(cat) + '</h3>';
      cards += cats[cat]
        .map(function (s) {
          const thumb = s.coverPath
            ? '<img src="' + esc(publicMediaUrl(s.coverPath)) + '" alt="">'
            : '<span class="studio-style-card__initial">' + esc(s.title.charAt(0)) + '</span>';
          return (
            '<div class="studio-style-card" data-edit-style="' +
            esc(s.id) +
            '">' +
            thumb +
            '<div><strong>' +
            esc(s.title) +
            '</strong><div style="font-size:0.78rem;color:var(--white-muted)">' +
            esc(fmtMoney(s.price)) +
            ' · ' +
            s.durationMinutes +
            ' min</div></div><span>›</span></div>'
          );
        })
        .join('');
    });

  return (
    '<div class="studio-settings">' +
    backHub() +
    '<h1 style="margin:0">Styles & Services</h1>' +
    '<p style="color:var(--white-muted);font-size:0.85rem">Tap a service to edit price, duration, cover, variants, and add-ons.</p>' +
    '<div class="studio-style-grid">' +
    cards +
    '</div></div>'
  );
}

function renderSchedule() {
  const tabs =
    '<div class="studio-settings-tabs">' +
    '<button type="button" data-sched-tab="hours" class="' +
    (scheduleTab === 'hours' ? 'is-active' : '') +
    '">Working hours</button>' +
    '<a href="/studio/calendar/schedule" class="' +
    (scheduleTab === 'schedule' ? 'is-active' : '') +
    '">Book & block time</a></div>';

  if (scheduleTab !== 'hours') {
    return (
      '<div class="studio-settings">' +
      backHub() +
      '<h1 style="margin:0">Schedule</h1>' +
      tabs +
      '<div class="studio-settings-section"><p>Use the calendar schedule page to drag-select appointment slots or block time.</p><a class="studio-btn studio-btn--primary" href="/studio/calendar/schedule">Open schedule</a></div></div>'
    );
  }

  const h = bundle.bookingHours;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const rows = days
    .map(function (label, i) {
      const closed = (h.closedWeekdays || []).indexOf(i) !== -1;
      const wh = (h.weekdayHours || {})[String(i)] || (h.weekdayHours || {})[i] || {};
      const openH = wh.startHour != null ? wh.startHour : h.slotDayStartHour;
      const openM = wh.startMinute != null ? wh.startMinute : h.slotDayStartMinute;
      const closeH = wh.endHour != null ? wh.endHour : h.slotDayEndHour;
      const closeM = wh.endMinute != null ? wh.endMinute : h.slotDayEndMinute;
      return (
        '<div class="studio-weekday-row" data-weekday="' +
        i +
        '"><label><input type="checkbox" data-day-closed="' +
        i +
        '"' +
        (closed ? ' checked' : '') +
        '> ' +
        label +
        ' closed</label>' +
        '<label>Open<input class="studio-field" type="time" data-day-open="' +
        i +
        '" value="' +
        String(openH).padStart(2, '0') +
        ':' +
        String(openM).padStart(2, '0') +
        '"' +
        (closed ? ' disabled' : '') +
        '></label>' +
        '<label>Close<input class="studio-field" type="time" data-day-close="' +
        i +
        '" value="' +
        String(closeH).padStart(2, '0') +
        ':' +
        String(closeM).padStart(2, '0') +
        '"' +
        (closed ? ' disabled' : '') +
        '></label></div>'
      );
    })
    .join('');

  return (
    '<div class="studio-settings">' +
    backHub() +
    '<h1 style="margin:0">Schedule</h1>' +
    tabs +
    '<div class="studio-settings-section"><h3>Weekly hours</h3>' +
    rows +
    '<div class="studio-settings-grid" style="margin-top:0.75rem">' +
    '<label>Slot step (minutes)<input class="studio-field" type="number" id="hours-step" value="' +
    esc(h.slotStepMinutes || 30) +
    '"></label>' +
    '<label>Same-day lead (minutes)<input class="studio-field" type="number" id="hours-lead" value="' +
    esc(h.sameDayLeadMinutes || 4320) +
    '"></label></div></div>' +
    '<div class="studio-settings-save"><button type="button" class="studio-btn studio-btn--primary" id="save-hours"' +
    (saving ? ' disabled' : '') +
    '>' +
    (saving ? 'Saving…' : 'Save working hours') +
    '</button></div></div>'
  );
}

function renderReviews() {
  const enabled = bundle.reviewsSettings.enabled;
  const avg =
    reviews.length > 0
      ? (reviews.reduce(function (n, r) {
          return n + r.rating;
        }, 0) / reviews.length).toFixed(1)
      : '—';

  const list =
    reviews.length === 0
      ? '<div class="studio-empty">No reviews yet.</div>'
      : reviews
          .map(function (r) {
            return (
              '<div class="studio-review-row"><span><strong>' +
              esc(r.client_name) +
              '</strong> · ' +
              r.rating +
              '/5<br><span style="color:var(--white-muted)">' +
              esc(r.message || '—') +
              '</span></span><button type="button" class="studio-btn studio-btn--ghost" data-delete-review="' +
              esc(r.id) +
              '">Delete</button></div>'
            );
          })
          .join('');

  return (
    '<div class="studio-settings">' +
    backHub() +
    '<h1 style="margin:0">Reviews</h1>' +
    '<div class="studio-settings-section"><label><input type="checkbox" id="reviews-enabled"' +
    (enabled ? ' checked' : '') +
    '> Collect reviews after completed appointments</label><p style="margin:0.5rem 0 0;color:var(--white-muted);font-size:0.85rem">Average: ' +
    esc(String(avg)) +
    ' · ' +
    reviews.length +
    ' review(s)</p></div>' +
    '<div class="studio-settings-section"><h3>Published reviews</h3>' +
    list +
    '</div>' +
    '<div class="studio-settings-save"><button type="button" class="studio-btn studio-btn--primary" id="save-reviews"' +
    (saving ? ' disabled' : '') +
    '>Save settings</button></div></div>'
  );
}

function renderCertifications() {
  const content = bundle.siteContent;
  const theme = bundle.siteTheme;
  const hidden = (content.hiddenSections || []).indexOf('certifications') !== -1;
  const items = theme.certificationItems || [];

  const grid = items
    .map(function (item, i) {
      return (
        '<div class="studio-promo-row"><span>' +
        esc(item.caption || 'Image ' + (i + 1)) +
        '</span><button type="button" class="studio-btn studio-btn--ghost" data-remove-cert="' +
        i +
        '">Remove</button></div>'
      );
    })
    .join('');

  return (
    '<div class="studio-settings">' +
    backHub() +
    '<h1 style="margin:0">Certifications</h1>' +
    '<div class="studio-settings-section"><div class="studio-settings-grid">' +
    '<label><input type="checkbox" id="cert-visible"' +
    (!hidden ? ' checked' : '') +
    '> Show certifications section on site</label>' +
    '<label>Section title<input class="studio-field" id="cert-title" value="' +
    esc(content.certificationsTitle) +
    '"></label>' +
    '<label>Blurb<textarea class="studio-field" rows="2" id="cert-blurb">' +
    esc(content.certificationsBlurb) +
    '</textarea></label>' +
    '<label>Upload image<input class="studio-field" type="file" accept="image/*" id="cert-upload"></label>' +
    '</div>' +
    (grid || '<div class="studio-empty">No certification images yet.</div>') +
    '</div>' +
    '<div class="studio-settings-save"><button type="button" class="studio-btn studio-btn--primary" id="save-cert"' +
    (saving ? ' disabled' : '') +
    '>Save certifications</button></div></div>'
  );
}

function renderProducts() {
  const ps = bundle.productsSettings;
  const content = bundle.siteContent;
  const hidden = (content.hiddenSections || []).indexOf('products') !== -1;
  const products = bundle.products;

  const list = products
    .map(function (p, i) {
      return (
        '<div class="studio-promo-row"><span><strong>' +
        esc(p.title) +
        '</strong> · ' +
        esc(fmtMoney(p.price)) +
        (p.enabled === false ? ' (hidden)' : '') +
        '</span><button type="button" class="studio-btn studio-btn--ghost" data-edit-product="' +
        i +
        '">Edit</button></div>'
      );
    })
    .join('');

  return (
    '<div class="studio-settings">' +
    backHub() +
    '<h1 style="margin:0">Products</h1>' +
    '<div class="studio-settings-section"><h3>Shop settings</h3><div class="studio-settings-grid">' +
    '<label><input type="checkbox" id="prod-visible"' +
    (!hidden ? ' checked' : '') +
    '> Show products section on site</label>' +
    '<label>Section title<input class="studio-field" id="prod-title" value="' +
    esc(content.productsTitle) +
    '"></label>' +
    '<label><input type="checkbox" id="prod-pickup"' +
    (ps.allowPickup ? ' checked' : '') +
    '> Allow pickup</label>' +
    '<label><input type="checkbox" id="prod-shipping"' +
    (ps.allowShipping ? ' checked' : '') +
    '> Allow shipping</label>' +
    '<label>Flat shipping rate<input class="studio-field" type="number" id="prod-ship-rate" value="' +
    esc(ps.shippingFlatRate) +
    '"></label>' +
    '<label>Pickup instructions<textarea class="studio-field" rows="2" id="prod-pickup-note">' +
    esc(ps.pickupInstructions) +
    '</textarea></label></div></div>' +
    '<div class="studio-settings-section"><h3>Catalog (' +
    products.length +
    ')</h3>' +
    (list || '<div class="studio-empty">No products yet.</div>') +
    '<button type="button" class="studio-btn studio-btn--ghost" id="add-product" style="margin-top:0.5rem">Add product</button></div>' +
    '<div class="studio-settings-save"><button type="button" class="studio-btn studio-btn--primary" id="save-products"' +
    (saving ? ' disabled' : '') +
    '>Save products</button></div></div>'
  );
}

function showStyleEditor(styleId) {
  const s = bundle.catalog.services.find(function (x) {
    return x.id === styleId;
  });
  if (!s) return;
  editingStyleId = styleId;
  const meta = bundle.styleMeta[styleId] || {};
  const variants = s.variants || [];
  const addons = s.addons || [];

  const backdrop = document.createElement('div');
  backdrop.className = 'studio-compose-backdrop';
  backdrop.innerHTML =
    '<div class="studio-compose-panel"><h3>Edit service</h3><p style="color:var(--white-muted);margin:0 0 0.75rem">' +
    esc(styleId) +
    '</p><div class="studio-compose-grid">' +
    '<label>Title<input class="studio-field" id="style-title" value="' +
    esc(s.title) +
    '"></label>' +
    '<label>Description<textarea class="studio-field" rows="2" id="style-desc">' +
    esc(s.description) +
    '</textarea></label>' +
    '<label>Price ($)<input class="studio-field" type="number" id="style-price" value="' +
    esc(s.price) +
    '"></label>' +
    '<label>Duration (min)<input class="studio-field" type="number" id="style-duration" value="' +
    esc(s.durationMinutes) +
    '"></label>' +
    '<label>Cover image<input class="studio-field" type="file" accept="image/*" id="style-cover"></label>' +
    '<label>Default version label<input class="studio-field" id="style-variant-label" value="' +
    esc(s.defaultVariantLabel) +
    '"></label>' +
    '<label>Extra versions (label|price, one per line)<textarea class="studio-field" rows="3" id="style-variants">' +
    esc(
      variants
        .map(function (v) {
          return v.label + '|' + v.price;
        })
        .join('\n'),
    ) +
    '</textarea></label>' +
    '<label>Add-ons (name|price, one per line)<textarea class="studio-field" rows="3" id="style-addons">' +
    esc(
      addons
        .map(function (a) {
          return a.name + '|' + a.price;
        })
        .join('\n'),
    ) +
    '</textarea></label></div>' +
    '<div class="studio-compose-grid" style="margin-top:0.75rem">' +
    '<button type="button" class="studio-btn studio-btn--primary" id="style-save">Save service</button>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="style-cancel">Cancel</button></div></div>';
  document.body.appendChild(backdrop);

  backdrop.querySelector('#style-cancel').addEventListener('click', function () {
    backdrop.remove();
    editingStyleId = null;
  });

  backdrop.querySelector('#style-save').addEventListener('click', function () {
    const title = backdrop.querySelector('#style-title').value.trim();
    const desc = backdrop.querySelector('#style-desc').value.trim();
    const price = Number(backdrop.querySelector('#style-price').value) || 0;
    const duration = Number(backdrop.querySelector('#style-duration').value) || 120;
    const variantLabel = backdrop.querySelector('#style-variant-label').value.trim() || 'Standard';

    function parseLines(raw, isVariant) {
      return String(raw || '')
        .split('\n')
        .map(function (line) {
          const parts = line.split('|');
          if (parts.length < 2) return null;
          const label = parts[0].trim();
          const p = Number(parts[1]);
          if (!label || !Number.isFinite(p)) return null;
          return isVariant
            ? { id: crypto.randomUUID(), label: label, price: p }
            : { id: crypto.randomUUID(), name: label, price: p };
        })
        .filter(Boolean);
    }

    bundle.styleMeta[styleId] = Object.assign({}, meta, {
      title: title,
      description: desc,
      durationMinutes: duration,
      defaultVariantLabel: variantLabel,
      variants: parseLines(backdrop.querySelector('#style-variants').value, true),
      addons: parseLines(backdrop.querySelector('#style-addons').value, false),
      category: s.category,
      venue: s.venue,
    });
    bundle.stylePrices[styleId] = price;

    const coverInput = backdrop.querySelector('#style-cover');
    const file = coverInput.files && coverInput.files[0];
    const finish = function () {
      saveStyleCatalog(ctx.session.user.id, bundle.styleMeta, bundle.stylePrices)
        .then(function () {
          backdrop.remove();
          return reload();
        })
        .catch(function (err) {
          window.alert(err && err.message ? err.message : 'Could not save style.');
        });
    };
    if (file) {
      uploadStyleCover(ctx.session.user.id, styleId, file).then(finish).catch(function (err) {
        window.alert(err && err.message ? err.message : 'Cover upload failed.');
      });
    } else {
      finish();
    }
  });
}

function collectPaymentFromDom() {
  const modeEl = document.getElementById('pay-mode');
  if (!modeEl) return bundle.bookingPayment;
  return normalizeBookingPayment({
    mode: modeEl.value,
    depositKind: document.getElementById('pay-deposit-kind')?.value,
    depositValue: Number(document.getElementById('pay-deposit-value')?.value),
    depositIncludedInPrice: document.getElementById('pay-deposit-included')?.checked,
    requireCurrentHairPhoto: document.getElementById('pay-hair-photo')?.checked,
    requireReferencePhoto: document.getElementById('pay-ref-photo')?.checked,
    requireBookingApproval: document.getElementById('pay-approval')?.checked,
  });
}

function collectHoursFromDom() {
  const h = Object.assign({}, bundle.bookingHours);
  h.closedWeekdays = [];
  h.weekdayHours = h.weekdayHours || {};
  for (let i = 0; i < 7; i++) {
    if (document.querySelector('[data-day-closed="' + i + '"]')?.checked) {
      h.closedWeekdays.push(i);
      continue;
    }
    const open = document.querySelector('[data-day-open="' + i + '"]')?.value || '08:00';
    const close = document.querySelector('[data-day-close="' + i + '"]')?.value || '19:30';
    const op = open.split(':');
    const cl = close.split(':');
    h.weekdayHours[String(i)] = {
      startHour: Number(op[0]),
      startMinute: Number(op[1]),
      endHour: Number(cl[0]),
      endMinute: Number(cl[1]),
    };
  }
  h.slotStepMinutes = Number(document.getElementById('hours-step')?.value) || 30;
  h.sameDayLeadMinutes = Number(document.getElementById('hours-lead')?.value) || 4320;
  return h;
}

async function reload() {
  bundle = await loadSettingsBundle(ctx.session.user.id);
  if (parseSettingsRoute(route).view === 'reviews') {
    reviews = await loadSiteReviews(ctx.session.user.id);
  }
  if (parseSettingsRoute(route).view === 'payments') {
    stripe = await fetchStripeConnectStatus();
  }
  paint();
}

function bindEvents(routeInfo) {
  document.querySelectorAll('[data-pay-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      paymentsTab = btn.getAttribute('data-pay-tab');
      paint();
    });
  });

  document.querySelectorAll('[data-form-section]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      formSection = btn.getAttribute('data-form-section');
      paint();
    });
  });

  document.querySelectorAll('[data-sched-tab]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      scheduleTab = btn.getAttribute('data-sched-tab');
      paint();
    });
  });

  document.getElementById('save-payments')?.addEventListener('click', function () {
    const payment = collectPaymentFromDom();
    if ((payment.mode === 'deposit' || payment.mode === 'full') && !stripeReady()) {
      window.alert('Set up Styld Pay before enabling online payments.');
      return;
    }
    saving = true;
    paint();
    Promise.all([
      saveBookingPayment(ctx.session.user.id, payment),
      savePromoCodes(ctx.session.user.id, bundle.promoCodes),
      saveCancellationPolicy(ctx.session.user.id, bundle.cancellationPolicy),
    ])
      .then(function () {
        saving = false;
        window.alert('Form settings saved.');
        return reload();
      })
      .catch(function (err) {
        saving = false;
        window.alert(err && err.message ? err.message : 'Save failed.');
        paint();
      });
  });

  document.getElementById('policy-preset')?.addEventListener('change', function (e) {
    bundle.cancellationPolicy.preset = e.target.value;
    bundle.cancellationPolicy = normalizeCancellationPolicy(bundle.cancellationPolicy);
    paint();
  });

  document.getElementById('policy-hours')?.addEventListener('input', function (e) {
    bundle.cancellationPolicy.fullRefundNoticeHours = Number(e.target.value);
    bundle.cancellationPolicy.policySummary = buildPolicySummary(bundle.cancellationPolicy);
    const el = document.getElementById('policy-summary');
    if (el) el.textContent = bundle.cancellationPolicy.policySummary;
  });

  document.getElementById('policy-applies')?.addEventListener('change', function (e) {
    bundle.cancellationPolicy.refundAppliesTo = e.target.value;
    bundle.cancellationPolicy.policySummary = buildPolicySummary(bundle.cancellationPolicy);
    paint();
  });

  document.getElementById('add-promo')?.addEventListener('click', function () {
    const code = window.prompt('Promo code (e.g. SUMMER10)');
    if (!code) return;
    bundle.promoCodes.push({
      id: crypto.randomUUID(),
      code: code.toUpperCase(),
      label: code,
      discountKind: 'percent',
      discountValue: 10,
      enabled: true,
      expiresAt: null,
      maxUses: null,
    });
    paint();
  });

  document.querySelectorAll('[data-remove-promo]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const i = Number(btn.getAttribute('data-remove-promo'));
      bundle.promoCodes.splice(i, 1);
      paint();
    });
  });

  document.getElementById('stripe-onboard')?.addEventListener('click', function () {
    invokeFunction('stripe-connect-onboard', {})
      .then(function (data) {
        const url = data && (data.url || data.onboardingUrl);
        if (url) window.open(url, '_blank', 'noopener');
        else window.alert('Onboarding URL not returned.');
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not start onboarding.');
      });
  });

  document.getElementById('stripe-sync')?.addEventListener('click', function () {
    invokeFunction('stripe-connect-sync', {})
      .then(function () {
        return fetchStripeConnectStatus();
      })
      .then(function (s) {
        stripe = s;
        paint();
      })
      .catch(function () {
        window.alert('Could not refresh Stripe status.');
      });
  });

  document.getElementById('stripe-payout')?.addEventListener('click', function () {
    if (!window.confirm('Request payout of available balance?')) return;
    invokeFunction('stripe-connect-payout', {})
      .then(function () {
        window.alert('Payout requested.');
        return fetchStripeConnectStatus();
      })
      .then(function (s) {
        stripe = s;
        paint();
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Payout failed.');
      });
  });

  document.querySelectorAll('[data-edit-style]').forEach(function (el) {
    el.addEventListener('click', function () {
      showStyleEditor(el.getAttribute('data-edit-style'));
    });
  });

  document.getElementById('save-hours')?.addEventListener('click', function () {
    saving = true;
    paint();
    saveBookingHoursSetting(ctx.session.user.id, collectHoursFromDom())
      .then(function () {
        saving = false;
        window.alert('Working hours saved.');
        return reload();
      })
      .catch(function (err) {
        saving = false;
        window.alert(err && err.message ? err.message : 'Save failed.');
        paint();
      });
  });

  document.getElementById('save-reviews')?.addEventListener('click', function () {
    bundle.reviewsSettings.enabled = document.getElementById('reviews-enabled')?.checked !== false;
    saving = true;
    paint();
    saveReviewsSettings(ctx.session.user.id, bundle.reviewsSettings)
      .then(function () {
        saving = false;
        window.alert('Review settings saved.');
        paint();
      })
      .catch(function (err) {
        saving = false;
        window.alert(err && err.message ? err.message : 'Save failed.');
        paint();
      });
  });

  document.querySelectorAll('[data-delete-review]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!window.confirm('Delete this review?')) return;
      deleteSiteReview(ctx.session.user.id, btn.getAttribute('data-delete-review'))
        .then(reload)
        .catch(function (err) {
          window.alert(err && err.message ? err.message : 'Delete failed.');
        });
    });
  });

  document.getElementById('save-cert')?.addEventListener('click', function () {
    const visible = document.getElementById('cert-visible')?.checked;
    const hidden = bundle.siteContent.hiddenSections || [];
    const idx = hidden.indexOf('certifications');
    if (!visible && idx === -1) hidden.push('certifications');
    if (visible && idx !== -1) hidden.splice(idx, 1);
    bundle.siteContent.hiddenSections = hidden;
    bundle.siteContent.certificationsTitle = document.getElementById('cert-title')?.value || '';
    bundle.siteContent.certificationsBlurb = document.getElementById('cert-blurb')?.value || '';
    saving = true;
    paint();
    saveCertificationsBundle(ctx.session.user.id, bundle.siteContent, bundle.siteTheme)
      .then(function () {
        saving = false;
        window.alert('Certifications saved.');
        return reload();
      })
      .catch(function (err) {
        saving = false;
        window.alert(err && err.message ? err.message : 'Save failed.');
        paint();
      });
  });

  document.getElementById('cert-upload')?.addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    import('/js/studio-api.js').then(function (m) {
      return m.uploadToStyleCovers(ctx.session.user.id, 'certifications', file);
    }).then(function (path) {
      bundle.siteTheme.certificationItems = bundle.siteTheme.certificationItems || [];
      bundle.siteTheme.certificationItems.push({ storagePath: path, mediaType: 'image', caption: '' });
      paint();
    });
  });

  document.querySelectorAll('[data-remove-cert]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const i = Number(btn.getAttribute('data-remove-cert'));
      bundle.siteTheme.certificationItems.splice(i, 1);
      paint();
    });
  });

  document.getElementById('add-product')?.addEventListener('click', function () {
    const title = window.prompt('Product name');
    if (!title) return;
    bundle.products.push({
      id: 'product-' + Date.now(),
      title: title,
      description: '',
      price: 0,
      enabled: true,
      imagePaths: [],
      storagePath: '',
      trackInventory: false,
      stockQty: 0,
    });
    paint();
  });

  document.querySelectorAll('[data-edit-product]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const i = Number(btn.getAttribute('data-edit-product'));
      const p = bundle.products[i];
      const price = window.prompt('Price for ' + p.title, String(p.price));
      if (price == null) return;
      p.price = Number(price) || 0;
      paint();
    });
  });

  document.getElementById('save-products')?.addEventListener('click', function () {
    const hidden = bundle.siteContent.hiddenSections || [];
    const idx = hidden.indexOf('products');
    const visible = document.getElementById('prod-visible')?.checked;
    if (!visible && idx === -1) hidden.push('products');
    if (visible && idx !== -1) hidden.splice(idx, 1);
    bundle.siteContent.hiddenSections = hidden;
    bundle.siteContent.productsTitle = document.getElementById('prod-title')?.value || '';
    bundle.productsSettings = {
      allowPickup: document.getElementById('prod-pickup')?.checked !== false,
      allowShipping: !!document.getElementById('prod-shipping')?.checked,
      shippingFlatRate: Number(document.getElementById('prod-ship-rate')?.value) || 0,
      pickupInstructions: document.getElementById('prod-pickup-note')?.value || '',
      shippingNote: bundle.productsSettings.shippingNote,
      defaultFulfillment: bundle.productsSettings.defaultFulfillment,
    };
    saving = true;
    paint();
    saveProductsBundle(ctx.session.user.id, bundle.products, bundle.productsSettings, bundle.siteContent)
      .then(function () {
        saving = false;
        window.alert('Products saved.');
        return reload();
      })
      .catch(function (err) {
        saving = false;
        window.alert(err && err.message ? err.message : 'Save failed.');
        paint();
      });
  });
}

function renderView(routeInfo) {
  switch (routeInfo.view) {
    case 'payments':
      return renderPayments();
    case 'styles':
      return renderStyles();
    case 'schedule':
      return renderSchedule();
    case 'reviews':
      return renderReviews();
    case 'certifications':
      return renderCertifications();
    case 'products':
      return renderProducts();
    case 'account':
      return accountBundle ? renderAccountSettingsView(ctx, accountBundle, stripe) : '<div class="studio-empty">Loading account…</div>';
    case 'connected':
      return backHub() + renderConnectedAccountsView(ctx, stripe);
    default:
      return renderHub();
  }
}

function paint() {
  const main = document.getElementById('studio-main');
  if (!main || !bundle) return;
  const routeInfo = parseSettingsRoute(route);
  const banner = main.querySelector('.studio-banner');
  main.innerHTML = (banner ? banner.outerHTML : '') + renderView(routeInfo);
  bindEvents(routeInfo);
  if (routeInfo.view === 'account' && accountBundle) {
    bindAccountSettingsEvents(ctx, accountBundle, paint);
  }
}

export async function mountSettings(mountCtx, mountRoute) {
  ctx = mountCtx;
  route = mountRoute || '/studio/settings';

  const main = document.getElementById('studio-main');
  if (!main) return;

  main.innerHTML =
    (main.querySelector('.studio-banner')?.outerHTML || '') +
    '<div class="studio-settings"><div class="studio-empty">Loading settings…</div></div>';

  bundle = await loadSettingsBundle(ctx.session.user.id);
  const routeInfo = parseSettingsRoute(route);
  if (routeInfo.view === 'reviews') {
    reviews = await loadSiteReviews(ctx.session.user.id);
  }
  if (routeInfo.view === 'payments' || routeInfo.view === 'connected') {
    stripe = await fetchStripeConnectStatus();
  }
  if (routeInfo.view === 'account') {
    accountBundle = await loadAccountSettingsData(ctx.session.user.id);
  }
  paint();
}

export function disposeSettings() {
  bundle = null;
  stripe = null;
  reviews = [];
  accountBundle = null;
}
