(function () {
  var PIN_KEY = 'styld_admin_pin';
  var SESSION_KEY = 'styld_admin_session';

  function getCfg() {
    return window.__STYLD_MARKETING__ || {};
  }

  function savePin(pin) {
    try {
      sessionStorage.setItem(PIN_KEY, pin);
      sessionStorage.setItem(SESSION_KEY, String(Date.now()));
    } catch (e) {}
  }

  function getPin() {
    try {
      return sessionStorage.getItem(PIN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function clearPin() {
    try {
      sessionStorage.removeItem(PIN_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  function api(action, filters, pin) {
    var cfg = getCfg();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      return Promise.reject(new Error('Supabase not configured.'));
    }
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/functions/v1/styld-admin-dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
      },
      body: JSON.stringify({ pin: pin, action: action, filters: filters || {} }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var msg = data.error || data.message || 'Request failed';
          if (data.code === 'UNAUTHORIZED_INVALID_JWT_FORMAT') {
            msg = 'Admin API auth misconfigured (invalid JWT). Redeploy function with verify_jwt=false.';
          }
          var err = new Error(msg);
          err.status = res.status;
          err.payload = data;
          throw err;
        }
        return data;
      });
    });
  }

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return esc(v);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function fmtApptParts(v) {
    if (!v) return { weekday: '—', date: '—', time: '' };
    var d = new Date(v);
    if (isNaN(d.getTime())) return { weekday: '—', date: String(v), time: '' };
    return {
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    };
  }

  function bookingStatusClass(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'confirmed' || s === 'completed') return 'admin-pill--good';
    if (s === 'cancelled') return 'admin-pill--bad';
    if (s === 'pending_payment' || s === 'pending') return 'admin-pill--warn';
    return 'admin-pill--neutral';
  }

  function bookingStatusLabel(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'pending_payment') return 'Pending pay';
    if (!s) return 'Unknown';
    return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function paymentStatusLabel(status) {
    var s = String(status || '').toLowerCase();
    if (!s || s === 'none') return '';
    return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  function paymentStatusClass(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'deposit_paid' || s === 'paid' || s === 'full_paid' || s === 'succeeded') return 'admin-pill--good';
    if (s === 'unpaid' || s === 'pending') return 'admin-pill--warn';
    return 'admin-pill--neutral';
  }

  function clientInitials(name) {
    name = String(name || 'Client').trim();
    var parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function fmtApptCalendar(v) {
    if (!v) return { month: '—', day: '—', weekday: '', time: '', year: '' };
    var d = new Date(v);
    if (isNaN(d.getTime())) return { month: '—', day: '—', weekday: '', time: String(v), year: '' };
    return {
      month: d.toLocaleDateString(undefined, { month: 'short' }),
      day: String(d.getDate()),
      weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
      time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      year: String(d.getFullYear()),
    };
  }

  function sortRecentBookings(bookings) {
    return (bookings || []).slice().sort(function (a, b) {
      var ta = new Date(a.appointment_starts_at || a.created_at || 0).getTime();
      var tb = new Date(b.appointment_starts_at || b.created_at || 0).getTime();
      return tb - ta;
    });
  }

  function clientKeyFromParts(email, phone) {
    return String(email || '')
      .trim()
      .toLowerCase() + '::' + String(phone || '').trim();
  }

  function clientKey(c) {
    return (c && (c.client_key || clientKeyFromParts(c.email, c.phone))) || '';
  }

  function clientOpenAttr(c) {
    var key = clientKey(c);
    return key ? ' data-open-client-key="' + esc(encodeURIComponent(key)) + '"' : '';
  }

  function decodeClientKey(encoded) {
    try {
      return decodeURIComponent(encoded || '');
    } catch (e) {
      return encoded || '';
    }
  }

  function buildSalonClientDetail(salonData, key) {
    if (!salonData || !key) return null;
    var clients = salonData.clients || [];
    var client = null;
    for (var i = 0; i < clients.length; i++) {
      if (clientKey(clients[i]) === key) {
        client = clients[i];
        break;
      }
    }
    if (!client) return null;

    var bookings = sortRecentBookings(
      (salonData.bookings || []).filter(function (b) {
        return clientKeyFromParts(b.email, b.phone) === key;
      }),
    );

    var bookingIds = {};
    bookings.forEach(function (b) {
      if (b.id) bookingIds[b.id] = true;
    });

    var clientName = String(client.client_name || '').trim().toLowerCase();
    var reviews = (salonData.reviews || []).filter(function (r) {
      var d = r.data || {};
      if (d.booking_id && bookingIds[d.booking_id]) return true;
      var reviewName = String(d.client_name || '').trim().toLowerCase();
      return reviewName && clientName && reviewName === clientName;
    });

    var serviceMap = {};
    bookings.forEach(function (b) {
      var style = b.style_name;
      if (style) serviceMap[style] = (serviceMap[style] || 0) + 1;
    });
    var services = Object.keys(serviceMap).sort(function (a, b) {
      return serviceMap[b] - serviceMap[a];
    });

    var avgSpend = client.booking_count ? client.total_spend / client.booking_count : 0;
    var collected = 0;
    var pending = 0;
    var completed = 0;
    var cancelled = 0;
    var firstAt = client.first_booking_at || null;
    var lastAt = client.last_booking_at || null;

    bookings.forEach(function (b) {
      var status = String(b.booking_status || '').toLowerCase();
      if (status === 'cancelled') {
        cancelled += 1;
        return;
      }
      if (status === 'completed') completed += 1;
      var gross = Number(b.estimated_total) || 0;
      var deposit = Number(b.deposit_amount) || 0;
      var payment = String(b.payment_status || '').toLowerCase();
      if (payment === 'paid') collected += gross;
      else if (payment === 'deposit_paid') collected += deposit;
      pending += Math.max(0, gross - (payment === 'paid' ? gross : payment === 'deposit_paid' ? deposit : 0));
      var appt = String(b.appointment_starts_at || b.created_at || '');
      if (appt) {
        if (!firstAt || appt < firstAt) firstAt = appt;
        if (!lastAt || appt > lastAt) lastAt = appt;
      }
    });

    return {
      client: client,
      bookings: bookings,
      reviews: reviews,
      services: services,
      serviceMap: serviceMap,
      avgSpend: avgSpend,
      salonName: salonData.brand_name || 'Salon',
      stats: {
        collected: collected,
        pending: pending,
        completed: completed,
        cancelled: cancelled,
        firstAt: firstAt,
        lastAt: lastAt,
      },
    };
  }

  function clientDetailHtml(detail) {
    if (!detail) return '<p class="admin-muted">Client not found.</p>';
    var c = detail.client;
    var name = c.client_name || 'Client';

    var serviceTags = detail.services.length
      ? '<div class="admin-client-tags">' +
        detail.services
          .map(function (s) {
            return (
              '<span class="admin-client-tag">' +
              esc(s) +
              ' <em>(' +
              esc(detail.serviceMap[s]) +
              ')</em></span>'
            );
          })
          .join('') +
        '</div>'
      : '<p class="admin-muted">No services booked yet.</p>';

    var reviewBlock = detail.reviews.length
      ? '<section class="admin-drawer-section"><h4>Reviews at this salon (' +
        detail.reviews.length +
        ')</h4><div class="admin-client-reviews">' +
        detail.reviews
          .map(function (r) {
            var d = r.data || {};
            return (
              '<article class="admin-client-review">' +
              '<div class="admin-client-review__head">' +
              '<strong>' +
              esc(d.rating) +
              '★</strong>' +
              '<span class="admin-muted">' +
              fmtDate(r.created_at) +
              '</span>' +
              (d.published ? '<span class="admin-pill admin-pill--good admin-pill--soft">Public</span>' : '<span class="admin-pill admin-pill--neutral admin-pill--soft">Hidden</span>') +
              '</div><p>' +
              esc(d.message || '') +
              '</p></article>'
            );
          })
          .join('') +
        '</div></section>'
      : '';

    var bookingBlock = detail.bookings.length
      ? '<section class="admin-drawer-section"><h4>Booking history (' +
        detail.bookings.length +
        ')</h4><ul class="admin-booking-list admin-booking-list--cards admin-booking-list--drawer">' +
        detail.bookings
          .slice(0, 10)
          .map(function (b) {
            return renderBookingCard(b, true);
          })
          .join('') +
        (detail.bookings.length > 10
          ? '<li class="admin-muted admin-client-more">+' +
            (detail.bookings.length - 10) +
            ' older bookings</li>'
          : '') +
        '</ul><p class="admin-muted admin-client-hint">Click a booking for full appointment details.</p></section>'
      : '<p class="admin-muted">No bookings on record.</p>';

    return (
      '<div class="admin-client-detail-head">' +
      '<div class="admin-client-detail-avatar">' +
      esc(clientInitials(name)) +
      '</div>' +
      '<div class="admin-client-detail-intro">' +
      '<strong>' +
      esc(name) +
      '</strong>' +
      '<span class="admin-muted">Client at ' +
      esc(detail.salonName) +
      '</span>' +
      '</div></div>' +
      '<section class="admin-drawer-section"><h4>Contact</h4><dl class="admin-dl">' +
      '<dt>Email</dt><dd>' +
      (c.email ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—') +
      '</dd>' +
      '<dt>Phone</dt><dd>' +
      (c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '—') +
      '</dd></dl></section>' +
      statCards([
        { label: 'Visits', value: c.booking_count || 0 },
        { label: 'Total spend', value: fmtMoney(c.total_spend) },
        { label: 'Collected', value: fmtMoney(detail.stats.collected) },
        { label: 'Avg ticket', value: fmtMoney(detail.avgSpend) },
        { label: 'Completed', value: detail.stats.completed },
        { label: 'Cancelled', value: detail.stats.cancelled },
      ]) +
      '<section class="admin-drawer-section"><h4>Relationship</h4><dl class="admin-dl">' +
      '<dt>First visit</dt><dd>' +
      fmtDate(detail.stats.firstAt) +
      '</dd>' +
      '<dt>Last visit</dt><dd>' +
      fmtDate(detail.stats.lastAt) +
      '</dd>' +
      '<dt>Favorite service</dt><dd>' +
      esc(c.favorite_service || '—') +
      '</dd>' +
      '<dt>Outstanding</dt><dd>' +
      fmtMoney(detail.stats.pending) +
      '</dd></dl></section>' +
      '<section class="admin-drawer-section"><h4>Services booked</h4>' +
      serviceTags +
      '</section>' +
      reviewBlock +
      bookingBlock
    );
  }

  function renderClientCard(c, options) {
    options = options || {};
    var name = c.client_name || 'Client';
    var openAttr = options.global
      ? ' data-open-global-client="' +
        esc(c.user_id) +
        '|' +
        esc(encodeURIComponent(clientKeyFromParts(c.email, c.phone))) +
        '"'
      : clientOpenAttr(c);
    return (
      '<li class="admin-client-card admin-booking-row--clickable"' +
      openAttr +
      ' role="button" tabindex="0">' +
      '<div class="admin-client-card__avatar" aria-hidden="true">' +
      esc(clientInitials(name)) +
      '</div>' +
      '<div class="admin-client-card__body">' +
      '<div class="admin-client-card__top">' +
      '<strong class="admin-client-card__name">' +
      esc(name) +
      '</strong>' +
      '<strong class="admin-client-card__spend">' +
      fmtMoney(c.total_spend) +
      '</strong>' +
      '</div>' +
      (options.showSalon ? salonMetaHtml(c) : '') +
      '<span class="admin-client-card__contact">' +
      (c.email ? esc(truncate(c.email, 34)) : 'No email') +
      (c.phone ? ' · ' + esc(c.phone) : '') +
      '</span>' +
      (c.favorite_service
        ? '<span class="admin-client-card__service">Usually books · ' + esc(truncate(c.favorite_service, 40)) + '</span>'
        : '') +
      '</div>' +
      '<div class="admin-client-card__aside">' +
      '<span class="admin-client-card__stat"><strong>' +
      esc(c.booking_count) +
      '</strong><span>visits</span></span>' +
      '<span class="admin-muted admin-client-card__last">Last ' +
      fmtDate(c.last_booking_at) +
      '</span>' +
      '<span class="admin-booking-card__chevron" aria-hidden="true">›</span>' +
      '</div></li>'
    );
  }

  function renderSalonClientsPanel(clients) {
    if (!clients.length) return '<p class="admin-muted">No clients yet.</p>';
    return (
      '<section class="admin-clients-panel">' +
      '<div class="admin-bookings-panel__head">' +
      '<div class="admin-bookings-panel__intro">' +
      '<h3>Clients</h3>' +
      '<p class="admin-muted">' +
      esc(clients.length) +
      ' unique clients · click any row for their history at this salon</p>' +
      '</div></div>' +
      '<ul class="admin-client-list">' +
      clients.map(renderClientCard).join('') +
      '</ul></section>'
    );
  }

  function openClientDrawer(encodedKey) {
    var key = decodeClientKey(encodedKey);
    if (!key || !state.salonData) {
      setStatus('Could not open client', true);
      return;
    }
    var detail = buildSalonClientDetail(state.salonData, key);
    if (!detail) {
      setStatus('Client not found', true);
      return;
    }
    openDrawer(detail.client.client_name || 'Client', clientDetailHtml(detail));
  }

  function openGlobalClient(userId, encodedKey) {
    var uid = String(userId || '').trim();
    if (!uid || !encodedKey) {
      setStatus('Could not open client', true);
      return;
    }
    var salonUid =
      state.salonData &&
      String((state.salonData.profile && state.salonData.profile.id) || state.salonData.user_id || '');
    if (state.salonData && salonUid === uid) {
      openClientDrawer(encodedKey);
      return;
    }
    setStatus('Loading client…');
    api('user_detail', { user_id: uid }, state.pin)
      .then(function (data) {
        setStatus('');
        if (data.error) throw new Error(data.error);
        state.salonData = data;
        openClientDrawer(encodedKey);
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  }

  function salonMetaHtml(item) {
    if (!item || (!item.brand_name && !item.subdomain)) return '';
    return (
      '<span class="admin-record-card__salon">' +
      esc(item.brand_name || 'Salon') +
      (item.subdomain ? ' · ' + esc(item.subdomain) : '') +
      '</span>'
    );
  }

  function renderMainListHead(title, subtitle, total, statsHtml) {
    return (
      '<div class="admin-bookings-panel__head admin-main-list__head">' +
      '<div class="admin-bookings-panel__intro">' +
      '<h3>' +
      esc(title) +
      '</h3>' +
      (subtitle ? '<p class="admin-muted">' + esc(subtitle) + '</p>' : '') +
      '</div>' +
      '<div class="admin-bookings-panel__meta">' +
      (total != null ? '<span class="admin-bookings-panel__total">' + esc(total) + ' total</span>' : '') +
      (statsHtml || '') +
      '</div></div>'
    );
  }

  function truncate(str, max) {
    str = String(str || '');
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
  }

  var NUM_FMT_KEY = 'styld_admin_num_format';
  var HIDE_MONEY_KEY = 'styld_admin_hide_money';
  var MONEY_MASK = '***';

  function readPref(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v == null || v === '' ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function writePref(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {}
  }

  function compactNumStr(n, maxDecimals) {
    maxDecimals = maxDecimals != null ? maxDecimals : 1;
    var abs = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    var units = [
      [1e12, 'T'],
      [1e9, 'B'],
      [1e6, 'M'],
      [1e3, 'K'],
    ];
    for (var i = 0; i < units.length; i++) {
      if (abs >= units[i][0]) {
        var v = abs / units[i][0];
        var s = v.toFixed(maxDecimals).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
        return sign + s + units[i][1];
      }
    }
    return null;
  }

  function fmtNum(n, decimals) {
    if (n == null || n === '') return '—';
    n = Number(n);
    if (isNaN(n)) return String(n);
    decimals = decimals != null ? decimals : 2;
    if (state.numberFormat === 'compact') {
      var compact = compactNumStr(n, decimals <= 0 ? 0 : 1);
      if (compact) return compact;
    }
    return n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function fmtCount(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    if (isNaN(n)) return String(v);
    return fmtNum(n, 0);
  }

  function fmtMoney(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    if (isNaN(n)) return String(v);
    if (state.hideMoney) return MONEY_MASK;
    return '$' + fmtNum(n, 2);
  }

  function formatStatValue(val) {
    if (val == null || val === '') return '—';
    if (typeof val === 'number') {
      return Number.isInteger(val) ? fmtCount(val) : fmtNum(val, 1);
    }
    if (typeof val === 'string') {
      if (val === '—' || val === MONEY_MASK) return val;
      if (/^\$/.test(val) || /[a-zA-Z]/.test(val)) {
        return state.hideMoney && /^\$/.test(val) ? MONEY_MASK : val;
      }
      var n = Number(val);
      if (!isNaN(n) && val.trim() !== '') {
        return val.indexOf('.') >= 0 ? fmtNum(n, 2) : fmtCount(n);
      }
    }
    return String(val);
  }

  function setNumberFormatUI(format) {
    state.numberFormat = format === 'compact' ? 'compact' : 'full';
    writePref(NUM_FMT_KEY, state.numberFormat);
    document.querySelectorAll('[data-num-format]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-num-format') === state.numberFormat);
    });
  }

  function setHideMoneyUI(active) {
    state.hideMoney = !!active;
    writePref(HIDE_MONEY_KEY, state.hideMoney ? '1' : '0');
    if (els.hideMoney) {
      els.hideMoney.setAttribute('aria-pressed', state.hideMoney ? 'true' : 'false');
      els.hideMoney.textContent = state.hideMoney ? 'Money hidden' : 'Hide money';
    }
  }

  function refreshCurrentView() {
    switch (state.tab) {
      case 'overview':
        if (state.overview) renderOverview(state.overview);
        break;
      case 'styld_revenue':
        if (state.styldRevenue) renderStyldRevenue(state.styldRevenue);
        break;
      case 'salons':
      case 'users':
        if (state.users && state.users.length) renderUsersTable(state.users);
        break;
      case 'bookings':
        if (state.bookings && state.bookings.length) renderBookingsTable(state.bookings);
        break;
      case 'clients':
        if (state.clients && state.clients.length) renderClientsTable(state.clients);
        break;
      case 'cancellations':
        if (state.cancellations) renderCancellations(state.cancellations);
        break;
      case 'inquiries':
        if (state.inquiries) renderInquiriesPanel(state.inquiries);
        break;
      case 'reviews':
        if (state.reviews) renderReviewsPanel(state.reviews);
        break;
      case 'emails':
        if (state.emails) renderEmailsMainPanel(state.emails);
        break;
      case 'onboarding':
        if (state.onboarding) renderOnboardingPanel(state.onboarding);
        break;
      case 'analytics':
        if (state.analytics) renderAnalytics(state.analytics);
        break;
    }
    if (state.salonData && els.salonTabPanel) {
      els.salonTabPanel.innerHTML = renderSalonTab(state.salonData, state.salonTab || 'analytics');
    }
  }

  function downloadCsv(filename, rows) {
    if (!rows || !rows.length) return;
    var keys = Object.keys(rows[0]);
    var lines = [keys.join(',')];
    rows.forEach(function (row) {
      lines.push(
        keys
          .map(function (k) {
            var val = row[k];
            if (val == null) return '';
            var s = typeof val === 'object' ? JSON.stringify(val) : String(val);
            if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
          })
          .join(','),
      );
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  var state = {
    pin: getPin(),
    tab: 'overview',
    users: [],
    bookings: [],
    clients: [],
    overview: null,
    search: '',
    salonTab: 'analytics',
    salonData: null,
    salonSort: 'revenue_desc',
    revenueRange: 'month',
    revenueMonth: '',
    revenueYear: '',
    styldRevenue: null,
    cancellations: null,
    inquiries: null,
    reviews: null,
    onboarding: null,
    analytics: null,
    emails: [],
    numberFormat: readPref(NUM_FMT_KEY, 'full'),
    hideMoney: readPref(HIDE_MONEY_KEY, '0') === '1',
  };

  var els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, isError) {
    if (!els.status) return;
    els.status.textContent = msg || '';
    els.status.classList.toggle('is-error', !!isError);
  }

  function renderOverview(data) {
    if (!els.overviewPanel || !data) return;
    state.overview = data;

    var p = data.payments || {};
    var s = data.stripe_connect || {};
    var topSalons = data.top_salons_by_collected || [];

    var hero =
      '<div class="admin-overview-hero">' +
      '<article class="admin-overview-hero__card admin-overview-hero__card--primary">' +
      '<span class="admin-overview-hero__label">Customer charges</span>' +
      '<strong class="admin-overview-hero__value">' +
      fmtMoney(p.customer_charges) +
      '</strong>' +
      '<p class="admin-overview-hero__hint">Total paid through Stripe checkout (deposits + service fees)</p>' +
      '</article>' +
      '<article class="admin-overview-hero__card">' +
      '<span class="admin-overview-hero__label">Stylist collected</span>' +
      '<strong class="admin-overview-hero__value">' +
      fmtMoney(p.collected) +
      '</strong>' +
      '<p class="admin-overview-hero__hint">Booking value collected for salons (before Connect payout)</p>' +
      '</article>' +
      '<article class="admin-overview-hero__card admin-overview-hero__card--accent">' +
      '<span class="admin-overview-hero__label">Styld platform cut</span>' +
      '<strong class="admin-overview-hero__value">' +
      fmtMoney(p.estimated_platform_fees) +
      '</strong>' +
      '<p class="admin-overview-hero__hint">Estimated 1% platform fee on collected amounts</p>' +
      '</article>' +
      '<article class="admin-overview-hero__card">' +
      '<span class="admin-overview-hero__label">Connect balances</span>' +
      '<strong class="admin-overview-hero__value">' +
      fmtMoney(s.balance_total) +
      '</strong>' +
      '<p class="admin-overview-hero__hint">' +
      fmtMoney(s.balance_available) +
      ' available · ' +
      fmtMoney(s.balance_pending) +
      ' pending across connected accounts</p>' +
      '</article></div>';

    var paymentsCard = infoCard(
      'Payment flow',
      statCards([
        { label: 'Gross booking value', value: fmtMoney(p.gross), hint: 'Total appointment value (non-cancelled)' },
        { label: 'Collected for salons', value: fmtMoney(p.collected) },
        { label: 'Still owed by clients', value: fmtMoney(p.pending) },
        { label: 'Estimated service fees', value: fmtMoney(p.estimated_service_fees), hint: 'Platform + pass-through processing' },
        { label: 'Est. processing pass-through', value: fmtMoney(p.estimated_processing_fees) },
        { label: 'Refunds issued', value: fmtMoney(p.refunds_total), hint: fmtCount(p.refunds_count || 0) + ' bookings' },
      ]) +
        '<p class="admin-overview-note">' +
        esc(data.fee_note || '') +
        '</p>',
      { tone: 'stripe', wide: true },
    );

    var stripeCard = infoCard(
      'Stripe Connect',
      '<div class="admin-money-grid">' +
        '<div class="admin-money-stat"><span>Available now</span><strong>' +
        fmtMoney(s.balance_available) +
        '</strong></div>' +
        '<div class="admin-money-stat"><span>Pending payout</span><strong>' +
        fmtMoney(s.balance_pending) +
        '</strong></div>' +
        '<div class="admin-money-stat"><span>Total in Connect</span><strong>' +
        fmtMoney(s.balance_total) +
        '</strong></div></div>' +
        infoRows([
          { label: 'Connected accounts', value: s.merchants_total || 0 },
          { label: 'Live (charges on)', value: s.merchants_live || 0 },
          { label: 'Payouts enabled', value: s.merchants_payouts_enabled || 0 },
          { label: 'Accounts with balance', value: s.accounts_with_balance || 0 },
        ]),
      { tone: 'stripe', wide: true, badge: statusBadge(!!s.merchants_live, fmtCount(s.merchants_live) + ' live', 'None live') },
    );

    var platformKpis =
      '<section class="admin-overview-section"><h3>Platform activity</h3>' +
      '<div class="admin-kpi-grid">' +
      [
        ['Stylists', data.total_stylists],
        ['Published sites', data.published_sites],
        ['Bookings', data.total_bookings],
        ['Global clients', data.unique_clients_global],
        ['Inquiries', data.total_inquiries],
        ['Reviews', data.total_reviews],
        ['Stripe live', data.stripe_merchants_live],
      ]
        .map(function (c) {
          return (
            '<article class="admin-kpi"><span class="admin-kpi__label">' +
            esc(c[0]) +
            '</span><strong class="admin-kpi__value">' +
            fmtCount(c[1]) +
            '</strong></article>'
          );
        })
        .join('') +
      '</div>' +
      (data.subscriptions_note
        ? '<p class="admin-overview-note admin-muted">' + esc(data.subscriptions_note) + '</p>'
        : '') +
      '</section>';

    var topSalonsHtml = topSalons.length
      ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Salon</th><th>Subdomain</th><th>Collected</th><th>Gross</th><th>Pending</th></tr></thead><tbody>' +
        topSalons
          .map(function (row) {
            return (
              '<tr class="admin-row-clickable" data-open-user="' +
              esc(row.user_id) +
              '" role="button" tabindex="0"><td><strong>' +
              esc(row.brand_name) +
              '</strong></td><td>' +
              esc(row.subdomain || '—') +
              '</td><td>' +
              fmtMoney(row.collected) +
              '</td><td>' +
              fmtMoney(row.gross) +
              '</td><td>' +
              fmtMoney(row.pending) +
              '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div>'
      : '<p class="admin-empty-note">No payment data yet.</p>';

    var charts =
      '<div class="admin-dash-grid">' +
      '<section class="admin-dash-card"><h4>Payment status</h4>' +
      barChartHtml(p.payment_status, 'status', 'count', 8, function (val, item) {
        return String(item.status || val).replace(/_/g, ' ');
      }) +
      '</section></div>';

    els.overviewPanel.innerHTML =
      hero +
      '<div class="admin-overview-grid">' +
      paymentsCard +
      stripeCard +
      '</div>' +
      platformKpis +
      '<section class="admin-overview-section"><div class="admin-bookings-panel__head"><div class="admin-bookings-panel__intro"><h3>Top salons by collected payments</h3><p class="admin-muted">Click a row to open the salon dashboard</p></div></div>' +
      topSalonsHtml +
      '</section>' +
      charts;
  }

  function currentMonthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function populateRevenueMonthSelect(months, selected) {
    if (!els.revenueMonth) return;
    months = months && months.length ? months : [currentMonthKey()];
    if (months.indexOf(selected) === -1) selected = months[months.length - 1];
    els.revenueMonth.innerHTML = months
      .slice()
      .reverse()
      .map(function (m) {
        var parts = m.split('-');
        var label =
          new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          }) || m;
        return (
          '<option value="' + esc(m) + '"' + (m === selected ? ' selected' : '') + '>' + esc(label) + '</option>'
        );
      })
      .join('');
    state.revenueMonth = selected;
  }

  function populateRevenueYearSelect(years, selected) {
    if (!els.revenueYear) return;
    var nowYear = String(new Date().getFullYear());
    if (!years || !years.length) years = [nowYear];
    if (years.indexOf(selected) === -1) selected = years[years.length - 1] || nowYear;
    els.revenueYear.innerHTML = years
      .slice()
      .reverse()
      .map(function (y) {
        return '<option value="' + esc(y) + '"' + (y === selected ? ' selected' : '') + '>' + esc(y) + '</option>';
      })
      .join('');
    state.revenueYear = selected;
  }

  function setRevenueRangeUI(range) {
    state.revenueRange = range;
    document.querySelectorAll('[data-revenue-range]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-revenue-range') === range);
    });
    if (els.revenueMonth) els.revenueMonth.hidden = range !== 'month';
    if (els.revenueYear) els.revenueYear.hidden = range !== 'year';
  }

  function loadStyldRevenue() {
    var filters = { range: state.revenueRange || 'month' };
    if (filters.range === 'month') {
      filters.month = (els.revenueMonth && els.revenueMonth.value) || state.revenueMonth || currentMonthKey();
    } else if (filters.range === 'year') {
      filters.year = (els.revenueYear && els.revenueYear.value) || state.revenueYear || String(new Date().getFullYear());
    }
    setStatus('Loading Styld revenue…');
    return api('styld_revenue', filters, state.pin)
      .then(function (data) {
        setStatus('');
        if (data.error) throw new Error(data.error);
        state.styldRevenue = data;
        populateRevenueMonthSelect(data.available_months, filters.month || currentMonthKey());
        populateRevenueYearSelect(data.available_years, filters.year || String(new Date().getFullYear()));
        setRevenueRangeUI(state.revenueRange);
        renderStyldRevenue(data);
      });
  }

  function renderStyldRevenue(data) {
    if (!els.styldRevenuePanel || !data) return;
    var period = data.period || {};
    var platform = data.platform || {};
    var subs = data.subscriptions || {};
    var rc = subs.revenuecat_overview || {};
    var timeline = data.platform_timeline_filtered || data.platform_timeline || [];
    var chartTimeline = (data.platform_timeline || []).map(function (row) {
      var parts = String(row.month || '').split('-');
      var monthLabel =
        parts.length >= 2
          ? new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString(undefined, {
              month: 'short',
              year: '2-digit',
            })
          : row.month;
      return Object.assign({}, row, { month_label: monthLabel });
    });

    var periodLabel =
      period.range === 'all'
        ? 'All time'
        : period.range === 'year'
          ? 'Year ' + (period.year || period.label)
          : new Date(String(period.month || period.label) + '-01').toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            });

    var hero =
      '<div class="admin-overview-hero admin-revenue-hero">' +
      '<article class="admin-overview-hero__card admin-overview-hero__card--accent">' +
      '<span class="admin-overview-hero__label">Platform cut (' +
      esc(periodLabel) +
      ')</span>' +
      '<strong class="admin-overview-hero__value">' +
      fmtMoney(platform.platform_fees) +
      '</strong>' +
      '<p class="admin-overview-hero__hint">Estimated 1% on ' +
      fmtMoney(platform.collected) +
      ' collected · ' +
      fmtCount(platform.paid_bookings || 0) +
      ' paid bookings</p></article>' +
      '<article class="admin-overview-hero__card">' +
      '<span class="admin-overview-hero__label">Active subscriptions</span>' +
      '<strong class="admin-overview-hero__value">' +
      fmtCount(subs.active || 0) +
      '</strong>' +
      '<p class="admin-overview-hero__hint">' +
      fmtCount(subs.active_monthly || 0) +
      ' monthly · ' +
      fmtCount(subs.active_yearly || 0) +
      ' yearly · ' +
      fmtCount(subs.free || 0) +
      ' free</p></article>' +
      '<article class="admin-overview-hero__card admin-overview-hero__card--primary">' +
      '<span class="admin-overview-hero__label">Est. subscription MRR</span>' +
      '<strong class="admin-overview-hero__value">' +
      fmtMoney(rc.mrr != null ? rc.mrr : subs.estimated_mrr) +
      '</strong>' +
      '<p class="admin-overview-hero__hint">' +
      (rc.mrr != null ? 'From RevenueCat overview' : 'Estimated from active Pro plans') +
      '</p></article>' +
      '<article class="admin-overview-hero__card">' +
      '<span class="admin-overview-hero__label">New subs in period</span>' +
      '<strong class="admin-overview-hero__value">' +
      fmtCount(subs.new_in_period || 0) +
      '</strong>' +
      '<p class="admin-overview-hero__hint">Salons who started Pro in this period</p></article></div>';

    var platformCard = infoCard(
      'Booking platform fees · ' + periodLabel,
      statCards([
        { label: 'Styld cut (1%)', value: fmtMoney(platform.platform_fees) },
        { label: 'Service fees (total)', value: fmtMoney(platform.service_fees) },
        { label: 'Customer charges', value: fmtMoney(platform.customer_charges) },
        { label: 'Salon collected', value: fmtMoney(platform.collected) },
      ]) +
        '<section class="admin-dash-card admin-dash-card--wide admin-revenue-chart-wrap"><h4>Platform cut by month</h4>' +
        barChartHtml(
          chartTimeline,
          'month_label',
          'platform_fees',
          24,
          function (val) {
            return fmtMoney(val);
          },
        ) +
        '</section>' +
        (data.pricing_note ? '<p class="admin-overview-note">' + esc(data.pricing_note) + '</p>' : ''),
      { tone: 'stripe', wide: true },
    );

    var subCard = infoCard(
      'Subscriptions (RevenueCat)',
      statCards([
        {
          label: 'MRR',
          value: fmtMoney(rc.mrr != null ? rc.mrr : subs.estimated_mrr),
          hint: rc.mrr != null ? 'RevenueCat' : 'Estimated',
        },
        { label: 'Active Pro', value: subs.active || 0 },
        { label: 'Pro Monthly', value: subs.active_monthly || 0 },
        { label: 'Pro Yearly', value: subs.active_yearly || 0 },
        { label: 'Free / none', value: subs.free || 0 },
        { label: 'Expired', value: subs.expired || 0 },
      ]) +
        (rc.active_subscriptions != null
          ? '<p class="admin-muted">RevenueCat active subs: ' + fmtCount(rc.active_subscriptions) + '</p>'
          : ''),
      { tone: 'subscription', wide: true },
    );

    var subscriberRows = (subs.subscribers || [])
      .map(function (s) {
        return (
          '<tr class="admin-row-clickable" data-open-user="' +
          esc(s.user_id) +
          '" role="button" tabindex="0"><td><strong>' +
          esc(s.brand_name || 'Salon') +
          '</strong><br><span class="admin-muted">' +
          esc(s.email || '') +
          '</span></td><td>' +
          subscriptionPill(s) +
          '</td><td>' +
          esc(s.product || '—') +
          '</td><td>' +
          fmtDate(s.purchase_date) +
          '</td><td>' +
          fmtDate(s.expires_date) +
          '</td><td>' +
          esc(s.store || '—') +
          '</td></tr>'
        );
      })
      .join('');

    var subscriberTable =
      '<section class="admin-overview-section"><h3>Active Pro subscribers</h3>' +
      (subscriberRows
        ? '<div class="admin-table-wrap"><table class="admin-table admin-table--clickable"><thead><tr><th>Salon</th><th>Plan</th><th>Product</th><th>Started</th><th>Renews</th><th>Store</th></tr></thead><tbody>' +
          subscriberRows +
          '</tbody></table></div>'
        : '<p class="admin-empty-note">No active Pro subscriptions right now.</p>') +
      '</section>';

    var monthTable =
      timeline.length && period.range !== 'all'
        ? '<section class="admin-overview-section"><h3>Months in ' +
          esc(periodLabel) +
          '</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Month</th><th>Platform cut</th><th>Service fees</th><th>Collected</th><th>Paid bookings</th></tr></thead><tbody>' +
          timeline
            .map(function (row) {
              return (
                '<tr><td>' +
                esc(row.month) +
                '</td><td>' +
                fmtMoney(row.platform_fees) +
                '</td><td>' +
                fmtMoney(row.service_fees) +
                '</td><td>' +
                fmtMoney(row.collected) +
                '</td><td>' +
                fmtCount(row.paid_bookings) +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div></section>'
        : '';

    els.styldRevenuePanel.innerHTML =
      hero +
      '<div class="admin-overview-grid">' +
      platformCard +
      subCard +
      '</div>' +
      monthTable +
      subscriberTable +
      (data.combined && data.combined.note
        ? '<p class="admin-overview-note">' + esc(data.combined.note) + '</p>'
        : '');
  }

  function renderKpis(data) {
    renderOverview(data);
  }

  function salonInitials(name) {
    return String(name || 'S')
      .split(/\s+/)
      .filter(Boolean)
      .map(function (w) {
        return w.charAt(0);
      })
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  function subscriptionPill(sub) {
    sub = sub || {};
    var label = sub.plan_label || sub.status || 'Unknown';
    if (sub.status === 'active') {
      return '<span class="admin-pill admin-pill--good">' + esc(label) + '</span>';
    }
    if (sub.status === 'none') {
      return '<span class="admin-pill admin-pill--neutral">Free</span>';
    }
    if (sub.status === 'expired') {
      return '<span class="admin-pill admin-pill--bad">Expired</span>';
    }
    if (sub.status === 'unknown') {
      return '<span class="admin-pill admin-pill--neutral" title="' + esc(sub.message || '') + '">Sub N/A</span>';
    }
    if (sub.status === 'error') {
      return '<span class="admin-pill admin-pill--bad">RC Error</span>';
    }
    return '<span class="admin-pill admin-pill--neutral">' + esc(label) + '</span>';
  }

  function bookingKey(b) {
    if (!b) return '';
    return String(b.id || b.row_id || '');
  }

  function bookingOpenAttr(b) {
    var key = bookingKey(b);
    return key ? ' data-open-booking="' + esc(key) + '"' : '';
  }

  function bookingDetailHtml(data) {
    var b = data.booking || data;
    var salon = data.salon || null;
    var when = fmtApptCalendar(b.appointment_starts_at || b.created_at);
    var client = b.full_name || 'Client';
    var service = b.style_name || 'Service';
    var statusMod = String(b.booking_status || '').toLowerCase() || 'unknown';
    var payLabel = paymentStatusLabel(b.payment_status);
    var deposit = Number(b.deposit_amount);
    var hasDeposit = !isNaN(deposit) && deposit > 0;
    var balance = hasDeposit ? Math.max(0, (Number(b.estimated_total) || 0) - deposit) : null;

    var photos = '';
    if (b.photo_hair_url || b.photo_ref_url) {
      photos =
        '<section class="admin-booking-detail__section"><h5 class="admin-booking-detail__section-title">Photos</h5><div class="admin-booking-detail__photos">';
      if (b.photo_hair_url) {
        photos +=
          '<figure class="admin-booking-detail__photo"><a href="' +
          esc(b.photo_hair_url) +
          '" target="_blank" rel="noopener"><img src="' +
          esc(b.photo_hair_url) +
          '" alt="Current hair photo"></a><figcaption>Current hair</figcaption></figure>';
      }
      if (b.photo_ref_url) {
        photos +=
          '<figure class="admin-booking-detail__photo"><a href="' +
          esc(b.photo_ref_url) +
          '" target="_blank" rel="noopener"><img src="' +
          esc(b.photo_ref_url) +
          '" alt="Reference photo"></a><figcaption>Reference</figcaption></figure>';
      }
      photos += '</div></section>';
    }

    var actions = '';
    if (b.email || b.phone) {
      actions =
        '<div class="admin-booking-detail__actions">' +
        (b.email
          ? '<a class="admin-action-btn" href="mailto:' +
            esc(b.email) +
            '"><span class="admin-action-btn__label">Email</span><span class="admin-action-btn__value">' +
            esc(truncate(b.email, 28)) +
            '</span></a>'
          : '') +
        (b.phone
          ? '<a class="admin-action-btn" href="tel:' +
            esc(b.phone) +
            '"><span class="admin-action-btn__label">Call</span><span class="admin-action-btn__value">' +
            esc(b.phone) +
            '</span></a>'
          : '') +
        '</div>';
    }

    var salonBlock = '';
    if (salon && salon.user_id) {
      salonBlock =
        '<section class="admin-booking-detail__salon">' +
        '<div class="admin-booking-detail__salon-main">' +
        '<span class="admin-booking-detail__salon-label">Salon</span>' +
        '<strong>' +
        esc(salon.brand_name || 'Salon') +
        '</strong>' +
        (salon.subdomain
          ? '<a class="admin-info-link" href="' +
            esc(salon.public_url) +
            '" target="_blank" rel="noopener">' +
            esc(salon.subdomain) +
            '.styldd.com</a>'
          : '') +
        '</div>' +
        '<button type="button" class="admin-btn admin-btn--ghost admin-btn--sm" data-open-user="' +
        esc(salon.user_id) +
        '">Open dashboard</button></section>';
    }

    return (
      '<div class="admin-booking-detail admin-booking-detail--' +
      esc(statusMod) +
      '">' +
      '<div class="admin-booking-detail__hero">' +
      '<div class="admin-booking-detail__calendar">' +
      '<span class="admin-booking-detail__month">' +
      esc(when.month) +
      '</span>' +
      '<strong class="admin-booking-detail__day">' +
      esc(when.day) +
      '</strong>' +
      '<span class="admin-booking-detail__time">' +
      esc(when.time) +
      '</span>' +
      '<span class="admin-booking-detail__weekday">' +
      esc(when.weekday) +
      '</span></div>' +
      '<div class="admin-booking-detail__hero-body">' +
      '<div class="admin-booking-detail__avatar">' +
      esc(clientInitials(client)) +
      '</div>' +
      '<div class="admin-booking-detail__hero-copy">' +
      '<strong class="admin-booking-detail__client">' +
      esc(client) +
      '</strong>' +
      '<span class="admin-booking-detail__service" title="' +
      esc(service) +
      '">' +
      esc(service) +
      '</span>' +
      '<div class="admin-booking-detail__pills">' +
      '<span class="admin-pill ' +
      bookingStatusClass(b.booking_status) +
      '">' +
      esc(bookingStatusLabel(b.booking_status)) +
      '</span>' +
      (payLabel
        ? '<span class="admin-pill ' +
          paymentStatusClass(b.payment_status) +
          ' admin-pill--soft">' +
          esc(payLabel) +
          '</span>'
        : '') +
      (b.source
        ? '<span class="admin-pill admin-pill--neutral admin-pill--soft">' + esc(b.source) + '</span>'
        : '') +
      '</div></div></div>' +
      '<div class="admin-booking-detail__hero-total">' +
      '<span>Total</span>' +
      '<strong>' +
      fmtMoney(b.estimated_total) +
      '</strong>' +
      (hasDeposit ? '<small>Dep ' + fmtMoney(deposit) + '</small>' : '') +
      (balance != null && balance > 0 ? '<small>Due ' + fmtMoney(balance) + '</small>' : '') +
      '</div></div>' +
      actions +
      salonBlock +
      '<div class="admin-booking-detail__grid">' +
      infoCard(
        'Appointment',
        infoRows([
          {
            label: 'Date',
            value: when.weekday + ', ' + when.month + ' ' + when.day + ', ' + when.year,
          },
          { label: 'Time', value: when.time },
          { label: 'Duration', value: b.duration_minutes ? b.duration_minutes + ' min' : null },
          { label: 'Location', value: b.service_address },
        ]),
        { tone: 'booking' },
      ) +
      infoCard(
        'Client',
        infoRows([
          { label: 'Name', value: b.full_name },
          b.email ? { label: 'Email', value: b.email, href: 'mailto:' + b.email } : { label: 'Email', value: null },
          b.phone ? { label: 'Phone', value: b.phone, href: 'tel:' + b.phone } : { label: 'Phone', value: null },
        ]),
        { tone: 'account' },
      ) +
      infoCard(
        'Service',
        infoRows([
          { label: 'Style', value: b.style_name },
          { label: 'Style ID', html: '<span class="admin-mono">' + esc(b.style_id || '—') + '</span>' },
        ]),
        { tone: 'contact' },
      ) +
      infoCard(
        'Payment',
        '<div class="admin-money-grid admin-money-grid--compact">' +
          '<div class="admin-money-stat"><span>Total</span><strong>' +
          fmtMoney(b.estimated_total) +
          '</strong></div>' +
          '<div class="admin-money-stat"><span>Deposit</span><strong>' +
          fmtMoney(b.deposit_amount) +
          '</strong></div>' +
          (balance != null && balance > 0
            ? '<div class="admin-money-stat"><span>Balance</span><strong>' + fmtMoney(balance) + '</strong></div>'
            : '') +
          '</div>' +
          infoRows([
            {
              label: 'Status',
              html:
                '<span class="admin-pill ' +
                paymentStatusClass(b.payment_status) +
                ' admin-pill--soft">' +
                esc(b.payment_status || '—') +
                '</span>',
            },
            b.stripe_payment_intent_id
              ? {
                  label: 'Stripe',
                  html: '<span class="admin-mono admin-mono--wrap">' + esc(b.stripe_payment_intent_id) + '</span>',
                }
              : null,
            b.refund_status
              ? {
                  label: 'Refund',
                  value:
                    b.refund_status +
                    (b.refund_amount_cents ? ' · ' + fmtMoney(Number(b.refund_amount_cents) / 100) : ''),
                }
              : null,
          ]),
        { tone: 'stripe' },
      ) +
      '</div>' +
      (b.notes
        ? '<section class="admin-booking-detail__section"><h5 class="admin-booking-detail__section-title">Client notes</h5><div class="admin-booking-detail__notes">' +
          esc(b.notes) +
          '</div></section>'
        : '') +
      photos +
      '<section class="admin-booking-detail__section admin-booking-detail__section--muted">' +
      '<h5 class="admin-booking-detail__section-title">Record</h5>' +
      infoRows([
        { label: 'Booking ID', html: '<span class="admin-mono admin-mono--wrap">' + esc(b.id || b.row_id || '—') + '</span>' },
        { label: 'Created', value: fmtDate(b.created_at) },
        b.updated_at ? { label: 'Updated', value: fmtDate(b.updated_at) } : null,
        b.google_calendar_id
          ? { label: 'Calendar', html: '<span class="admin-mono admin-mono--wrap">' + esc(b.google_calendar_id) + '</span>' }
          : null,
      ]) +
      '</section></div>'
    );
  }

  function subscriptionDetailHtml(sub) {
    sub = sub || {};
    if (sub.status === 'unknown') {
      return '<p class="admin-empty-note">' + esc(sub.message || 'RevenueCat not configured.') + '</p>';
    }
    return (
      '<div class="admin-subscription-head">' +
      subscriptionPill(sub) +
      (sub.will_renew
        ? '<span class="admin-pill admin-pill--good admin-pill--soft">Auto-renew on</span>'
        : sub.status === 'active'
          ? '<span class="admin-pill admin-pill--warn admin-pill--soft">No renewal</span>'
          : '') +
      '</div>' +
      infoRows([
        { label: 'Plan', value: sub.plan_label || sub.product },
        { label: 'Entitlement', value: sub.entitlement },
        { label: 'Store', value: sub.store },
        { label: 'Expires', value: sub.expires_date ? fmtDate(sub.expires_date) : null },
        { label: 'Purchased', value: sub.purchase_date ? fmtDate(sub.purchase_date) : null },
        sub.billing_issues ? { label: 'Billing', html: '<span class="admin-text-warn">Issue detected</span>' } : null,
        sub.unsubscribe_detected_at
          ? { label: 'Cancelled', value: fmtDate(sub.unsubscribe_detected_at) }
          : null,
      ])
    );
  }

  function statusBadge(on, onLabel, offLabel) {
    return (
      '<span class="admin-status-badge ' +
      (on ? 'admin-status-badge--on' : 'admin-status-badge--off') +
      '"><span class="admin-status-badge__dot" aria-hidden="true"></span>' +
      esc(on ? onLabel : offLabel) +
      '</span>'
    );
  }

  function infoCard(title, body, opts) {
    opts = opts || {};
    var cls = 'admin-info-card';
    if (opts.wide) cls += ' admin-info-card--wide';
    if (opts.tone) cls += ' admin-info-card--' + opts.tone;
    return (
      '<section class="' +
      cls +
      '">' +
      '<header class="admin-info-card__head"><h4>' +
      esc(title) +
      '</h4>' +
      (opts.badge || '') +
      '</header><div class="admin-info-card__body">' +
      body +
      '</div></section>'
    );
  }

  function infoRows(rows) {
    return (
      '<dl class="admin-info-rows">' +
      (rows || [])
        .filter(function (r) {
          return r;
        })
        .map(function (r) {
          var dd;
          if (r.html) dd = r.html;
          else if (r.href && r.value)
            dd =
              '<a class="admin-info-link" href="' +
              esc(r.href) +
              '"' +
              (r.external ? ' target="_blank" rel="noopener"' : '') +
              '>' +
              esc(r.value) +
              '</a>';
          else dd = esc(r.value != null && r.value !== '' ? r.value : '—');
          return '<div class="admin-info-row"><dt>' + esc(r.label) + '</dt><dd>' + dd + '</dd></div>';
        })
        .join('') +
      '</dl>'
    );
  }

  function formatLeadTime(minutes) {
    var m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0) return '—';
    if (m >= 1440 && m % 1440 === 0) return Math.round(m / 1440) + ' days';
    if (m >= 60) return Math.round(m / 60) + ' hours';
    return m + ' min';
  }

  function renderBookingPaymentSummary(payment) {
    payment = payment && typeof payment === 'object' ? payment : {};
    var mode = String(payment.mode || 'none');
    var modeLabel =
      mode === 'deposit' ? 'Deposit required' : mode === 'full' ? 'Full payment upfront' : 'No online payment';
    var depositKind = payment.depositKind || payment.deposit_kind || 'percent';
    var depositValue = payment.depositValue != null ? payment.depositValue : payment.deposit_value;
    var depositLine = '—';
    if (mode === 'deposit' && depositValue != null) {
      depositLine =
        depositKind === 'percent' ? String(depositValue) + '% of service' : fmtMoney(depositValue) + ' flat';
    } else if (mode === 'full') {
      depositLine = '100% at booking';
    }

    var requireHair = payment.requireCurrentHairPhoto;
    if (requireHair == null) requireHair = payment.require_current_hair_photo;
    if (requireHair == null) requireHair = true;
    var requireRef = payment.requireReferencePhoto;
    if (requireRef == null) requireRef = payment.require_reference_photo;

    return (
      '<div class="admin-config-grid">' +
      '<div class="admin-config-pill"><span>Payment</span><strong>' +
      esc(modeLabel) +
      '</strong></div>' +
      '<div class="admin-config-pill"><span>Deposit</span><strong>' +
      esc(depositLine) +
      '</strong></div>' +
      '<div class="admin-config-pill"><span>Hair photo</span><strong>' +
      (requireHair !== false ? 'Required' : 'Optional') +
      '</strong></div>' +
      '<div class="admin-config-pill"><span>Reference photo</span><strong>' +
      (requireRef ? 'Required' : 'Optional') +
      '</strong></div></div>'
    );
  }

  function renderBookingHoursSummary(hours) {
    hours = hours && typeof hours === 'object' ? hours : {};
    var closed = Array.isArray(hours.closedWeekdays) ? hours.closedWeekdays : [];
    var weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var closedLabel = closed.length
      ? closed
          .map(function (d) {
            return weekdayNames[Number(d)] || d;
          })
          .join(', ')
      : 'None';

    var startH = hours.slotDayStartHour != null ? hours.slotDayStartHour : 8;
    var startM = hours.slotDayStartMinute != null ? hours.slotDayStartMinute : 0;
    var endH = hours.slotDayEndHour != null ? hours.slotDayEndHour : 19;
    var endM = hours.slotDayEndMinute != null ? hours.slotDayEndMinute : 30;
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    var windowLabel = pad(startH) + ':' + pad(startM) + ' – ' + pad(endH) + ':' + pad(endM);

    return (
      '<div class="admin-config-grid">' +
      '<div class="admin-config-pill"><span>Hours window</span><strong>' +
      esc(windowLabel) +
      '</strong></div>' +
      '<div class="admin-config-pill"><span>Slot length</span><strong>' +
      esc(hours.slotStepMinutes != null ? hours.slotStepMinutes + ' min' : '30 min') +
      '</strong></div>' +
      '<div class="admin-config-pill"><span>Closed days</span><strong>' +
      esc(closedLabel) +
      '</strong></div>' +
      '<div class="admin-config-pill"><span>Lead time</span><strong>' +
      esc(formatLeadTime(hours.sameDayLeadMinutes)) +
      '</strong></div>' +
      '<div class="admin-config-pill"><span>Capacity</span><strong>' +
      esc(hours.concurrentAppointmentCapacity != null ? hours.concurrentAppointmentCapacity : 1) +
      ' at once</strong></div></div>'
    );
  }

  function renderCancellationSummary(policy) {
    policy = policy && typeof policy === 'object' ? policy : {};
    var summary = policy.policySummary || policy.policy_summary || '';
    var hours = policy.fullRefundNoticeHours != null ? policy.fullRefundNoticeHours : policy.full_refund_notice_hours;
    var applies = policy.refundAppliesTo || policy.refund_applies_to || '—';
    if (summary) {
      return '<p class="admin-policy-text">' + esc(summary) + '</p>';
    }
    return infoRows([
      { label: 'Refund window', value: hours ? formatLeadTime(Number(hours) * 60) + ' notice' : null },
      { label: 'Applies to', value: String(applies).replace(/_/g, ' ') },
    ]);
  }

  function renderInquiryCards(inquiries, options) {
    options = options || {};
    inquiries = inquiries || [];
    if (!inquiries.length) return '<p class="admin-empty-note">No inquiries yet.</p>';
    return (
      '<div class="admin-inquiry-list admin-record-list">' +
      inquiries
        .slice(0, options.limit || inquiries.length)
        .map(function (r) {
          var d = r.data || r;
          if (d && d.value && typeof d.value === 'object') d = d.value;
          var name = d.full_name || d.name || d.client_name || 'Inquiry';
          var message = d.message || d.notes || d.body || '';
          return (
            '<article class="admin-inquiry-card admin-record-card">' +
            '<div class="admin-inquiry-card__head">' +
            '<strong>' +
            esc(name) +
            '</strong>' +
            '<span class="admin-muted">' +
            fmtDate(r.created_at) +
            '</span></div>' +
            (options.showSalon ? salonMetaHtml(r) : '') +
            (d.email ? '<p class="admin-inquiry-card__meta">' + esc(d.email) + '</p>' : '') +
            '<p class="admin-inquiry-card__message">' +
            esc(truncate(message, 220) || '—') +
            '</p>' +
            (r.user_id
              ? '<div class="admin-record-card__foot"><button type="button" class="admin-link-btn" data-open-user="' +
                esc(r.user_id) +
                '">Open salon</button></div>'
              : '') +
            '</article>'
          );
        })
        .join('') +
      (inquiries.length > (options.limit || inquiries.length)
        ? '<p class="admin-muted admin-client-hint">+' + (inquiries.length - (options.limit || inquiries.length)) + ' more inquiries</p>'
        : '') +
      '</div>'
    );
  }

  function renderReviewCards(reviews, avgRating, totalCount, options) {
    options = options || {};
    reviews = reviews || [];
    if (!reviews.length) return '<p class="admin-empty-note">No reviews yet.</p>';
    return (
      '<div class="admin-review-list admin-record-list">' +
      reviews
        .slice(0, options.limit || reviews.length)
        .map(function (r) {
          var d = r.data || {};
          var rating = Number(d.rating) || 0;
          var stars = '★'.repeat(Math.min(5, Math.max(0, rating))) + '☆'.repeat(Math.max(0, 5 - rating));
          return (
            '<article class="admin-review-card admin-record-card">' +
            '<div class="admin-review-card__head">' +
            '<div class="admin-review-card__rating" aria-label="' +
            esc(rating) +
            ' out of 5">' +
            '<span class="admin-review-card__stars">' +
            stars +
            '</span>' +
            '<strong>' +
            esc(rating) +
            '</strong></div>' +
            '<span class="admin-muted">' +
            fmtDate(r.created_at) +
            '</span></div>' +
            (options.showSalon ? salonMetaHtml(r) : '') +
            '<strong class="admin-review-card__name">' +
            esc(d.client_name || 'Client') +
            '</strong>' +
            '<p class="admin-review-card__message">' +
            esc(d.message || '') +
            '</p>' +
            '<div class="admin-review-card__foot">' +
            (d.published
              ? '<span class="admin-pill admin-pill--good admin-pill--soft">Public</span>'
              : '<span class="admin-pill admin-pill--neutral admin-pill--soft">Hidden</span>') +
            (r.user_id
              ? '<button type="button" class="admin-link-btn" data-open-user="' + esc(r.user_id) + '">Open salon</button>'
              : '') +
            '</div></article>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  var EMAIL_TEMPLATE_LABELS = {
    'salon-booking': 'Salon: new booking',
    'customer-confirmation': 'Customer: booking received',
    'customer-reminder': 'Customer: reminder',
    'daily-digest': 'Owner: daily digest',
    'deposit-received': 'Customer: deposit received',
    'salon-cancelled': 'Salon: cancelled',
    'customer-cancelled': 'Customer: cancelled',
    'salon-rescheduled': 'Salon: rescheduled',
    'customer-rescheduled': 'Customer: rescheduled',
    'review-request': 'Customer: review request',
  };

  function emailTemplateLabel(key) {
    return EMAIL_TEMPLATE_LABELS[key] || String(key || 'Email').replace(/_/g, ' ').replace(/-/g, ' ');
  }

  function emailStatusClass(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'sent') return 'admin-pill--good';
    if (s === 'failed' || s === 'bounced') return 'admin-pill--bad';
    if (s === 'queued') return 'admin-pill--warn';
    return 'admin-pill--neutral';
  }

  function emailOpenAttr(email) {
    return email && email.id ? ' data-open-email="' + esc(email.id) + '"' : '';
  }

  function renderEmailCard(email, options) {
    options = options || {};
    var label = emailTemplateLabel(email.template_key);
    var subject = email.subject || email.preview_text || 'No subject';
    var recipient = email.recipient_name || email.recipient_email || 'Recipient';
    return (
      '<article class="admin-email-card admin-row-clickable"' +
      emailOpenAttr(email) +
      ' role="button" tabindex="0">' +
      '<div class="admin-email-card__head">' +
      '<span class="admin-pill admin-pill--soft admin-email-card__type">' +
      esc(label) +
      '</span>' +
      '<span class="admin-pill ' +
      emailStatusClass(email.status) +
      ' admin-pill--soft">' +
      esc(email.status || 'sent') +
      '</span></div>' +
      (options.showSalon && email.brand_name
        ? '<p class="admin-email-card__salon">' +
          esc(email.brand_name) +
          (email.subdomain ? ' · ' + esc(email.subdomain) : '') +
          '</p>'
        : '') +
      '<strong class="admin-email-card__subject">' +
      esc(truncate(subject, 72)) +
      '</strong>' +
      '<p class="admin-email-card__meta">' +
      esc(recipient) +
      (email.recipient_email && email.recipient_name ? ' · ' + esc(email.recipient_email) : '') +
      '</p>' +
      '<div class="admin-email-card__foot">' +
      '<span class="admin-muted">' +
      fmtDate(email.created_at) +
      '</span>' +
      (email.booking_id ? '<span class="admin-muted">Booking linked</span>' : '') +
      '<span class="admin-email-card__chevron" aria-hidden="true">›</span></div></article>'
    );
  }

  function renderEmailList(emails, options) {
    emails = emails || [];
    if (!emails.length) {
      return (
        '<p class="admin-empty-note">No sent emails logged yet. Emails show up here once your send functions write to <code>styld_sent_emails</code>.</p>'
      );
    }
    return (
      '<div class="admin-email-list">' +
      emails
        .map(function (e) {
          return renderEmailCard(e, options);
        })
        .join('') +
      '</div>'
    );
  }

  function renderEmailsPanel(emails, total, options) {
    options = options || {};
    total = total != null ? total : emails.length;
    return (
      '<section class="admin-emails-panel">' +
      '<div class="admin-bookings-panel__head">' +
      '<div class="admin-bookings-panel__intro">' +
      '<h3>Sent emails</h3>' +
      '<p class="admin-muted">' +
      esc(total) +
      ' logged · click any email to preview</p></div></div>' +
      renderEmailList(emails, options) +
      '</section>'
    );
  }

  function renderEmailsMainPanel(emails) {
    if (!els.emailsPanel) return;
    els.emailsPanel.innerHTML = renderEmailsPanel(emails, emails.length, { showSalon: true });
  }

  function emailDetailShell(email) {
    var meta = infoRows([
      { label: 'Template', value: emailTemplateLabel(email.template_key) },
      {
        label: 'To',
        value: email.recipient_email,
        href: email.recipient_email ? 'mailto:' + email.recipient_email : null,
      },
      { label: 'Subject', value: email.subject },
      { label: 'Sent', value: fmtDate(email.created_at) },
      {
        label: 'Status',
        html:
          '<span class="admin-pill ' +
          emailStatusClass(email.status) +
          '">' +
          esc(email.status || 'sent') +
          '</span>',
      },
      email.brand_name ? { label: 'Salon', value: email.brand_name } : { label: 'Salon', value: null },
      email.booking_id
        ? { label: 'Booking', value: truncate(String(email.booking_id), 24) }
        : { label: 'Booking', value: null },
    ]);
    var preview = email.html_body
      ? '<iframe class="admin-email-preview__frame" sandbox="" title="Email HTML preview"></iframe>'
      : email.text_body
        ? '<pre class="admin-email-preview__text">' + esc(email.text_body) + '</pre>'
        : '<p class="admin-muted">No body stored for this email.</p>';
    return (
      '<div class="admin-drawer-section admin-email-detail">' +
      meta +
      '<h4>Preview</h4>' +
      '<div class="admin-email-preview">' +
      preview +
      '</div></div>'
    );
  }

  function openEmailDrawer(emailId) {
    var id = String(emailId || '').trim();
    if (!id) {
      setStatus('Could not open email', true);
      return;
    }
    setStatus('Loading email…');
    api('email_detail', { email_id: id }, state.pin)
      .then(function (data) {
        setStatus('');
        if (data.error) throw new Error(data.error);
        var email = data.email || {};
        var title =
          emailTemplateLabel(email.template_key) +
          ' · ' +
          (email.recipient_email || email.recipient_name || 'Recipient');
        openDrawer(title, emailDetailShell(email));
        var frame = els.drawerBody && els.drawerBody.querySelector('.admin-email-preview__frame');
        if (frame && email.html_body) {
          frame.srcdoc = email.html_body;
        }
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  }

  function renderBusinessTab(data) {
    var p = data.profile || {};
    var stripe = data.stripe || {};
    var sub = data.subscription || {};
    var contact = data.contact || {};
    var onboarding = data.onboarding_responses;
    var survey = onboarding && onboarding.survey ? onboarding.survey : null;
    var biz = onboarding && onboarding.business ? onboarding.business : null;
    var ownerName = p.full_name || (biz && biz.name) || data.brand_name || 'Owner';
    var ig = contact.instagram ? String(contact.instagram) : '';
    var igHref = ig
      ? ig.startsWith('http')
        ? ig
        : 'https://instagram.com/' + ig.replace(/^@/, '')
      : null;
    var address = [contact.address, contact.city, contact.state].filter(Boolean).join(', ');

    var hero =
      '<div class="admin-biz-hero">' +
      '<div class="admin-biz-hero__main">' +
      '<div class="admin-biz-hero__avatar">' +
      esc(clientInitials(ownerName)) +
      '</div>' +
      '<div><h3>Business</h3><p class="admin-muted">' +
      esc(data.brand_name || 'Salon') +
      (data.tagline ? ' · ' + esc(truncate(data.tagline, 48)) : '') +
      '</p>' +
      (data.public_url
        ? '<a class="admin-info-link" href="' +
          esc(data.public_url) +
          '" target="_blank" rel="noopener">' +
          esc(data.subdomain ? data.subdomain + '.styldd.com' : data.public_url) +
          '</a>'
        : '<span class="admin-muted">Site not published</span>') +
      '</div></div>' +
      '<div class="admin-biz-hero__badges">' +
      subscriptionPill(sub) +
      statusBadge(!!stripe.charges_enabled, 'Stripe active', 'Stripe inactive') +
      statusBadge(!!data.published_at, 'Live site', 'Draft') +
      '</div></div>';

    var accountCard = infoCard(
      'Account',
      '<div class="admin-account-block">' +
        '<div class="admin-account-block__avatar">' +
        esc(clientInitials(ownerName)) +
        '</div><div>' +
        '<strong class="admin-account-block__name">' +
        esc(ownerName) +
        '</strong>' +
        '<span class="admin-muted">' +
        esc(p.email || '—') +
        '</span></div></div>' +
        infoRows([
          { label: 'Joined', value: fmtDate(p.created_at) },
          { label: 'Last sign-in', value: fmtDate(data.last_sign_in_at) },
          { label: 'Published', value: fmtDate(data.published_at) },
          { label: 'Email verified', value: data.email_confirmed_at ? fmtDate(data.email_confirmed_at) : '—' },
        ]),
      { tone: 'account' },
    );

    var contactCard = infoCard(
      'Contact & location',
      infoRows([
        contact.phone ? { label: 'Phone', value: contact.phone, href: 'tel:' + contact.phone } : { label: 'Phone', value: null },
        contact.email ? { label: 'Email', value: contact.email, href: 'mailto:' + contact.email } : { label: 'Email', value: null },
        ig ? { label: 'Instagram', value: ig.replace(/^@/, '@'), href: igHref, external: true } : { label: 'Instagram', value: null },
        { label: 'Address', value: address || null },
        { label: 'Timezone', value: contact.timezone },
      ]),
      { tone: 'contact' },
    );

    var stripeBalances =
      '<div class="admin-money-grid">' +
      '<div class="admin-money-stat"><span>Available</span><strong>' +
      (stripe.balance_available_cents != null ? fmtMoney(stripe.balance_available_cents / 100) : '—') +
      '</strong></div>' +
      '<div class="admin-money-stat"><span>Pending</span><strong>' +
      (stripe.balance_pending_cents != null ? fmtMoney(stripe.balance_pending_cents / 100) : '—') +
      '</strong></div></div>' +
      infoRows([
        { label: 'Charges', html: statusBadge(!!stripe.charges_enabled, 'Enabled', 'Disabled') },
        { label: 'Payouts', html: statusBadge(!!stripe.payouts_enabled, 'Enabled', 'Disabled') },
      ]);

    var stripeCard = infoCard('Stripe Connect', stripeBalances, {
      tone: 'stripe',
      badge: statusBadge(!!stripe.charges_enabled, 'Connected', 'Not connected'),
    });

    var subCard = infoCard('Subscription', subscriptionDetailHtml(sub), {
      tone: 'subscription',
      badge: subscriptionPill(sub),
    });

    var onboardingBody = '';
    if (survey) {
      onboardingBody +=
        '<div class="admin-quote-block"><span class="admin-quote-block__label">Heard from</span><p>' +
        esc(survey.heardFrom || '—') +
        '</p></div>';
      if (survey.whyStyld && survey.whyStyld.length) {
        onboardingBody +=
          '<div class="admin-tag-list">' +
          survey.whyStyld
            .map(function (item) {
              return '<span class="admin-client-tag">' + esc(item) + '</span>';
            })
            .join('') +
          '</div>';
      }
      if (survey.dreamOutcome) {
        onboardingBody +=
          '<div class="admin-quote-block"><span class="admin-quote-block__label">Dream outcome</span><p>' +
          esc(survey.dreamOutcome) +
          '</p></div>';
      }
    }
    if (biz) {
      onboardingBody += infoRows([
        { label: 'Business name', value: biz.name },
        { label: 'Business phone', value: biz.phone },
      ]);
    }
    if (!onboardingBody) onboardingBody = '<p class="admin-empty-note">No onboarding responses yet.</p>';

    var onboardingCard = infoCard('Onboarding', onboardingBody, { tone: 'onboarding' });

    var bookingCard = infoCard(
      'Booking settings',
      renderBookingPaymentSummary(data.booking_payment) +
        '<div class="admin-section-divider"></div>' +
        '<h5 class="admin-subsection-title">Availability</h5>' +
        renderBookingHoursSummary(data.booking_hours),
      { wide: true, tone: 'booking' },
    );

    var policyCard = infoCard(
      'Cancellation policy',
      renderCancellationSummary(data.cancellation_policy),
      { wide: true, tone: 'policy' },
    );

    var inquiryCard = infoCard(
      'Inquiries',
      renderInquiryCards(data.inquiries),
      { wide: true, tone: 'inquiries', badge: '<span class="admin-count-badge">' + (data.inquiries || []).length + '</span>' },
    );

    return (
      hero +
      '<div class="admin-info-grid">' +
      accountCard +
      contactCard +
      subCard +
      stripeCard +
      onboardingCard +
      bookingCard +
      policyCard +
      inquiryCard +
      '</div>'
    );
  }

  function salonSortName(u) {
    return String(u.brand_name || u.business_name || u.full_name || '').toLowerCase();
  }

  function salonStripeBalance(u) {
    var stripe = u.stripe || {};
    return (Number(stripe.balance_available_cents) || 0) + (Number(stripe.balance_pending_cents) || 0);
  }

  function sortSalons(users, sortKey) {
    var list = (users || []).slice();
    sortKey = sortKey || 'revenue_desc';

    function num(v) {
      var n = Number(v);
      return isNaN(n) ? 0 : n;
    }

    function dateMs(v) {
      if (!v) return 0;
      var t = new Date(v).getTime();
      return isNaN(t) ? 0 : t;
    }

    list.sort(function (a, b) {
      switch (sortKey) {
        case 'revenue_asc':
          return num(a.total_revenue) - num(b.total_revenue);
        case 'collected_desc':
          return num(b.revenue_collected) - num(a.revenue_collected);
        case 'collected_asc':
          return num(a.revenue_collected) - num(b.revenue_collected);
        case 'bookings_desc':
          return num(b.booking_count) - num(a.booking_count);
        case 'bookings_asc':
          return num(a.booking_count) - num(b.booking_count);
        case 'reviews_desc':
          return num(b.review_count) - num(a.review_count);
        case 'rating_desc': {
          var ar = a.reviews_avg_rating;
          var br = b.reviews_avg_rating;
          if (ar == null && br == null) return num(b.review_count) - num(a.review_count);
          if (ar == null) return 1;
          if (br == null) return -1;
          if (br !== ar) return br - ar;
          return num(b.review_count) - num(a.review_count);
        }
        case 'rating_asc': {
          var ar2 = a.reviews_avg_rating;
          var br2 = b.reviews_avg_rating;
          if (ar2 == null && br2 == null) return num(a.review_count) - num(b.review_count);
          if (ar2 == null) return 1;
          if (br2 == null) return -1;
          if (ar2 !== br2) return ar2 - br2;
          return num(a.review_count) - num(b.review_count);
        }
        case 'views_desc':
          return num(b.page_views_30d) - num(a.page_views_30d);
        case 'views_asc':
          return num(a.page_views_30d) - num(b.page_views_30d);
        case 'inquiries_desc':
          return num(b.inquiry_count) - num(a.inquiry_count);
        case 'stripe_desc':
          return salonStripeBalance(b) - salonStripeBalance(a);
        case 'newest':
          return dateMs(b.created_at) - dateMs(a.created_at);
        case 'oldest':
          return dateMs(a.created_at) - dateMs(b.created_at);
        case 'last_active':
          return dateMs(b.last_sign_in_at) - dateMs(a.last_sign_in_at);
        case 'name_asc':
          return salonSortName(a).localeCompare(salonSortName(b));
        case 'name_desc':
          return salonSortName(b).localeCompare(salonSortName(a));
        case 'revenue_desc':
        default:
          return num(b.total_revenue) - num(a.total_revenue);
      }
    });

    return list;
  }

  function salonRowHtml(u) {
    var name = u.brand_name || u.business_name || u.full_name || 'Salon';
    var img = u.image_url
      ? '<img class="admin-salon-row__img" src="' + esc(u.image_url) + '" alt="" loading="lazy" decoding="async">'
      : '<span class="admin-salon-row__fallback">' + esc(salonInitials(name)) + '</span>';
    return (
      '<button type="button" class="admin-salon-row" data-open-user="' +
      esc(u.user_id) +
      '">' +
      '<div class="admin-salon-row__media">' +
      img +
      '</div>' +
      '<div class="admin-salon-row__main">' +
      '<strong class="admin-salon-row__name">' +
      esc(name) +
      '</strong>' +
      '<span class="admin-salon-row__meta">' +
      esc(u.email || '') +
      (u.subdomain ? ' · ' + esc(u.subdomain) + '.styldd.com' : '') +
      '</span>' +
      '</div>' +
      '<div class="admin-salon-row__stat">' +
      '<span class="admin-salon-row__stat-label">Revenue</span>' +
      '<strong>' +
      fmtMoney(u.total_revenue) +
      '</strong>' +
      '</div>' +
      '<div class="admin-salon-row__stat">' +
      '<span class="admin-salon-row__stat-label">Bookings</span>' +
      '<strong>' +
      fmtCount(u.booking_count) +
      '</strong>' +
      '</div>' +
      '<div class="admin-salon-row__stat">' +
      '<span class="admin-salon-row__stat-label">Rating</span>' +
      '<strong>' +
      (u.reviews_avg_rating != null ? fmtNum(u.reviews_avg_rating, 1) + '★' : '—') +
      '</strong>' +
      '</div>' +
      '<div class="admin-salon-row__stat">' +
      '<span class="admin-salon-row__stat-label">Collected</span>' +
      '<strong>' +
      fmtMoney(u.revenue_collected) +
      '</strong>' +
      '</div>' +
      '<div class="admin-salon-row__sub">' +
      subscriptionPill(u.subscription) +
      '</div>' +
      '<span class="admin-salon-row__arrow" aria-hidden="true">→</span>' +
      '</button>'
    );
  }

  function renderSalonList(users, target) {
    if (!target) return;
    var list = users || [];
    if (!list.length) {
      target.innerHTML = '<p class="admin-muted">No salons found.</p>';
      return;
    }
    target.innerHTML = list.map(salonRowHtml).join('');
  }

  function renderUsersTable(users) {
    var sorted = sortSalons(users, state.salonSort);
    if (els.salonCount) {
      els.salonCount.textContent = fmtCount(sorted.length) + ' salon' + (sorted.length === 1 ? '' : 's');
    }
    renderSalonList(sorted, els.salonsGrid);
  }

  function renderBookingsTable(bookings) {
    if (!els.bookingsPanel) return;
    state.bookings = sortRecentBookings(bookings || []);
    var list = state.bookings;
    if (!list.length) {
      els.bookingsPanel.innerHTML = '<p class="admin-empty-note">No bookings found.</p>';
      return;
    }

    var stats = { confirmed: 0, pending: 0, cancelled: 0 };
    var totalValue = 0;
    list.forEach(function (b) {
      var s = String(b.booking_status || '').toLowerCase();
      if (s === 'cancelled') stats.cancelled += 1;
      else if (s === 'pending' || s === 'pending_payment') stats.pending += 1;
      else stats.confirmed += 1;
      totalValue += Number(b.estimated_total) || 0;
    });

    var statsHtml =
      '<div class="admin-bookings-panel__stats">' +
      (stats.confirmed
        ? '<span class="admin-bookings-stat admin-bookings-stat--good">' + esc(stats.confirmed) + ' active</span>'
        : '') +
      (stats.pending
        ? '<span class="admin-bookings-stat admin-bookings-stat--warn">' + esc(stats.pending) + ' pending</span>'
        : '') +
      (stats.cancelled
        ? '<span class="admin-bookings-stat admin-bookings-stat--bad">' + esc(stats.cancelled) + ' cancelled</span>'
        : '') +
      '</div>';

    els.bookingsPanel.innerHTML =
      '<section class="admin-main-panel admin-bookings-panel">' +
      renderMainListHead('Recent appointments', 'Sorted by appointment date', list.length, statsHtml) +
      statCards([
        { label: 'Listed', value: list.length },
        { label: 'Gross value', value: fmtMoney(totalValue) },
        { label: 'Active', value: stats.confirmed },
        { label: 'Pending', value: stats.pending },
      ]) +
      '<ul class="admin-booking-list admin-booking-list--cards">' +
      list
        .map(function (b) {
          return renderBookingCard(b, { compact: true, showSalon: true });
        })
        .join('') +
      '</ul></section>';
  }

  function renderClientsTable(clients) {
    if (!els.clientsPanel) return;
    clients = clients || [];
    if (!clients.length) {
      els.clientsPanel.innerHTML = '<p class="admin-empty-note">No clients found.</p>';
      return;
    }

    var totalSpend = 0;
    var totalVisits = 0;
    clients.forEach(function (c) {
      totalSpend += Number(c.total_spend) || 0;
      totalVisits += Number(c.booking_count) || 0;
    });

    els.clientsPanel.innerHTML =
      '<section class="admin-main-panel">' +
      renderMainListHead('All clients', 'Grouped by salon and contact info', clients.length, '') +
      statCards([
        { label: 'Unique clients', value: clients.length },
        { label: 'Total visits', value: totalVisits },
        { label: 'Combined spend', value: fmtMoney(totalSpend) },
      ]) +
      '<ul class="admin-client-list admin-record-list">' +
      clients
        .map(function (c) {
          return renderClientCard(c, { global: true, showSalon: true });
        })
        .join('') +
      '</ul></section>';
  }

  function renderCancellationCard(r) {
    var refund =
      r.refund_amount_cents != null ? fmtMoney(Number(r.refund_amount_cents) / 100) : '—';
    var refundClass =
      String(r.refund_status || '').toLowerCase() === 'succeeded' || String(r.refund_status || '').toLowerCase() === 'completed'
        ? 'admin-pill--good'
        : String(r.refund_status || '').toLowerCase() === 'failed'
          ? 'admin-pill--bad'
          : 'admin-pill--warn';
    return (
      '<article class="admin-record-card admin-record-card--cancel">' +
      '<div class="admin-record-card__head">' +
      '<div><strong>' +
      (r.booking_id
        ? '<button type="button" class="admin-link-btn"' +
          bookingOpenAttr({ id: r.booking_id }) +
          '>Booking ' +
          esc(String(r.booking_id).slice(0, 8)) +
          '</button>'
        : 'Booking') +
      '</strong>' +
      salonMetaHtml(r) +
      '</div>' +
      '<span class="admin-muted">' +
      fmtDate(r.created_at) +
      '</span></div>' +
      '<div class="admin-record-card__meta">' +
      '<span>Cancelled by <strong>' +
      esc(r.cancelled_by || '—') +
      '</strong></span>' +
      '</div>' +
      '<div class="admin-record-card__foot">' +
      '<span class="admin-pill ' +
      refundClass +
      ' admin-pill--soft">' +
      esc(r.refund_status || 'unknown') +
      '</span>' +
      '<strong>' +
      refund +
      '</strong></div></article>'
    );
  }

  function renderOnboardingCard(r) {
    var d = r.value || r.data || {};
    var survey = d.survey || {};
    var biz = d.business || {};
    var name = d.fullName || biz.name || survey.fullName || 'New signup';
    var heard = survey.heardFrom || '—';
    var email = d.accountEmail || biz.email || '';
    return (
      '<article class="admin-record-card admin-record-card--onboarding">' +
      '<div class="admin-record-card__head">' +
      '<strong>' +
      esc(name) +
      '</strong>' +
      '<span class="admin-muted">' +
      fmtDate(r.created_at) +
      '</span></div>' +
      salonMetaHtml(r) +
      (email ? '<p class="admin-record-card__meta">' + esc(email) + '</p>' : '') +
      '<p class="admin-record-card__message">Heard from: ' +
      esc(heard) +
      '</p>' +
      (survey.dreamOutcome
        ? '<p class="admin-record-card__message">' + esc(truncate(survey.dreamOutcome, 160)) + '</p>'
        : '') +
      '<div class="admin-record-card__foot">' +
      (r.user_id
        ? '<button type="button" class="admin-link-btn" data-open-user="' + esc(r.user_id) + '">Open salon</button>'
        : '') +
      '</div></article>'
    );
  }

  function renderCancellations(rows) {
    if (!els.cancellationsPanel) return;
    rows = rows || [];
    if (!rows.length) {
      els.cancellationsPanel.innerHTML = '<p class="admin-empty-note">No cancellations recorded.</p>';
      return;
    }

    var refundTotal = 0;
    rows.forEach(function (r) {
      refundTotal += Number(r.refund_amount_cents) || 0;
    });

    els.cancellationsPanel.innerHTML =
      '<section class="admin-main-panel">' +
      renderMainListHead('Cancellation events', 'Refunds and who initiated the cancel', rows.length, '') +
      statCards([
        { label: 'Events', value: rows.length },
        { label: 'Refunded total', value: fmtMoney(refundTotal / 100) },
      ]) +
      '<div class="admin-record-list">' +
      rows.map(renderCancellationCard).join('') +
      '</div></section>';
  }

  function renderInquiriesPanel(inquiries) {
    if (!els.inquiriesPanel) return;
    inquiries = inquiries || [];
    els.inquiriesPanel.innerHTML =
      '<section class="admin-main-panel">' +
      renderMainListHead('Inquiries', 'Messages from salon contact forms', inquiries.length, '') +
      renderInquiryCards(inquiries, { showSalon: true }) +
      '</section>';
  }

  function renderReviewsPanel(reviews) {
    if (!els.reviewsPanel) return;
    reviews = reviews || [];
    var avg = 0;
    if (reviews.length) {
      var sum = 0;
      reviews.forEach(function (r) {
        sum += Number((r.data || {}).rating) || 0;
      });
      avg = Math.round((sum / reviews.length) * 10) / 10;
    }
    els.reviewsPanel.innerHTML =
      '<section class="admin-main-panel">' +
      renderMainListHead('Reviews', 'Ratings left by clients after appointments', reviews.length, '') +
      statCards([
        { label: 'Total reviews', value: reviews.length },
        { label: 'Average rating', value: reviews.length ? avg + '★' : '—' },
      ]) +
      renderReviewCards(reviews, avg, reviews.length, { showSalon: true }) +
      '</section>';
  }

  function renderOnboardingPanel(responses) {
    if (!els.onboardingPanel) return;
    responses = responses || [];
    if (!responses.length) {
      els.onboardingPanel.innerHTML = '<p class="admin-empty-note">No onboarding responses yet.</p>';
      return;
    }
    els.onboardingPanel.innerHTML =
      '<section class="admin-main-panel">' +
      renderMainListHead('Onboarding survey', 'Answers from new salon sign-ups', responses.length, '') +
      '<div class="admin-record-list">' +
      responses.map(renderOnboardingCard).join('') +
      '</div></section>';
  }

  function renderAnalytics(data) {
    if (!els.analyticsPanel || !data) return;
    state.analytics = data;
    var subRows = (data.by_subdomain || []).slice(0, 15);
    var pathRows = (data.top_paths || []).slice(0, 15);
    els.analyticsPanel.innerHTML =
      '<section class="admin-main-panel">' +
      statCards([
        { label: 'Total events', value: data.total_events || 0 },
        { label: 'Subdomains tracked', value: (data.by_subdomain || []).length },
        { label: 'Unique paths', value: (data.top_paths || []).length },
        { label: 'Data source', value: data.source || 'none' },
      ]) +
      '<div class="admin-dash-grid admin-analytics-grid">' +
      '<section class="admin-dash-card admin-dash-card--wide"><h4>Views by subdomain</h4>' +
      (subRows.length
        ? barChartHtml(subRows, 'subdomain', 'views', 15)
        : '<p class="admin-muted">No subdomain data yet.</p>') +
      '</section>' +
      '<section class="admin-dash-card admin-dash-card--wide"><h4>Top paths</h4>' +
      (pathRows.length
        ? barChartHtml(pathRows, 'path', 'views', 15)
        : '<p class="admin-muted">No path data yet.</p>') +
      '</section></div></section>';
  }

  function openDrawer(title, html) {
    if (!els.drawer || !els.drawerBody || !els.drawerTitle) return;
    els.drawerTitle.textContent = title;
    els.drawerBody.innerHTML = html;
    els.drawer.hidden = false;
    document.body.classList.add('admin-drawer-open');
  }

  function closeDrawer() {
    if (!els.drawer) return;
    els.drawer.hidden = true;
    document.body.classList.remove('admin-drawer-open');
  }

  function barChartHtml(items, labelKey, valueKey, maxItems, formatVal) {
    items = items || [];
    if (!items.length) return '<p class="admin-muted">No data yet.</p>';
    var max = 1;
    items.forEach(function (item) {
      var v = Number(item[valueKey]) || 0;
      if (v > max) max = v;
    });
    return (
      '<div class="admin-chart-bars">' +
      items
        .slice(0, maxItems || 12)
        .map(function (item) {
          var val = Number(item[valueKey]) || 0;
          var pct = Math.max(4, Math.round((val / max) * 100));
          var label = item[labelKey];
          var display = formatVal ? formatVal(val, item) : fmtCount(val);
          return (
            '<div class="admin-chart-row">' +
            '<span class="admin-chart-label">' +
            esc(label) +
            '</span>' +
            '<div class="admin-chart-track"><div class="admin-chart-fill" style="width:' +
            pct +
            '%"></div></div>' +
            '<span class="admin-chart-val">' +
            esc(display) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function sparklineHtml(daily) {
    daily = daily || [];
    if (!daily.length) return '<p class="admin-muted">No page views in the last 30 days.</p>';
    var max = 1;
    daily.forEach(function (d) {
      if (d.views > max) max = d.views;
    });
    return (
      '<div class="admin-sparkline">' +
      daily
        .map(function (d) {
          var h = Math.max(4, Math.round(((d.views || 0) / max) * 100));
          return (
            '<div class="admin-sparkline__col" title="' +
            esc(d.day + ': ' + d.views + ' views') +
            '"><div class="admin-sparkline__bar" style="height:' +
            h +
            '%"></div><span class="admin-sparkline__day">' +
            esc(d.day.slice(5)) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function statCards(items) {
    return (
      '<div class="admin-stat-grid">' +
      items
        .map(function (item) {
          return (
            '<article class="admin-stat-card">' +
            '<span class="admin-stat-card__label">' +
            esc(item.label) +
            '</span>' +
            '<strong class="admin-stat-card__value">' +
            formatStatValue(item.value) +
            '</strong>' +
            (item.hint ? '<small class="admin-stat-card__hint">' + esc(item.hint) + '</small>' : '') +
            '</article>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderSalonAnalyticsCharts(data) {
    var a = (data && data.analytics) || {};
    return (
      statCards([
        { label: 'Views (7d)', value: a.views_7d || 0 },
        { label: 'Views (30d)', value: a.views_30d || 0 },
        { label: 'Views (90d)', value: a.views_90d || 0 },
        { label: 'Data source', value: a.source || 'none' },
      ]) +
      '<div class="admin-dash-grid">' +
      '<section class="admin-dash-card admin-dash-card--wide"><h4>Daily page views</h4>' +
      sparklineHtml(a.daily_views) +
      '</section>' +
      '<section class="admin-dash-card"><h4>Top pages</h4>' +
      barChartHtml(a.top_paths, 'path', 'views', 10) +
      '</section>' +
      '<section class="admin-dash-card"><h4>Page type</h4>' +
      barChartHtml(a.by_page_type, 'page_type', 'views', 6) +
      '</section>' +
      '<section class="admin-dash-card"><h4>Device type</h4>' +
      barChartHtml(a.by_device, 'device_type', 'views', 6) +
      '</section>' +
      '<section class="admin-dash-card"><h4>Booking status</h4>' +
      barChartHtml(a.booking_status, 'status', 'count', 8) +
      '</section>' +
      '<section class="admin-dash-card"><h4>Payment status</h4>' +
      barChartHtml(a.payment_status, 'status', 'count', 8) +
      '</section></div>'
    );
  }

  function renderSalonSummary(data) {
    var rev = data.revenue_summary || {};
    var a = data.analytics || {};
    var sub = data.subscription || {};
    var name = data.brand_name || 'Salon';
    var img = data.image_url
      ? '<img class="admin-salon-hero__img" src="' + esc(data.image_url) + '" alt="">'
      : '<span class="admin-salon-hero__fallback">' + esc(salonInitials(name)) + '</span>';

    return (
      '<div class="admin-salon-hero admin-salon-hero--dash">' +
      '<div class="admin-salon-hero__media">' +
      img +
      '</div><div class="admin-salon-hero__copy"><h3>' +
      esc(name) +
      '</h3><p class="admin-muted">' +
      esc((data.profile && data.profile.email) || '') +
      '</p>' +
      (data.public_url
        ? '<a class="admin-salon-link" href="' +
          esc(data.public_url) +
          '" target="_blank" rel="noopener">' +
          esc(data.public_url) +
          '</a>'
        : '') +
      '<div class="admin-salon-hero__sub">' +
      subscriptionPill(sub) +
      '</div></div></div>' +
      statCards([
        { label: 'Total revenue', value: fmtMoney(rev.gross) },
        { label: 'Collected', value: fmtMoney(rev.collected) },
        { label: 'Bookings', value: rev.booking_count || 0 },
        { label: 'Clients', value: rev.unique_clients || 0 },
        { label: 'Views (30d)', value: a.views_30d || 0 },
        { label: 'Subscription', value: sub.plan_label || sub.status || '—', hint: sub.expires_date ? 'Renews ' + fmtDate(sub.expires_date) : '' },
      ]) +
      '<section class="admin-dash-card admin-dash-card--wide admin-salon-summary-bookings"><h4>Recent bookings</h4>' +
      renderSalonBookingsPanel(sortRecentBookings(data.bookings || []).slice(0, 6), (data.bookings || []).length, {
        compact: true,
        hideHead: true,
      }) +
      '</section>'
    );
  }

  function renderSalonTab(data, tab) {
    if (!data) return '<p class="admin-empty-note">No salon data loaded.</p>';

    if (tab === 'analytics') {
      return (
        '<div class="admin-salon-section" data-salon-section="analytics">' +
        renderSalonSummary(data) +
        renderSalonAnalyticsCharts(data) +
        '</div>'
      );
    }

    if (tab === 'bookings') {
      var allBookings = data.bookings || [];
      var recentBookings = sortRecentBookings(allBookings).slice(0, 15);
      return (
        '<div class="admin-salon-section" data-salon-section="bookings">' +
        renderSalonBookingsPanel(recentBookings, allBookings.length, { limit: 15 }) +
        '</div>'
      );
    }

    if (tab === 'clients') {
      return (
        '<div class="admin-salon-section" data-salon-section="clients">' +
        renderSalonClientsPanel(data.clients || []) +
        '</div>'
      );
    }

    if (tab === 'reviews') {
      var a = data.analytics || {};
      return (
        '<div class="admin-salon-section" data-salon-section="reviews">' +
        '<section class="admin-reviews-panel">' +
        '<div class="admin-bookings-panel__head">' +
        '<div class="admin-bookings-panel__intro">' +
        '<h3>Reviews</h3>' +
        '<p class="admin-muted">' +
        fmtCount(a.reviews_count || 0) +
        ' total · average ' +
        (a.reviews_avg_rating ? fmtNum(a.reviews_avg_rating, 1) + '★' : '—') +
        '</p></div></div>' +
        statCards([
          { label: 'Total reviews', value: a.reviews_count || 0 },
          { label: 'Average rating', value: a.reviews_avg_rating ? fmtNum(a.reviews_avg_rating, 1) + '★' : '—' },
        ]) +
        renderReviewCards(data.reviews || [], a.reviews_avg_rating, a.reviews_count) +
        '</section></div>'
      );
    }

    if (tab === 'emails') {
      return (
        '<div class="admin-salon-section" data-salon-section="emails">' +
        renderEmailsPanel(data.emails || [], (data.emails || []).length, { showSalon: false }) +
        '</div>'
      );
    }

    if (tab === 'business') {
      return '<div class="admin-salon-section" data-salon-section="business">' + renderBusinessTab(data) + '</div>';
    }

    return '<p class="admin-empty-note">Unknown section.</p>';
  }

  function renderBookingCard(b, compactOrOptions) {
    var options =
      typeof compactOrOptions === 'object' && compactOrOptions !== null
        ? compactOrOptions
        : { compact: !!compactOrOptions };
    var compact = !!options.compact;
    var when = fmtApptCalendar(b.appointment_starts_at || b.created_at);
    var service = b.style_name || 'Service';
    var payLabel = paymentStatusLabel(b.payment_status);
    var client = b.full_name || 'Client';
    var statusMod = String(b.booking_status || '').toLowerCase();
    var deposit = Number(b.deposit_amount);
    var hasDeposit = !isNaN(deposit) && deposit > 0;

    return (
      '<li class="admin-booking-card admin-booking-card--' +
      esc(statusMod || 'unknown') +
      (compact ? ' admin-booking-card--compact' : '') +
      ' admin-booking-row--clickable"' +
      bookingOpenAttr(b) +
      ' role="button" tabindex="0">' +
      '<div class="admin-booking-card__date" aria-hidden="true">' +
      '<span class="admin-booking-card__month">' +
      esc(when.month) +
      '</span>' +
      '<strong class="admin-booking-card__day">' +
      esc(when.day) +
      '</strong>' +
      '<span class="admin-booking-card__time">' +
      esc(when.time) +
      '</span>' +
      '</div>' +
      '<div class="admin-booking-card__avatar" aria-hidden="true">' +
      esc(clientInitials(client)) +
      '</div>' +
      '<div class="admin-booking-card__body">' +
      '<div class="admin-booking-card__top">' +
      '<strong class="admin-booking-card__client">' +
      esc(client) +
      '</strong>' +
      '<strong class="admin-booking-card__total">' +
      fmtMoney(b.estimated_total) +
      '</strong>' +
      '</div>' +
      '<span class="admin-booking-card__service" title="' +
      esc(service) +
      '">' +
      esc(truncate(service, compact ? 36 : 52)) +
      '</span>' +
      (options.showSalon ? salonMetaHtml(b) : '') +
      '<span class="admin-booking-card__meta">' +
      (b.email ? esc(truncate(b.email, 32)) : 'No email') +
      (hasDeposit ? ' · Dep ' + fmtMoney(deposit) : '') +
      '</span>' +
      '</div>' +
      '<div class="admin-booking-card__aside">' +
      '<span class="admin-pill ' +
      bookingStatusClass(b.booking_status) +
      '">' +
      esc(bookingStatusLabel(b.booking_status)) +
      '</span>' +
      (payLabel
        ? '<span class="admin-pill ' +
          paymentStatusClass(b.payment_status) +
          ' admin-pill--soft">' +
          esc(payLabel) +
          '</span>'
        : '') +
      '<span class="admin-booking-card__chevron" aria-hidden="true">›</span>' +
      '</div>' +
      '</li>'
    );
  }

  function renderSalonBookingsPanel(bookings, totalCount, options) {
    options = options || {};
    var limit = options.limit || bookings.length;
    if (!bookings.length) return '<p class="admin-muted">No bookings yet.</p>';

    var stats = { confirmed: 0, pending: 0, cancelled: 0 };
    bookings.forEach(function (b) {
      var s = String(b.booking_status || '').toLowerCase();
      if (s === 'cancelled') stats.cancelled += 1;
      else if (s === 'pending' || s === 'pending_payment') stats.pending += 1;
      else stats.confirmed += 1;
    });

    var head =
      options.hideHead
        ? ''
        : '<div class="admin-bookings-panel__head">' +
          '<div class="admin-bookings-panel__intro">' +
          '<h3>Recent bookings</h3>' +
          '<p class="admin-muted">Latest ' +
          esc(Math.min(limit, bookings.length)) +
          ' appointments · click any row for full details</p>' +
          '</div>' +
          '<div class="admin-bookings-panel__meta">' +
          (totalCount > bookings.length
            ? '<span class="admin-bookings-panel__total">' +
              esc(totalCount) +
              ' total</span>'
            : '') +
          '<div class="admin-bookings-panel__stats">' +
          (stats.confirmed
            ? '<span class="admin-bookings-stat admin-bookings-stat--good">' + esc(stats.confirmed) + ' active</span>'
            : '') +
          (stats.pending
            ? '<span class="admin-bookings-stat admin-bookings-stat--warn">' + esc(stats.pending) + ' pending</span>'
            : '') +
          (stats.cancelled
            ? '<span class="admin-bookings-stat admin-bookings-stat--bad">' + esc(stats.cancelled) + ' cancelled</span>'
            : '') +
          '</div></div></div>';

    return (
      '<section class="admin-bookings-panel' +
      (options.compact ? ' admin-bookings-panel--compact' : '') +
      '">' +
      head +
      '<ul class="admin-booking-list admin-booking-list--cards">' +
      bookings.map(function (b) {
        return renderBookingCard(b, !!options.compact);
      }).join('') +
      '</ul></section>'
    );
  }

  function renderBookingsMiniTable(bookings) {
    return renderSalonBookingsPanel(bookings, bookings.length, { compact: true, hideHead: true });
  }

  function renderBookingsFullTable(bookings) {
    if (!bookings.length) return '<p class="admin-muted">No bookings yet.</p>';
    return (
      '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Appointment</th><th>Client</th><th>Service</th><th>Status</th><th>Payment</th><th>Total</th><th>Deposit</th></tr></thead><tbody>' +
      bookings
        .map(function (b) {
          return (
            '<tr class="admin-row-clickable"' +
            bookingOpenAttr(b) +
            '><td>' +
            fmtDate(b.appointment_starts_at) +
            '</td><td>' +
            esc(b.full_name) +
            '<br><span class="admin-muted">' +
            esc(b.email) +
            '</span></td><td>' +
            esc(b.style_name) +
            '</td><td>' +
            esc(b.booking_status) +
            '</td><td>' +
            esc(b.payment_status) +
            '</td><td>' +
            fmtMoney(b.estimated_total) +
            '</td><td>' +
            fmtMoney(b.deposit_amount) +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function setSalonTab(tab) {
    var valid = ['analytics', 'bookings', 'clients', 'reviews', 'emails', 'business'];
    if (valid.indexOf(tab) === -1) tab = 'analytics';
    state.salonTab = tab;

    document.querySelectorAll('.admin-salon-tab').forEach(function (btn) {
      var active = btn.getAttribute('data-salon-tab') === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (els.salonTabPanel && state.salonData) {
      els.salonTabPanel.innerHTML = renderSalonTab(state.salonData, tab);
      els.salonTabPanel.setAttribute('aria-labelledby', 'admin-salon-tab-' + tab);
    }

    if (els.salonViewBody) {
      els.salonViewBody.scrollTop = 0;
    }
  }

  function renderSalonDashboard(data) {
    state.salonData = data;
    setSalonTab(state.salonTab || 'analytics');
  }

  function openSalonDashboard(data) {
    state.salonData = data;
    state.salonTab = 'analytics';
    var name = data.brand_name || 'Salon';
    if (els.salonViewTitle) els.salonViewTitle.textContent = name;
    if (els.salonViewSub) {
      var sub = data.subscription || {};
      var subLine = sub.plan_label || sub.status || '';
      els.salonViewSub.textContent =
        (data.subdomain ? data.subdomain + '.styldd.com' : '') +
        (subLine ? ' · ' + subLine : '');
    }
    if (els.salonViewLink) {
      if (data.public_url) {
        els.salonViewLink.href = data.public_url;
        els.salonViewLink.hidden = false;
      } else {
        els.salonViewLink.hidden = true;
      }
    }
    renderSalonDashboard(data);
    if (els.salonView) {
      els.salonView.hidden = false;
      document.body.classList.add('admin-salon-open');
    }
  }

  function closeSalonDashboard() {
    state.salonData = null;
    if (els.salonView) {
      els.salonView.hidden = true;
      document.body.classList.remove('admin-salon-open');
    }
  }

  function openUserDrawer(userId) {
    setStatus('Loading salon dashboard…');
    api('user_detail', { user_id: userId }, state.pin)
      .then(function (data) {
        setStatus('');
        if (data.error) throw new Error(data.error);
        openSalonDashboard(data);
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  }

  function openBookingDrawer(bookingId) {
    var id = String(bookingId || '').trim();
    if (!id) {
      setStatus('Could not open booking', true);
      return;
    }
    setStatus('Loading booking…');
    api('booking_detail', { booking_id: id }, state.pin)
      .then(function (data) {
        setStatus('');
        if (data.error) throw new Error(data.error);
        var b = data.booking || {};
        var when = fmtApptCalendar(b.appointment_starts_at || b.created_at);
        var title = (b.full_name || 'Booking') + ' · ' + when.month + ' ' + when.day;
        openDrawer(title, bookingDetailHtml(data));
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  }

  function loadTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      var active = btn.getAttribute('data-tab') === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.admin-panel').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== tab;
    });

    setStatus('Loading…');
    var promise;
    var search = state.search;

    switch (tab) {
      case 'overview':
        promise = api('overview', {}, state.pin).then(function (data) {
          renderOverview(data);
        });
        break;
      case 'salons':
      case 'users':
        promise = api('users', { search: search }, state.pin).then(function (data) {
          state.users = data.users || [];
          renderUsersTable(state.users);
        });
        break;
      case 'bookings':
        promise = api('bookings', { search: search }, state.pin).then(function (data) {
          state.bookings = data.bookings || [];
          renderBookingsTable(state.bookings);
        });
        break;
      case 'clients':
        promise = api('clients', { search: search }, state.pin).then(function (data) {
          state.clients = data.clients || [];
          renderClientsTable(state.clients);
        });
        break;
      case 'cancellations':
        promise = api('cancellations', {}, state.pin).then(function (data) {
          state.cancellations = data.cancellations || [];
          renderCancellations(state.cancellations);
        });
        break;
      case 'inquiries':
        promise = api('inquiries', { search: search }, state.pin).then(function (data) {
          state.inquiries = data.inquiries || [];
          renderInquiriesPanel(state.inquiries);
        });
        break;
      case 'reviews':
        promise = api('reviews', {}, state.pin).then(function (data) {
          state.reviews = data.reviews || [];
          renderReviewsPanel(state.reviews);
        });
        break;
      case 'emails':
        promise = api('emails', { search: search, limit: 200 }, state.pin).then(function (data) {
          state.emails = data.emails || [];
          renderEmailsMainPanel(state.emails);
        });
        break;
      case 'onboarding':
        promise = api('onboarding', {}, state.pin).then(function (data) {
          state.onboarding = data.responses || [];
          renderOnboardingPanel(state.onboarding);
        });
        break;
      case 'analytics':
        promise = api('analytics', {}, state.pin).then(function (data) {
          renderAnalytics(data);
        });
        break;
      case 'styld_revenue':
        promise = loadStyldRevenue();
        break;
      default:
        promise = Promise.resolve();
    }

    promise
      .then(function () {
        setStatus('');
      })
      .catch(function (err) {
        if (err.status === 401 && err.payload && err.payload.error === 'Invalid PIN') {
          clearPin();
          window.location.href = '/marketing/index.html?admin=denied';
          return;
        }
        setStatus(err.message, true);
      });
  }

  function bindEvents() {
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        loadTab(btn.getAttribute('data-tab'));
      });
    });

    if (els.search) {
      els.search.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          state.search = els.search.value.trim();
          loadTab(state.tab);
        }
      });
    }

    if (els.refresh) {
      els.refresh.addEventListener('click', function () {
        loadTab(state.tab);
      });
    }

    document.querySelectorAll('[data-num-format]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var format = btn.getAttribute('data-num-format') || 'full';
        if (format === state.numberFormat) return;
        setNumberFormatUI(format);
        refreshCurrentView();
      });
    });

    if (els.hideMoney) {
      els.hideMoney.addEventListener('click', function () {
        setHideMoneyUI(!state.hideMoney);
        refreshCurrentView();
      });
    }

    document.querySelectorAll('[data-revenue-range]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var range = btn.getAttribute('data-revenue-range') || 'month';
        state.revenueRange = range;
        setRevenueRangeUI(range);
        if (state.tab === 'styld_revenue') loadStyldRevenue();
      });
    });

    if (els.revenueMonth) {
      els.revenueMonth.addEventListener('change', function () {
        state.revenueMonth = els.revenueMonth.value;
        if (state.tab === 'styld_revenue') loadStyldRevenue();
      });
    }

    if (els.revenueYear) {
      els.revenueYear.addEventListener('change', function () {
        state.revenueYear = els.revenueYear.value;
        if (state.tab === 'styld_revenue') loadStyldRevenue();
      });
    }

    if (els.logout) {
      els.logout.addEventListener('click', function () {
        clearPin();
        window.location.href = '/marketing/index.html';
      });
    }

    if (els.exportBookings) {
      els.exportBookings.addEventListener('click', function () {
        api('export', { type: 'bookings' }, state.pin).then(function (data) {
          downloadCsv('styld-bookings.csv', data.bookings || []);
        });
      });
    }

    if (els.exportOnboarding) {
      els.exportOnboarding.addEventListener('click', function () {
        api('export', { type: 'onboarding' }, state.pin).then(function (data) {
          var rows = (data.responses || []).map(function (r) {
            return {
              user_id: r.user_id,
              created_at: r.created_at,
              json: JSON.stringify(r.value),
            };
          });
          downloadCsv('styld-onboarding.csv', rows);
        });
      });
    }

    document.body.addEventListener('click', function (e) {
      var userBtn = e.target.closest('[data-open-user]');
      if (userBtn) {
        closeDrawer();
        openUserDrawer(userBtn.getAttribute('data-open-user'));
        return;
      }
      var bookingEl = e.target.closest('[data-open-booking]');
      if (bookingEl) {
        openBookingDrawer(bookingEl.getAttribute('data-open-booking'));
        return;
      }
      var clientEl = e.target.closest('[data-open-client-key]');
      if (clientEl) {
        openClientDrawer(clientEl.getAttribute('data-open-client-key'));
        return;
      }
      var globalClientEl = e.target.closest('[data-open-global-client]');
      if (globalClientEl) {
        var parts = String(globalClientEl.getAttribute('data-open-global-client') || '').split('|');
        openGlobalClient(parts[0], parts.slice(1).join('|'));
        return;
      }
      var emailEl = e.target.closest('[data-open-email]');
      if (emailEl) {
        openEmailDrawer(emailEl.getAttribute('data-open-email'));
        return;
      }
      if (e.target.closest('[data-drawer-close]')) {
        closeDrawer();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (els.drawer && !els.drawer.hidden) closeDrawer();
        else if (state.salonData) closeSalonDashboard();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        var clientEl = e.target.closest('[data-open-client-key]');
        if (clientEl && clientEl.getAttribute('role') === 'button') {
          e.preventDefault();
          openClientDrawer(clientEl.getAttribute('data-open-client-key'));
          return;
        }
        var globalClientEl = e.target.closest('[data-open-global-client]');
        if (globalClientEl && globalClientEl.getAttribute('role') === 'button') {
          e.preventDefault();
          var gParts = String(globalClientEl.getAttribute('data-open-global-client') || '').split('|');
          openGlobalClient(gParts[0], gParts.slice(1).join('|'));
          return;
        }
        var bookingEl = e.target.closest('[data-open-booking]');
        if (bookingEl && bookingEl.getAttribute('role') === 'button') {
          e.preventDefault();
          openBookingDrawer(bookingEl.getAttribute('data-open-booking'));
          return;
        }
        var emailEl = e.target.closest('[data-open-email]');
        if (emailEl && emailEl.getAttribute('role') === 'button') {
          e.preventDefault();
          openEmailDrawer(emailEl.getAttribute('data-open-email'));
        }
      }
    });

    if (els.salonBack) {
      els.salonBack.addEventListener('click', closeSalonDashboard);
    }

    if (els.salonSort) {
      els.salonSort.value = state.salonSort || 'revenue_desc';
      els.salonSort.addEventListener('change', function () {
        state.salonSort = els.salonSort.value || 'revenue_desc';
        renderUsersTable(state.users);
      });
    }

    document.querySelectorAll('.admin-salon-tab').forEach(function (btn) {
      btn.setAttribute('role', 'tab');
      btn.id = 'admin-salon-tab-' + btn.getAttribute('data-salon-tab');
    });

    if (els.salonTabs) {
      els.salonTabs.addEventListener('click', function (e) {
        var btn = e.target.closest('.admin-salon-tab');
        if (!btn) return;
        e.preventDefault();
        setSalonTab(btn.getAttribute('data-salon-tab'));
      });
    }
  }

  function init() {
    if (!state.pin) {
      window.location.href = '/marketing/index.html?admin=required';
      return;
    }

    els = {
      salonsGrid: $('admin-salons-grid'),
      salonSort: $('admin-salon-sort'),
      salonCount: $('admin-salon-count'),
      salonView: $('admin-salon-view'),
      salonViewTitle: $('admin-salon-view-title'),
      salonViewSub: $('admin-salon-view-sub'),
      salonViewLink: $('admin-salon-view-link'),
      salonViewBody: $('admin-salon-view-body'),
      salonTabs: $('admin-salon-tabs'),
      salonTabPanel: $('admin-salon-tab-panel'),
      salonBack: $('admin-salon-back'),
      bookingsPanel: $('admin-bookings-panel'),
      clientsPanel: $('admin-clients-panel'),
      cancellationsPanel: $('admin-cancellations-panel'),
      inquiriesPanel: $('admin-inquiries-panel'),
      reviewsPanel: $('admin-reviews-panel'),
      emailsPanel: $('admin-emails-panel'),
      overviewPanel: $('admin-overview-panel'),
      styldRevenuePanel: $('admin-styld-revenue-panel'),
      revenueMonth: $('admin-revenue-month'),
      revenueYear: $('admin-revenue-year'),
      onboardingPanel: $('admin-onboarding-panel'),
      analyticsPanel: $('admin-analytics-panel'),
      status: $('admin-status'),
      search: $('admin-search'),
      refresh: $('admin-refresh'),
      hideMoney: $('admin-hide-money'),
      logout: $('admin-logout'),
      exportBookings: $('admin-export-bookings'),
      exportOnboarding: $('admin-export-onboarding'),
      drawer: $('admin-drawer'),
      drawerTitle: $('admin-drawer-title'),
      drawerBody: $('admin-drawer-body'),
    };

    bindEvents();
    setNumberFormatUI(state.numberFormat || 'full');
    setHideMoneyUI(state.hideMoney);
    setRevenueRangeUI(state.revenueRange || 'month');
    loadTab('overview');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.StyldAdmin = { api: api, savePin: savePin, clearPin: clearPin, getPin: getPin };
})();
