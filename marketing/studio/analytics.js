/**
 * Web Studio Analytics — Part 7.
 */
import {
  PERIODS,
  friendlyPath,
  getBookingOverview,
  getMoneyStatsForLastDays,
  getPeriodBookingStats,
  getPopularServices,
  getTodayJobStats,
  getTopClients,
} from '/js/site-analytics.js';
import { fetchBusinessAnalytics } from '/js/studio-analytics-api.js';
import { isPrivacyMode, maskMoney, togglePrivacyMode } from '/js/privacy-mode.js';
import { createBookingsStore, fetchStripeConnectStatus } from '/js/studio-bookings.js';

let store = null;
let ctx = null;
let route = '/studio/analytics';
let period = 'month';
let analytics = null;
let analyticsLoading = true;
let stripe = null;
let stripeLoading = true;
let privacy = isPrivacyMode();
let focusHandler = null;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtCount(n) {
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function money(n) {
  return maskMoney(n, privacy);
}

function parseAnalyticsRoute(pathname) {
  const clean = String(pathname || '').replace(/\/$/, '');
  if (clean === '/studio/analytics/earnings') return { view: 'earnings' };
  return { view: 'overview' };
}

export function isAnalyticsRoute(r) {
  const path = String(r || '');
  return path === '/studio/analytics' || path.startsWith('/studio/analytics/');
}

export function isAnalyticsHomeRoute(r) {
  const clean = String(r || '').replace(/\/$/, '');
  return clean === '/studio/analytics';
}

export function analyticsPageTitle(r) {
  return parseAnalyticsRoute(r).view === 'earnings' ? 'Earnings' : 'Analytics';
}

function hasLinkedSite() {
  const slug = ctx?.subdomain?.subdomain || ctx?.sitePublish?.subdomain || '';
  return Boolean(ctx?.publishedAt && slug);
}

function barRows(items, labelKey, valueKey, maxItems) {
  const list = items || [];
  if (!list.length) return '<p style="color:var(--white-muted);font-size:0.85rem;margin:0">No data yet.</p>';
  let max = 1;
  list.forEach(function (item) {
    const v = Number(item[valueKey]) || 0;
    if (v > max) max = v;
  });
  return (
    '<div class="studio-analytics-bars">' +
    list
      .slice(0, maxItems || 8)
      .map(function (item) {
        const val = Number(item[valueKey]) || 0;
        const pct = Math.max(4, Math.round((val / max) * 100));
        return (
          '<div class="studio-analytics-bar"><span class="studio-analytics-bar__label">' +
          esc(item[labelKey]) +
          '</span><div class="studio-analytics-bar__track"><div class="studio-analytics-bar__fill" style="width:' +
          pct +
          '%"></div></div><span class="studio-analytics-bar__val">' +
          esc(fmtCount(val)) +
          '</span></div>'
        );
      })
      .join('') +
    '</div>'
  );
}

function trendChart(dailyTrend) {
  const daily = dailyTrend || [];
  if (!daily.length) {
    return '<p style="color:var(--white-muted);font-size:0.85rem;margin:0">No page views in the last 30 days.</p>';
  }
  let max = 1;
  daily.forEach(function (d) {
    if ((d.views || 0) > max) max = d.views;
  });
  return (
    '<div class="studio-analytics-trend">' +
    daily
      .map(function (d) {
        const h = Math.max(4, Math.round(((d.views || 0) / max) * 100));
        const label = String(d.date || '').slice(5);
        return (
          '<div class="studio-analytics-trend__col" title="' +
          esc((d.date || '') + ': ' + (d.views || 0) + ' views') +
          '"><div class="studio-analytics-trend__bar" style="height:' +
          h +
          '%"></div><span class="studio-analytics-trend__day">' +
          esc(label) +
          '</span></div>'
        );
      })
      .join('') +
    '</div>'
  );
}

function deviceBar(devices) {
  const d = devices || { mobile: 0, tablet: 0, desktop: 0 };
  const total = (d.mobile || 0) + (d.tablet || 0) + (d.desktop || 0);
  if (!total) {
    return '<p style="color:var(--white-muted);font-size:0.85rem;margin:0">No device data yet.</p>';
  }
  return (
    '<div class="studio-analytics-devices">' +
    '<span style="width:' +
    d.mobile +
    '%"></span>' +
    '<span style="width:' +
    d.tablet +
    '%"></span>' +
    '<span style="width:' +
    d.desktop +
    '%"></span></div>' +
    '<div class="studio-analytics-legend">' +
    '<span>Mobile ' +
    d.mobile +
    '%</span>' +
    '<span>Tablet ' +
    d.tablet +
    '%</span>' +
    '<span>Desktop ' +
    d.desktop +
    '%</span></div>'
  );
}

function linkSiteEmpty() {
  return (
    '<div class="studio-analytics-empty">' +
    '<h3>Publish your site to unlock analytics</h3>' +
    '<p>Business metrics and website traffic appear after your booking site is live with a subdomain.</p>' +
    '<a class="studio-btn studio-btn--primary" href="/studio/website/edit">Set up your site</a>' +
    '</div>'
  );
}

function overviewCountLabel() {
  if (!hasLinkedSite()) return 'Analytics';
  const bookings = store?.snapshot?.bookings || [];
  const clients = store?.snapshot?.clients || [];
  const periodStats = getPeriodBookingStats(bookings, period, clients);
  const periodLabel = PERIODS.find(function (p) {
    return p.id === period;
  });
  return (
    (periodLabel ? periodLabel.label : 'Month') +
    ' · ' +
    fmtCount(periodStats.newBookings) +
    ' booking' +
    (periodStats.newBookings === 1 ? '' : 's')
  );
}

function overviewToolbarHtml() {
  return (
    '<div class="studio-analytics__toolbar">' +
    '<span class="studio-analytics__count">' +
    esc(overviewCountLabel()) +
    '</span>' +
    '<div class="studio-analytics__toolbar-actions">' +
    '<a class="studio-analytics__pill-btn" href="/studio/analytics/earnings">Earnings</a>' +
    '<button type="button" class="studio-analytics__pill-btn" id="analytics-refresh">Refresh</button>' +
    '<button type="button" class="studio-analytics__pill-btn' +
    (privacy ? ' is-active' : '') +
    '" id="analytics-privacy" title="Hide dollar amounts">' +
    (privacy ? 'Privacy on' : 'Privacy off') +
    '</button></div></div>'
  );
}

function toolbarHtml(view) {
  const earningsLink =
    view === 'overview'
      ? '<a class="studio-analytics__pill-btn" href="/studio/analytics/earnings">Earnings</a>'
      : '<a class="studio-analytics__pill-btn" href="/studio/analytics">← Analytics</a>';
  return (
    '<div class="studio-analytics__toolbar">' +
    '<div class="studio-analytics__toolbar-actions">' +
    earningsLink +
    '<button type="button" class="studio-analytics__pill-btn" id="analytics-refresh">Refresh</button>' +
    '<button type="button" class="studio-analytics__pill-btn' +
    (privacy ? ' is-active' : '') +
    '" id="analytics-privacy" title="Hide dollar amounts">' +
    (privacy ? 'Privacy on' : 'Privacy off') +
    '</button></div></div>'
  );
}

function statTile(label, value, hint) {
  return (
    '<article class="studio-analytics-stat"><span class="studio-analytics-stat__label">' +
    esc(label) +
    '</span><strong class="studio-analytics-stat__value">' +
    esc(value) +
    '</strong>' +
    (hint ? '<span class="studio-analytics-stat__hint">' + esc(hint) + '</span>' : '') +
    '</article>'
  );
}

function trafficSection() {
  if (analyticsLoading) {
    return (
      '<section class="studio-analytics-panel"><h3>Website traffic</h3><p><span class="studio-analytics-loader"></span> Loading traffic…</p></section>'
    );
  }
  if (!analytics?.subdomain) {
    return (
      '<section class="studio-analytics-panel"><h3>Website traffic</h3><p>Publish your site to start tracking page views and visitors.</p></section>'
    );
  }
  return (
    '<section class="studio-analytics-panel"><h3>Website traffic</h3>' +
    '<div class="studio-analytics__grid" style="margin-bottom:0.85rem">' +
    statTile('Page views · 7d', fmtCount(analytics.views7d)) +
    statTile('Page views · 30d', fmtCount(analytics.views30d)) +
    statTile('Unique visitors · 7d', fmtCount(analytics.sessions7d)) +
    statTile('Unique visitors · 30d', fmtCount(analytics.sessions30d)) +
    '</div>' +
    '<h3 style="margin-top:1.25rem">30-day trend</h3>' +
    trendChart(analytics.dailyTrend) +
    '</section>' +
    '<section class="studio-analytics-panel"><h3>Visitor devices · 30 days</h3>' +
    (analytics.views30d ? deviceBar(analytics.devices) : '<p>No views in the last 30 days.</p>') +
    '</section>' +
    '<section class="studio-analytics-panel"><h3>Top pages · 30 days</h3>' +
    barRows(
      (analytics.topPages || []).map(function (p) {
        return { label: friendlyPath(p.path), views: p.views };
      }),
      'label',
      'views',
      8,
    ) +
    '</section>' +
    '<section class="studio-analytics-panel"><h3>Traffic sources · 30 days</h3>' +
    barRows(analytics.referrers || [], 'source', 'count', 6) +
    '</section>'
  );
}

function renderOverviewContent() {
  const bookings = store?.snapshot?.bookings || [];
  const clients = store?.snapshot?.clients || [];
  const overview = getBookingOverview(bookings);
  const money30 = getMoneyStatsForLastDays(bookings, 30);
  const today = getTodayJobStats(bookings);
  const periodStats = getPeriodBookingStats(bookings, period, clients);
  const popular = getPopularServices(bookings, 5);
  const topClients = getTopClients(clients, 5);

  const periodsHtml = PERIODS.map(function (p) {
    return (
      '<button type="button" data-period="' +
      esc(p.id) +
      '" class="studio-analytics__pill-btn' +
      (period === p.id ? ' is-active' : '') +
      '">' +
      esc(p.label) +
      '</button>'
    );
  }).join('');

  return (
    '<section class="studio-analytics-panel"><h3>Overview</h3>' +
    '<div class="studio-analytics__grid">' +
    statTile('Total bookings', fmtCount(overview.total)) +
    statTile('Collected · 30d', money(money30.collected)) +
    statTile(
      'Page views · 30d',
      analyticsLoading ? '…' : analytics?.subdomain ? fmtCount(analytics.views30d) : '—',
    ) +
    '</div></section>' +
    '<section class="studio-analytics-panel"><h3>Business snapshot</h3>' +
    '<div class="studio-analytics__grid studio-analytics__grid--2">' +
    statTile('Upcoming', fmtCount(overview.upcomingCount)) +
    statTile('Completed jobs', fmtCount(overview.completed)) +
    statTile('Pending payment', fmtCount(overview.pendingPayment)) +
    statTile('Cancelled', fmtCount(overview.cancelled)) +
    '</div></section>' +
    '<section class="studio-analytics-panel"><h3>Today</h3>' +
    '<p>Jobs completed: <strong>' +
    today.completed +
    ' / ' +
    today.total +
    '</strong></p>' +
    '<p>Progress: <strong>' +
    today.progress +
    '%</strong></p>' +
    '<div class="studio-analytics-progress"><div class="studio-analytics-progress__fill" style="width:' +
    today.progress +
    '%"></div></div></section>' +
    '<section class="studio-analytics-panel"><h3>Payments · last 30 days</h3>' +
    '<div class="studio-analytics-list">' +
    '<div class="studio-analytics-list__row"><span>Collected</span><span>' +
    money(money30.collected) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>Pending</span><span>' +
    money(money30.pending) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>Paid bookings</span><span>' +
    fmtCount(money30.paidBookings) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>Awaiting payment</span><span>' +
    fmtCount(money30.pendingBookings) +
    '</span></div></div></section>' +
    trafficSection() +
    '<section class="studio-analytics-panel"><div class="studio-analytics__section-head"><h3>Bookings</h3>' +
    '<div class="studio-analytics__periods" role="tablist">' +
    periodsHtml +
    '</div></div>' +
    '<div class="studio-analytics-list">' +
    '<div class="studio-analytics-list__row"><span>Revenue</span><span>' +
    money(periodStats.revenue) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>New bookings</span><span>' +
    fmtCount(periodStats.newBookings) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>Completed</span><span>' +
    fmtCount(periodStats.completed) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>Cancelled</span><span>' +
    fmtCount(periodStats.cancelled) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>Avg completed value</span><span>' +
    money(periodStats.avgCompletedValue) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>Total clients</span><span>' +
    fmtCount(periodStats.totalClients) +
    '</span></div></div></section>' +
    '<section class="studio-analytics-panel"><h3>Popular services</h3>' +
    barRows(popular, 'name', 'count', 5) +
    '</section>' +
    '<section class="studio-analytics-panel"><h3>Top clients</h3>' +
    (topClients.length
      ? '<div class="studio-analytics-list">' +
        topClients
          .map(function (c) {
            return (
              '<div class="studio-analytics-list__row"><span>' +
              esc(c.name) +
              '</span><span>' +
              money(c.totalSpent) +
              '</span></div>'
            );
          })
          .join('') +
        '</div>'
      : '<p>No clients yet.</p>') +
    '</section>'
  );
}

function renderOverviewHome() {
  const panelBody = hasLinkedSite() ? renderOverviewContent() : linkSiteEmpty();
  return (
    '<div class="studio-analytics studio-analytics--home">' +
    overviewToolbarHtml() +
    '<div class="studio-analytics__panel">' +
    panelBody +
    '</div></div>'
  );
}

function payoutStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid') return 'studio-analytics-pill--paid';
  if (s === 'in_transit' || s === 'in transit') return 'studio-analytics-pill--transit';
  return 'studio-analytics-pill--pending';
}

function renderEarnings() {
  const bookings = store?.snapshot?.bookings || [];
  const revToday = getPeriodBookingStats(bookings, 'day', []).revenue;
  const revWeek = getPeriodBookingStats(bookings, 'week', []).revenue;
  const revMonth = getPeriodBookingStats(bookings, 'month', []).revenue;

  if (stripeLoading) {
    return (
      toolbarHtml('earnings') +
      '<div class="studio-empty"><span class="studio-analytics-loader"></span> Loading earnings…</div>'
    );
  }

  if (!stripe || stripe.status !== 'ready') {
    return (
      toolbarHtml('earnings') +
      '<div class="studio-analytics-empty">' +
      '<h3>Connect Styld Pay to see earnings</h3>' +
      '<p>Set up Stripe Connect to view your balance, payouts, and wallet details.</p>' +
      '<a class="studio-btn studio-btn--primary" href="/studio/settings/payments">Set up payments</a>' +
      '</div>' +
      '<section class="studio-analytics-panel" style="margin-top:1rem"><h3>Booking revenue</h3>' +
      '<div class="studio-analytics-list">' +
      '<div class="studio-analytics-list__row"><span>Today</span><span>' +
      money(revToday) +
      '</span></div>' +
      '<div class="studio-analytics-list__row"><span>This week</span><span>' +
      money(revWeek) +
      '</span></div>' +
      '<div class="studio-analytics-list__row"><span>This month</span><span>' +
      money(revMonth) +
      '</span></div></div></section>'
    );
  }

  const avail = (stripe.balanceAvailableCents || 0) / 100;
  const pending = (stripe.balancePendingCents || 0) / 100;
  const payouts = Array.isArray(stripe.recentPayouts) ? stripe.recentPayouts : [];
  const payoutBars = payouts.slice(0, 7).map(function (p) {
    return {
      label: p.arrival_date || p.created || 'Payout',
      amount: (Number(p.amount_cents || p.amount) || 0) / (p.amount_cents != null ? 100 : 1),
      status: p.status || 'pending',
    };
  });

  return (
    toolbarHtml('earnings') +
    '<div class="studio-analytics-earnings">' +
    '<div>' +
    '<section class="studio-analytics-panel"><h3>Balance overview</h3>' +
    '<div class="studio-analytics__grid studio-analytics__grid--2">' +
    statTile('Available', money(avail)) +
    statTile('Processing', money(pending)) +
    '</div></section>' +
    (payoutBars.length
      ? '<section class="studio-analytics-panel"><h3>Recent payouts</h3>' +
        barRows(
          payoutBars.map(function (p) {
            return { label: String(p.label).slice(0, 10), views: Math.round(p.amount) };
          }),
          'label',
          'views',
          7,
        ) +
        '</section>'
      : '') +
    '<section class="studio-analytics-panel"><h3>Payout history</h3>' +
    (payouts.length
      ? payouts
          .slice(0, 12)
          .map(function (p) {
            const amt = (Number(p.amount_cents || p.amount) || 0) / (p.amount_cents != null ? 100 : 1);
            const when = p.arrival_date || p.created || '—';
            return (
              '<div class="studio-analytics-payout"><span>' +
              esc(when) +
              ' · ' +
              money(amt) +
              '</span><span class="studio-analytics-pill ' +
              payoutStatusClass(p.status) +
              '">' +
              esc(String(p.status || 'pending').replace(/_/g, ' ')) +
              '</span></div>'
            );
          })
          .join('')
      : '<p style="color:var(--white-muted);margin:0">No payouts yet.</p>') +
    '</section></div>' +
    '<section class="studio-analytics-panel"><h3>Booking revenue</h3>' +
    '<div class="studio-analytics-list">' +
    '<div class="studio-analytics-list__row"><span>Today</span><span>' +
    money(revToday) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>This week</span><span>' +
    money(revWeek) +
    '</span></div>' +
    '<div class="studio-analytics-list__row"><span>This month</span><span>' +
    money(revMonth) +
    '</span></div></div>' +
    '<p style="margin:1rem 0 0;font-size:0.82rem;color:var(--white-muted)">Revenue from bookings is separate from Stripe payout timing.</p></section></div>'
  );
}

function paint() {
  const main = document.getElementById('studio-main');
  if (!main || !store) return;
  const info = parseAnalyticsRoute(route);
  const isHome = isAnalyticsHomeRoute(route);
  const content = document.querySelector('.studio-content');
  if (content) {
    content.classList.toggle('studio-content--analytics-home', isHome);
  }
  const topbar = document.getElementById('studio-topbar');
  if (topbar) topbar.hidden = isHome;
  const banner = main.querySelector('.studio-banner');
  const bannerHtml = banner ? banner.outerHTML : '';
  const body =
    info.view === 'earnings'
      ? '<div class="studio-analytics">' + renderEarnings() + '</div>'
      : renderOverviewHome();
  main.innerHTML = bannerHtml + body;
  bindEvents();
}

async function refreshTraffic() {
  analyticsLoading = true;
  paint();
  analytics = await fetchBusinessAnalytics(ctx);
  analyticsLoading = false;
  paint();
}

async function refreshStripe() {
  stripeLoading = true;
  paint();
  stripe = await fetchStripeConnectStatus();
  stripeLoading = false;
  paint();
}

function bindEvents() {
  document.querySelectorAll('[data-period]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      period = btn.getAttribute('data-period') || 'month';
      paint();
    });
  });

  document.getElementById('analytics-refresh')?.addEventListener('click', function () {
    refreshTraffic();
    if (parseAnalyticsRoute(route).view === 'earnings') refreshStripe();
  });

  document.getElementById('analytics-privacy')?.addEventListener('click', function () {
    privacy = togglePrivacyMode();
    paint();
  });
}

export async function mountAnalytics(mountCtx, mountRoute) {
  ctx = mountCtx;
  route = mountRoute || '/studio/analytics';
  privacy = isPrivacyMode();

  const main = document.getElementById('studio-main');
  if (!main) return;

  if (!store) {
    store = await createBookingsStore(ctx, function () {
      paint();
    });
  }

  paint();
  refreshTraffic();

  if (parseAnalyticsRoute(route).view === 'earnings') {
    refreshStripe();
  }

  if (!focusHandler) {
    focusHandler = function () {
      if (!isAnalyticsRoute(window.location.pathname)) return;
      refreshTraffic();
    };
    window.addEventListener('focus', focusHandler);
  }
}

export function disposeAnalytics() {
  if (focusHandler) {
    window.removeEventListener('focus', focusHandler);
    focusHandler = null;
  }
  if (store && store.dispose) {
    store.dispose();
    store = null;
  }
  ctx = null;
  analytics = null;
  stripe = null;
}
