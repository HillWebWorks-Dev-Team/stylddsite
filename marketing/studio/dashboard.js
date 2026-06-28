/**
 * Web Studio Dashboard — Part 3 routes and UI.
 */
import {
  PERIODS,
  bookingStatusLabel,
  fmtMoney,
  formatDateLabel,
  formatTimeRange,
  getPaidAmount,
  getRevenueForPeriod,
  groupByDate,
  isCancelledBooking,
  uiStatusKind,
} from '/js/site-data.js';
import { getCalendarEventColors } from '/js/style-event-colors.js';
import {
  approveBooking,
  cancelBooking,
  completeSession,
  createBookingsStore,
  declinePendingBooking,
  listBookingGalleryPhotos,
  saveStylistNotes,
  startSession,
  styleCoverUrl,
  bookingPhotoUrl,
} from '/js/studio-bookings.js';

let store = null;
let mountCtx = null;
let mountRoute = '';
let period = 'week';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseDashboardRoute(pathname) {
  const clean = String(pathname || '').replace(/\/$/, '');
  if (clean === '/studio/dashboard') return { view: 'home' };
  if (clean === '/studio/dashboard/upcoming') return { view: 'upcoming' };
  if (clean === '/studio/dashboard/bookings') return { view: 'bookings' };
  const sessionMatch = clean.match(/^\/studio\/(?:dashboard|calendar)\/appointments\/([^/]+)\/session$/);
  if (sessionMatch) return { view: 'session', id: decodeURIComponent(sessionMatch[1]), fromCalendar: clean.indexOf('/studio/calendar/') === 0 };
  const detailMatch = clean.match(/^\/studio\/(?:dashboard|calendar)\/appointments\/([^/]+)$/);
  if (detailMatch) return { view: 'detail', id: decodeURIComponent(detailMatch[1]), fromCalendar: clean.indexOf('/studio/calendar/') === 0 };
  return { view: 'home' };
}

function appointmentBase(routeInfo) {
  if (routeInfo && routeInfo.fromCalendar) return '/studio/calendar/appointments';
  return '/studio/dashboard/appointments';
}

function listBackHref(routeInfo) {
  if (routeInfo && routeInfo.fromCalendar) return '/studio/calendar';
  return '/studio/dashboard';
}

function dashGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatLongDate(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function clientInitials(name) {
  const parts = String(name || 'C').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || 'C').toUpperCase();
}

function getTodayAppointments(bookings) {
  const todayKey = new Date().toISOString().slice(0, 10);
  return (bookings || [])
    .filter(function (b) {
      if (!b.startAt || isCancelledBooking(b)) return false;
      return b.startAt.toISOString().slice(0, 10) === todayKey;
    })
    .sort(function (a, b) {
      return (a.startAt?.getTime() || 0) - (b.startAt?.getTime() || 0);
    });
}

function statusBadge(kind, label) {
  return '<span class="dash-badge dash-badge--' + kind + '">' + esc(label) + '</span>';
}

function thumbHtml(storeRef, booking) {
  const coverPath = storeRef.coverForStyle(booking.style_id);
  if (coverPath) {
    return '<img class="dash-detail-thumb" src="' + esc(styleCoverUrl(coverPath)) + '" alt="">';
  }
  const colors = getCalendarEventColors({ styleId: booking.style_id, title: booking.style_name });
  const initial = (booking.style_name || 'S').trim().charAt(0).toUpperCase();
  return (
    '<div class="dash-detail-thumb dash-detail-thumb--initial" style="background:' +
    esc(colors.accent) +
    '22;color:' +
    esc(colors.accent) +
    '">' +
    esc(initial) +
    '</div>'
  );
}

function appointmentRowHtml(storeRef, booking, opts) {
  opts = opts || {};
  const href = '/studio/dashboard/appointments/' + encodeURIComponent(booking.id);
  const kind = uiStatusKind(booking);
  const status = bookingStatusLabel(booking.booking_status);
  const time = formatTimeRange(booking);
  const dateLabel = booking.startAt ? formatDateLabel(booking.startAt) : '—';
  const price = fmtMoney(booking.estimated_total);
  const colors = getCalendarEventColors({ styleId: booking.style_id, title: booking.style_name });
  const pendingActions =
    opts.pending && kind === 'pending'
      ? '<div class="dash-table__actions">' +
        '<button type="button" class="studio-btn studio-btn--primary studio-btn--sm" data-approve="' +
        esc(booking.id) +
        '">Accept</button>' +
        '<button type="button" class="studio-btn studio-btn--ghost studio-btn--sm" data-decline="' +
        esc(booking.id) +
        '">Decline</button>' +
        '</div>'
      : '<a class="dash-table__view" href="' +
        esc(href) +
        '">View<span aria-hidden="true">→</span></a>';

  return (
    '<tr class="dash-table__row">' +
    '<td><div class="dash-client">' +
    '<span class="dash-client__avatar" style="background:' +
    esc(colors.accent) +
    '22;color:' +
    esc(colors.accent) +
    '">' +
    esc(clientInitials(booking.full_name)) +
    '</span>' +
    '<span class="dash-client__info"><strong>' +
    esc(booking.full_name) +
    '</strong>' +
    (booking.phone ? '<span>' + esc(booking.phone) + '</span>' : '') +
    '</span></div></td>' +
    '<td><span class="dash-service">' +
    esc(booking.style_name) +
    '</span></td>' +
    '<td><span class="dash-when"><strong>' +
    esc(time) +
    '</strong><span>' +
    esc(dateLabel) +
    '</span></span></td>' +
    '<td>' +
    statusBadge(kind, status) +
    '</td>' +
    '<td class="dash-table__num">' +
    esc(price) +
    '</td>' +
    '<td class="dash-table__action">' +
    pendingActions +
    '</td></tr>'
  );
}

function appointmentTable(rowsHtml, emptyMessage) {
  if (!rowsHtml) {
    return (
      '<div class="dash-empty"><div class="dash-empty__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>' +
      '</div><p>' +
      esc(emptyMessage) +
      '</p></div>'
    );
  }
  return (
    '<div class="dash-table-wrap"><table class="dash-table">' +
    '<thead><tr><th>Client</th><th>Service</th><th>Schedule</th><th>Status</th><th class="dash-table__num">Amount</th><th></th></tr></thead>' +
    '<tbody>' +
    rowsHtml +
    '</tbody></table></div>'
  );
}

function dashPanel(title, seeAllHref, body, opts) {
  opts = opts || {};
  const seeAll = seeAllHref
    ? '<a class="dash-panel__link" href="' + esc(seeAllHref) + '">View all</a>'
    : '';
  const badge =
    opts.badge != null
      ? '<span class="dash-panel__badge">' + esc(String(opts.badge)) + '</span>'
      : '';
  return (
    '<section class="dash-panel' +
    (opts.alert ? ' dash-panel--alert' : '') +
    '"><header class="dash-panel__head"><div class="dash-panel__title">' +
    '<h2>' +
    esc(title) +
    '</h2>' +
    badge +
    '</div>' +
    seeAll +
    '</header><div class="dash-panel__body">' +
    body +
    '</div></section>'
  );
}

function kpiCard(label, value, hint, tone) {
  tone = tone || 'default';
  return (
    '<article class="dash-kpi dash-kpi--' +
    tone +
    '"><span class="dash-kpi__label">' +
    esc(label) +
    '</span><strong class="dash-kpi__value">' +
    esc(value) +
    '</strong>' +
    (hint ? '<span class="dash-kpi__hint">' + esc(hint) + '</span>' : '') +
    '</article>'
  );
}

function revenuePanel(storeRef) {
  const stripe = storeRef.stripe;
  const loading = storeRef.stripeLoading;
  const revenue = getRevenueForPeriod(storeRef.snapshot.bookings, period);
  const periodsHtml = PERIODS.map(function (p) {
    return (
      '<button type="button" data-period="' +
      esc(p.id) +
      '" class="dash-periods__btn' +
      (period === p.id ? ' is-active' : '') +
      '">' +
      esc(p.label) +
      '</button>'
    );
  }).join('');

  let amountHtml = '';
  let subHtml = '';

  if (loading) {
    amountHtml = '<div class="dash-revenue__loader"></div>';
    subHtml = '<p class="dash-revenue__sub">Loading wallet…</p>';
  } else if (stripe && stripe.status === 'ready') {
    amountHtml = '<div class="dash-revenue__amount">' + esc(fmtMoney(revenue)) + '</div>';
    const avail = ((stripe.balanceAvailableCents || 0) / 100).toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    const pending = ((stripe.balancePendingCents || 0) / 100).toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
    subHtml =
      '<p class="dash-revenue__sub">' +
      esc(avail) +
      ' available · ' +
      esc(pending) +
      ' processing</p>' +
      '<a class="dash-revenue__link" href="/studio/analytics/earnings">Open earnings report →</a>';
  } else {
    amountHtml = '<div class="dash-revenue__amount">' + esc(fmtMoney(revenue)) + '</div>';
    subHtml =
      '<p class="dash-revenue__sub">Estimated from bookings in this period.</p>' +
      '<a class="dash-revenue__link" href="/studio/settings">Set up Styld Pay →</a>';
  }

  return (
    '<section class="dash-revenue">' +
    '<header class="dash-revenue__head"><h2>Revenue</h2>' +
    '<div class="dash-periods" role="tablist">' +
    periodsHtml +
    '</div></header>' +
    amountHtml +
    subHtml +
    '</section>'
  );
}

function recentListHtml(storeRef, bookings) {
  if (!bookings.length) {
    return '<div class="dash-empty dash-empty--compact"><p>No recent bookings yet.</p></div>';
  }
  return (
    '<ul class="dash-recent">' +
    bookings
      .map(function (b) {
        const href = '/studio/dashboard/appointments/' + encodeURIComponent(b.id);
        const kind = uiStatusKind(b);
        return (
          '<li><a class="dash-recent__item" href="' +
          esc(href) +
          '"><span class="dash-recent__main"><strong>' +
          esc(b.full_name) +
          '</strong><span>' +
          esc(b.style_name) +
          '</span></span><span class="dash-recent__meta">' +
          statusBadge(kind, bookingStatusLabel(b.booking_status)) +
          '<span>' +
          esc(fmtMoney(b.estimated_total)) +
          '</span></span></a></li>'
        );
      })
      .join('') +
    '</ul>'
  );
}

function renderHome(storeRef) {
  const snap = storeRef.snapshot;
  const stats = snap.todayStats;
  const todayList = getTodayAppointments(snap.bookings);
  const revenue = getRevenueForPeriod(snap.bookings, period);
  const now = new Date();

  const todaySubtitle =
    stats.total === 0
      ? 'No appointments scheduled for today'
      : stats.inProgress
        ? stats.inProgress + ' in progress · ' + stats.completed + ' completed · ' + stats.total + ' total today'
        : stats.completed >= stats.total
          ? 'All ' + stats.total + ' appointments completed today'
          : stats.completed + ' of ' + stats.total + ' completed today (' + stats.progress + '%)';

  const todayRows = todayList
    .map(function (b) {
      return appointmentRowHtml(storeRef, b);
    })
    .join('');

  const upcomingPreview = snap.upcoming.slice(0, 6);
  const upcomingRows = upcomingPreview
    .map(function (b) {
      return appointmentRowHtml(storeRef, b);
    })
    .join('');

  const pendingRows = snap.pending
    .map(function (b) {
      return appointmentRowHtml(storeRef, b, { pending: true });
    })
    .join('');

  const kpis =
    kpiCard('Today', String(stats.total), stats.total ? todaySubtitle : 'Clear schedule', 'today') +
    kpiCard('In progress', String(stats.inProgress), stats.inProgress ? 'Active right now' : 'Nothing in session', 'live') +
    kpiCard('Pending', String(snap.pending.length), snap.pending.length ? 'Needs your approval' : 'All caught up', 'pending') +
    kpiCard('Revenue', fmtMoney(revenue), PERIODS.find(function (p) { return p.id === period; })?.label || 'This period', 'revenue');

  return (
    '<div class="dash">' +
    '<header class="dash-header">' +
    '<div class="dash-header__copy">' +
    '<h1 class="dash-header__title">' +
    esc(dashGreeting()) +
    '</h1>' +
    '<p class="dash-header__sub">' +
    esc(formatLongDate(now)) +
    '</p></div>' +
    '<div class="dash-header__actions">' +
    '<a class="studio-btn studio-btn--ghost" href="/studio/calendar">Calendar</a>' +
    '<a class="studio-btn studio-btn--primary" href="/studio/dashboard/upcoming">All upcoming</a>' +
    '</div></header>' +
    '<div class="dash-kpis">' +
    kpis +
    '</div>' +
    '<div class="dash-layout">' +
    '<div class="dash-layout__main">' +
    (snap.pending.length
      ? dashPanel(
          'Pending approval',
          null,
          appointmentTable(pendingRows, 'No bookings waiting for approval.'),
          { badge: snap.pending.length, alert: true },
        )
      : '') +
    dashPanel("Today's schedule", null, appointmentTable(todayRows, 'No appointments on the calendar for today.')) +
    dashPanel(
      'Upcoming',
      snap.upcoming.length > upcomingPreview.length ? '/studio/dashboard/upcoming' : null,
      appointmentTable(upcomingRows, 'No upcoming appointments scheduled.'),
      { badge: snap.upcoming.length || null },
    ) +
    '</div>' +
    '<aside class="dash-layout__aside">' +
    revenuePanel(storeRef) +
    dashPanel(
      'Recent bookings',
      snap.recent.length ? '/studio/dashboard/bookings' : null,
      recentListHtml(storeRef, snap.recent),
    ) +
    '<nav class="dash-quick" aria-label="Quick links">' +
    '<a href="/studio/calendar">Open calendar</a>' +
    '<a href="/studio/clients">View clients</a>' +
    '<a href="/studio/analytics">Analytics</a>' +
    '</nav></aside></div></div>'
  );
}

function listPageHeader(title, subtitle, backHref) {
  return (
    '<header class="dash-list-header">' +
    '<a class="dash-breadcrumb" href="' +
    esc(backHref) +
    '"><span aria-hidden="true">←</span> Dashboard</a>' +
    '<h1 class="dash-list-header__title">' +
    esc(title) +
    '</h1>' +
    (subtitle ? '<p class="dash-list-header__sub">' + esc(subtitle) + '</p>' : '') +
    '</header>'
  );
}

function renderUpcoming(storeRef) {
  const groups = groupByDate(storeRef.snapshot.upcoming);
  if (!groups.length) {
    return (
      '<div class="dash">' +
      listPageHeader('Upcoming appointments', 'Everything scheduled ahead', '/studio/dashboard') +
      dashPanel('Schedule', null, appointmentTable('', 'No upcoming appointments on the books.')) +
      '</div>'
    );
  }
  const body = groups
    .map(function (group) {
      const rows = group.appointments
        .map(function (b) {
          return appointmentRowHtml(storeRef, b);
        })
        .join('');
      return (
        '<div class="dash-day-group"><h3 class="dash-day-group__label">' +
        esc(group.label) +
        '</h3>' +
        appointmentTable(rows, '') +
        '</div>'
      );
    })
    .join('');
  return (
    '<div class="dash">' +
    listPageHeader(
      'Upcoming appointments',
      groups.length + ' day' + (groups.length === 1 ? '' : 's') + ' · ' + storeRef.snapshot.upcoming.length + ' total',
      '/studio/dashboard',
    ) +
    dashPanel('Schedule', null, body) +
    '</div>'
  );
}

function renderAllBookings(storeRef) {
  const list = storeRef.snapshot.bookings.slice().sort(function (a, b) {
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
  if (!list.length) {
    return (
      '<div class="dash">' +
      listPageHeader('All bookings', 'Complete booking history', '/studio/dashboard') +
      dashPanel('Bookings', null, appointmentTable('', 'No bookings yet.')) +
      '</div>'
    );
  }
  const rows = list
    .map(function (b) {
      return appointmentRowHtml(storeRef, b);
    })
    .join('');
  return (
    '<div class="dash">' +
    listPageHeader('All bookings', list.length + ' total', '/studio/dashboard') +
    dashPanel('History', null, appointmentTable(rows, '')) +
    '</div>'
  );
}

function paymentBreakdown(booking) {
  const total = booking.estimated_total || 0;
  const deposit = booking.deposit_amount || 0;
  const paid = getPaidAmount(booking);
  const balance = Math.max(0, total - deposit);
  let lines =
    '<dl><dt>Total</dt><dd>' +
    esc(fmtMoney(total)) +
    '</dd><dt>Deposit</dt><dd>' +
    esc(fmtMoney(deposit)) +
    '</dd><dt>Collected</dt><dd>' +
    esc(fmtMoney(paid)) +
    '</dd>';
  if (balance > 0 && booking.payment_status !== 'paid') {
    lines += '<dt>Balance due</dt><dd>' + esc(fmtMoney(balance)) + '</dd>';
  }
  if (booking.refund_status) {
    lines += '<dt>Refund</dt><dd>' + esc(String(booking.refund_status)) + '</dd>';
  }
  lines += '</dl>';
  return lines;
}

function detailActionsHtml(booking, routeInfo) {
  const base = appointmentBase(routeInfo);
  const s = String(booking.booking_status || '').toLowerCase();
  const parts = [];
  if (s === 'pending_approval') {
    parts.push('<button type="button" class="studio-btn studio-btn--primary" data-approve="' + esc(booking.id) + '">Accept booking</button>');
    parts.push('<button type="button" class="studio-btn studio-btn--ghost" data-decline="' + esc(booking.id) + '">Decline</button>');
  }
  if (s === 'confirmed') {
    parts.push('<button type="button" class="studio-btn studio-btn--primary" data-start="' + esc(booking.id) + '">Start session</button>');
    parts.push('<button type="button" class="studio-btn studio-btn--ghost" data-cancel="' + esc(booking.id) + '">Cancel</button>');
  }
  if (s === 'in_progress') {
    parts.push(
      '<a class="studio-btn studio-btn--primary" href="' +
        base +
        '/' +
        encodeURIComponent(booking.id) +
        '/session">Finish session</a>',
    );
    parts.push('<button type="button" class="studio-btn studio-btn--ghost" data-cancel="' + esc(booking.id) + '">Cancel</button>');
  }
  if (!parts.length) return '';
  return parts.join('');
}

function detailInfoCard(title, body) {
  return (
    '<article class="dash-info-card"><h3>' +
    esc(title) +
    '</h3><div class="dash-info-card__body">' +
    body +
    '</div></article>'
  );
}

function renderDetail(storeRef, booking, photos, routeInfo) {
  const kind = uiStatusKind(booking);
  const base = appointmentBase(routeInfo);
  const back = listBackHref(routeInfo);
  const hair = [booking.hair_length, booking.hair_option].filter(Boolean).join(' · ');
  const products =
    booking.order_products && booking.order_products.length
      ? '<ul class="dash-list">' +
        booking.order_products
          .map(function (p) {
            const name = p.name || p.title || 'Product';
            const qty = p.quantity || 1;
            return '<li>' + esc(name) + (qty > 1 ? ' × ' + qty : '') + '</li>';
          })
          .join('') +
        '</ul>'
      : '<p class="dash-muted">No product add-ons.</p>';

  const photoItems = [];
  if (booking.photo_hair_path) photoItems.push(bookingPhotoUrl(booking.photo_hair_path));
  if (booking.photo_ref_path) photoItems.push(bookingPhotoUrl(booking.photo_ref_path));
  photos.forEach(function (url) {
    if (url && photoItems.indexOf(url) === -1) photoItems.push(url);
  });

  const photosHtml = photoItems.length
    ? '<div class="dash-photo-grid">' +
      photoItems
        .map(function (url) {
          return '<img src="' + esc(url) + '" alt="Booking photo">';
        })
        .join('') +
      '</div>'
    : '<p class="dash-muted">No photos uploaded.</p>';

  const notesField =
    booking.booking_status === 'in_progress'
      ? '<textarea class="studio-field" rows="4" id="stylist-notes" placeholder="Private stylist notes">' +
        esc(booking.stylist_notes) +
        '</textarea><button type="button" class="studio-btn studio-btn--ghost" id="save-notes" style="margin-top:0.65rem">Save notes</button>'
      : booking.stylist_notes
        ? '<p>' + esc(booking.stylist_notes) + '</p>'
        : '<p class="dash-muted">No stylist notes.</p>';

  const colors = getCalendarEventColors({ styleId: booking.style_id, title: booking.style_name });

  return (
    '<div class="dash dash--detail">' +
    '<header class="dash-detail-header">' +
    '<a class="dash-breadcrumb" href="' +
    esc(back) +
    '"><span aria-hidden="true">←</span> ' +
    esc(routeInfo && routeInfo.fromCalendar ? 'Calendar' : 'Dashboard') +
    '</a>' +
    '<div class="dash-detail-hero">' +
    '<div class="dash-detail-hero__visual">' +
    thumbHtml(storeRef, booking) +
    '</div>' +
    '<div class="dash-detail-hero__copy">' +
    '<div class="dash-detail-hero__tags">' +
    statusBadge(kind, bookingStatusLabel(booking.booking_status)) +
    '<span class="dash-detail-hero__service" style="color:' +
    esc(colors.accent) +
    '">' +
    esc(booking.style_name) +
    '</span></div>' +
    '<h1 class="dash-detail-hero__name">' +
    esc(booking.full_name) +
    '</h1>' +
    '<p class="dash-detail-hero__schedule">' +
    esc(formatDateLabel(booking.startAt)) +
    ' · ' +
    esc(formatTimeRange(booking)) +
    ' · ' +
    esc(booking.duration_minutes + ' min') +
    '</p>' +
    (booking.service_address ? '<p class="dash-detail-hero__address">' + esc(booking.service_address) + '</p>' : '') +
    '</div>' +
    '<div class="dash-detail-hero__actions">' +
    (detailActionsHtml(booking, routeInfo) || '') +
    '</div></div></header>' +
    '<div class="dash-detail-grid">' +
    detailInfoCard(
      'Client',
      (booking.phone ? '<p><a href="tel:' + esc(booking.phone) + '">' + esc(booking.phone) + '</a></p>' : '') +
        (booking.email ? '<p><a href="mailto:' + esc(booking.email) + '">' + esc(booking.email) + '</a></p>' : '') +
        (hair ? '<p>' + esc(hair) + '</p>' : '<p class="dash-muted">—</p>'),
    ) +
    detailInfoCard('Payment', paymentBreakdown(booking)) +
    (booking.notes ? detailInfoCard('Client notes', '<p>' + esc(booking.notes) + '</p>') : '') +
    detailInfoCard('Photos', photosHtml) +
    detailInfoCard('Products', products) +
    detailInfoCard('Stylist notes', notesField) +
    '</div></div>'
  );
}

function renderSession(storeRef, booking, routeInfo) {
  const base = appointmentBase(routeInfo);
  const kind = uiStatusKind(booking);
  return (
    '<div class="dash dash--session">' +
    '<header class="dash-list-header">' +
    '<a class="dash-breadcrumb" href="' +
    esc(base + '/' + encodeURIComponent(booking.id)) +
    '"><span aria-hidden="true">←</span> Appointment</a>' +
    '<h1 class="dash-list-header__title">Complete session</h1>' +
    '<p class="dash-list-header__sub">' +
    esc(booking.full_name) +
    ' · ' +
    esc(booking.style_name) +
    '</p></header>' +
    '<div class="dash-session-card">' +
    '<div class="dash-session-card__head">' +
    statusBadge(kind, bookingStatusLabel(booking.booking_status)) +
    '</div>' +
    '<label class="dash-field"><span>Stylist notes</span><textarea class="studio-field" rows="4" id="session-notes">' +
    esc(booking.stylist_notes) +
    '</textarea></label>' +
    '<div class="dash-session-card__row">' +
    '<label class="dash-field"><span>Tip (optional)</span><input class="studio-field" type="number" min="0" step="1" id="session-tip" placeholder="0"></label>' +
    '<label class="dash-field"><span>Cash balance (optional)</span><input class="studio-field" type="number" min="0" step="1" id="session-cash" placeholder="0"></label>' +
    '</div>' +
    '<p class="dash-muted dash-session-card__hint">Cash balance is for amounts collected in person at checkout.</p>' +
    '<div class="dash-session-card__actions">' +
    '<button type="button" class="studio-btn studio-btn--primary" id="complete-session" data-id="' +
    esc(booking.id) +
    '">Complete appointment</button></div></div></div>'
  );
}

function renderView(storeRef, routeInfo, extra) {
  switch (routeInfo.view) {
    case 'upcoming':
      return renderUpcoming(storeRef);
    case 'bookings':
      return renderAllBookings(storeRef);
    case 'detail':
      if (!extra.booking) {
        return (
          '<div class="dash">' +
          listPageHeader('Appointment', null, listBackHref(routeInfo)) +
          dashPanel('Not found', null, appointmentTable('', 'This booking could not be found.')) +
          '</div>'
        );
      }
      return renderDetail(storeRef, extra.booking, extra.photos || [], routeInfo);
    case 'session':
      if (!extra.booking) {
        return (
          '<div class="dash">' +
          listPageHeader('Session', null, listBackHref(routeInfo)) +
          dashPanel('Not found', null, appointmentTable('', 'This booking could not be found.')) +
          '</div>'
        );
      }
      return renderSession(storeRef, extra.booking, routeInfo);
    default:
      return renderHome(storeRef);
  }
}

async function paint() {
  const main = document.getElementById('studio-main');
  if (!main || !store) return;
  const routeInfo = parseDashboardRoute(mountRoute);
  let extra = {};
  if (routeInfo.view === 'detail' || routeInfo.view === 'session') {
    const booking = store.findBooking(routeInfo.id);
    extra.booking = booking;
    if (booking && routeInfo.view === 'detail') {
      extra.photos = await listBookingGalleryPhotos(booking);
    }
  }
  const banner = main.querySelector('.studio-banner');
  const bannerHtml = banner ? banner.outerHTML : '';
  main.innerHTML = bannerHtml + renderView(store, routeInfo, extra);
  bindEvents(routeInfo, extra.booking);
}

function bindEvents(routeInfo, booking) {
  const apptBase = appointmentBase(routeInfo);
  document.querySelectorAll('[data-period]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      period = btn.getAttribute('data-period') || 'week';
      paint();
    });
  });

  document.querySelectorAll('[data-approve]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-approve');
      const b = store.findBooking(id);
      if (!b) return;
      btn.disabled = true;
      approveBooking(mountCtx, b)
        .then(function () {
          return store.refresh();
        })
        .catch(function (err) {
          window.alert(err && err.message ? err.message : 'Could not approve booking.');
          btn.disabled = false;
        });
    });
  });

  document.querySelectorAll('[data-decline]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-decline');
      const b = store.findBooking(id);
      if (!b) return;
      if (!window.confirm('Decline this booking? The client will be notified and any refund policy applies.')) return;
      btn.disabled = true;
      declinePendingBooking(mountCtx, b)
        .then(function () {
          return store.refresh();
        })
        .catch(function (err) {
          window.alert(err && err.message ? err.message : 'Could not decline booking.');
          btn.disabled = false;
        });
    });
  });

  document.querySelectorAll('[data-start]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-start');
      const b = store.findBooking(id);
      if (!b) return;
      btn.disabled = true;
      startSession(b)
        .then(function () {
          window.location.href = apptBase + '/' + encodeURIComponent(b.id) + '/session';
        })
        .catch(function (err) {
          window.alert(err && err.message ? err.message : 'Could not start session.');
          btn.disabled = false;
        });
    });
  });

  document.querySelectorAll('[data-cancel]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-cancel');
      const b = store.findBooking(id);
      if (!b) return;
      if (!window.confirm('Cancel this appointment? Refunds follow your cancellation policy.')) return;
      btn.disabled = true;
      cancelBooking(mountCtx, b)
        .then(function () {
          return store.refresh();
        })
        .catch(function (err) {
          window.alert(err && err.message ? err.message : 'Could not cancel booking.');
          btn.disabled = false;
        });
    });
  });

  const saveNotes = document.getElementById('save-notes');
  if (saveNotes && booking) {
    saveNotes.addEventListener('click', function () {
      const ta = document.getElementById('stylist-notes');
      saveNotes.disabled = true;
      saveStylistNotes(booking, ta ? ta.value : '')
        .then(function () {
          saveNotes.textContent = 'Saved';
          setTimeout(function () {
            saveNotes.textContent = 'Save notes';
            saveNotes.disabled = false;
          }, 1200);
        })
        .catch(function (err) {
          window.alert(err && err.message ? err.message : 'Could not save notes.');
          saveNotes.disabled = false;
        });
    });
  }

  const completeBtn = document.getElementById('complete-session');
  if (completeBtn && booking) {
    completeBtn.addEventListener('click', function () {
      const tipEl = document.getElementById('session-tip');
      const cashEl = document.getElementById('session-cash');
      const notesEl = document.getElementById('session-notes');
      const tip = tipEl ? Number(tipEl.value) : 0;
      const cash = cashEl ? Number(cashEl.value) : 0;
      completeBtn.disabled = true;
      completeSession(booking, {
        tip_amount: tip,
        stylist_notes: notesEl ? notesEl.value : '',
        balance_collected_cents: cash > 0 ? Math.round(cash * 100) : undefined,
      })
        .then(function () {
          window.location.href = apptBase + '/' + encodeURIComponent(booking.id);
        })
        .catch(function (err) {
          window.alert(err && err.message ? err.message : 'Could not complete session.');
          completeBtn.disabled = false;
        });
    });
  }
}

export async function mountDashboard(ctx, route) {
  mountCtx = ctx;
  mountRoute = route || '/studio/dashboard';

  const main = document.getElementById('studio-main');
  if (!main) return;

  if (store) {
    store.dispose();
    store = null;
  }

  const banner = main.querySelector('.studio-banner');
  const bannerHtml = banner ? banner.outerHTML : '';
  main.innerHTML = bannerHtml + '<div class="dash"><div class="dash-loading">Loading bookings…</div></div>';

  store = await createBookingsStore(ctx, function () {
    paint();
  });

  await paint();
}

export function disposeDashboard() {
  if (store) {
    store.dispose();
    store = null;
  }
}

export function dashboardPageTitle(route) {
  const info = parseDashboardRoute(route);
  if (info.view === 'upcoming') return 'Upcoming';
  if (info.view === 'bookings') return 'Bookings';
  if (info.view === 'detail') return 'Appointment';
  if (info.view === 'session') return 'Session';
  if (info.fromCalendar) return 'Appointment';
  return 'Dashboard';
}

export function isAppointmentRoute(route) {
  return /^\/studio\/(?:dashboard|calendar)\/appointments\//.test(String(route || ''));
}

export function isDashboardRoute(route) {
  const r = String(route || '');
  if (isAppointmentRoute(r) && r.indexOf('/studio/calendar/') === 0) return false;
  return r === '/studio/dashboard' || r.startsWith('/studio/dashboard/');
}
