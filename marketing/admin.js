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
    return d.toLocaleString();
  }

  function fmtMoney(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    if (isNaN(n)) return esc(v);
    return '$' + n.toFixed(2);
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
    tab: 'salons',
    users: [],
    bookings: [],
    clients: [],
    overview: null,
    search: '',
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

  function renderKpis(data) {
    if (!els.kpiGrid || !data) return;
    var cards = [
      ['Stylists', data.total_stylists],
      ['Published sites', data.published_sites],
      ['Bookings', data.total_bookings],
      ['Global clients', data.unique_clients_global],
      ['Inquiries', data.total_inquiries],
      ['Reviews', data.total_reviews],
      ['Stripe live', data.stripe_merchants_live],
    ];
    els.kpiGrid.innerHTML = cards
      .map(function (c) {
        return (
          '<article class="admin-kpi"><span class="admin-kpi__label">' +
          esc(c[0]) +
          '</span><strong class="admin-kpi__value">' +
          esc(c[1]) +
          '</strong></article>'
        );
      })
      .join('');
    if (els.subNote) els.subNote.textContent = data.subscriptions_note || '';
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

  function salonCardHtml(u) {
    var name = u.brand_name || u.business_name || u.full_name || 'Salon';
    var img = u.image_url
      ? '<img class="admin-salon-card__img" src="' + esc(u.image_url) + '" alt="" loading="lazy" decoding="async">'
      : '';
    var fallback =
      '<span class="admin-salon-card__fallback"' +
      (u.image_url ? ' hidden' : '') +
      '>' +
      esc(salonInitials(name)) +
      '</span>';
    return (
      '<button type="button" class="admin-salon-card" data-open-user="' +
      esc(u.user_id) +
      '">' +
      '<div class="admin-salon-card__media">' +
      img +
      fallback +
      '</div>' +
      '<div class="admin-salon-card__body">' +
      '<h3 class="admin-salon-card__title">' +
      esc(name) +
      '</h3>' +
      '<p class="admin-salon-card__meta">' +
      (u.public_url
        ? esc(u.subdomain) + '.styldd.com'
        : esc(u.subdomain || 'No site yet')) +
      '</p>' +
      '<p class="admin-salon-card__revenue">' +
      fmtMoney(u.total_revenue) +
      '</p>' +
      '<p class="admin-salon-card__stats">' +
      esc(u.booking_count) +
      ' bookings · ' +
      fmtMoney(u.revenue_collected) +
      ' collected</p>' +
      '<span class="admin-salon-card__cta">View breakdown →</span>' +
      '</div>' +
      '</button>'
    );
  }

  function renderSalonGrid(users, target, limit) {
    if (!target) return;
    var list = (users || []).slice();
    if (limit) list = list.slice(0, limit);
    if (!list.length) {
      target.innerHTML = '<p class="admin-muted">No salons found.</p>';
      return;
    }
    target.innerHTML = list.map(salonCardHtml).join('');
  }

  function renderUsersTable(users) {
    renderSalonGrid(users, els.salonsGrid);
    renderSalonGrid(users, els.overviewSalons, 6);
  }

  function renderBookingsTable(bookings) {
    if (!els.bookingsBody) return;
    state.bookings = bookings || [];
    els.bookingsBody.innerHTML = state.bookings
      .map(function (b, index) {
        return (
          '<tr data-booking-id="' +
          esc(b.id || b.row_id) +
          '">' +
          '<td>' +
          fmtDate(b.created_at) +
          '</td>' +
          '<td><span class="admin-mono">' +
          esc((b.id || '').slice(0, 8)) +
          '</span></td>' +
          '<td>' +
          esc(b.full_name) +
          '</td>' +
          '<td>' +
          esc(b.style_name) +
          '</td>' +
          '<td>' +
          fmtDate(b.appointment_starts_at) +
          '</td>' +
          '<td>' +
          esc(b.booking_status) +
          '</td>' +
          '<td>' +
          esc(b.payment_status) +
          '</td>' +
          '<td>' +
          fmtMoney(b.estimated_total) +
          '</td>' +
          '<td><button type="button" class="admin-link-btn" data-booking-index="' +
          index +
          '">View</button></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function renderClientsTable(clients) {
    if (!els.clientsBody) return;
    els.clientsBody.innerHTML = (clients || [])
      .map(function (c) {
        return (
          '<tr>' +
          '<td>' +
          esc(c.client_name) +
          '</td>' +
          '<td>' +
          esc(c.email) +
          '</td>' +
          '<td>' +
          esc(c.phone) +
          '</td>' +
          '<td><span class="admin-mono">' +
          esc((c.user_id || '').slice(0, 8)) +
          '</span></td>' +
          '<td>' +
          esc(c.booking_count) +
          '</td>' +
          '<td>' +
          fmtMoney(c.total_spend) +
          '</td>' +
          '<td>' +
          fmtDate(c.last_booking_at) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function renderSimpleRecords(target, rows, labelKeys) {
    if (!target) return;
    target.innerHTML = (rows || [])
      .map(function (r) {
        var data = r.data || r.value || r;
        var bits = labelKeys
          .map(function (k) {
            return esc(data[k]);
          })
          .filter(Boolean)
          .join(' · ');
        return (
          '<tr><td>' +
          fmtDate(r.created_at) +
          '</td><td><span class="admin-mono">' +
          esc((r.user_id || '').slice(0, 8)) +
          '</span></td><td>' +
          (bits || esc(JSON.stringify(data).slice(0, 120))) +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderCancellations(rows) {
    if (!els.cancellationsBody) return;
    els.cancellationsBody.innerHTML = (rows || [])
      .map(function (r) {
        return (
          '<tr>' +
          '<td>' +
          fmtDate(r.created_at) +
          '</td>' +
          '<td><span class="admin-mono">' +
          esc((r.booking_id || '').slice(0, 8)) +
          '</span></td>' +
          '<td>' +
          esc(r.cancelled_by) +
          '</td>' +
          '<td>' +
          esc(r.refund_status) +
          '</td>' +
          '<td>' +
          (r.refund_amount_cents != null ? '$' + (Number(r.refund_amount_cents) / 100).toFixed(2) : '—') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function renderAnalytics(data) {
    if (!els.analyticsPanel || !data) return;
    var subRows = (data.by_subdomain || [])
      .slice(0, 15)
      .map(function (r) {
        return '<tr><td>' + esc(r.subdomain) + '</td><td>' + esc(r.views) + '</td></tr>';
      })
      .join('');
    var pathRows = (data.top_paths || [])
      .slice(0, 15)
      .map(function (r) {
        return '<tr><td>' + esc(r.path) + '</td><td>' + esc(r.views) + '</td></tr>';
      })
      .join('');
    els.analyticsPanel.innerHTML =
      '<p class="admin-muted">Source: ' +
      esc(data.source) +
      ' · Total: ' +
      esc(data.total_events) +
      '</p>' +
      '<div class="admin-analytics-grid">' +
      '<div><h3>By subdomain</h3><table class="admin-table"><thead><tr><th>Subdomain</th><th>Views</th></tr></thead><tbody>' +
      subRows +
      '</tbody></table></div>' +
      '<div><h3>Top paths</h3><table class="admin-table"><thead><tr><th>Path</th><th>Views</th></tr></thead><tbody>' +
      pathRows +
      '</tbody></table></div>' +
      '</div>';
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

  function renderSalonDetail(data) {
    var p = data.profile || {};
    var rev = data.revenue_summary || {};
    var settings = data.site_settings || {};
    var content = settings.site_content || {};
    var stripe = data.stripe || {};
    var sub = data.subscription || {};
    var name = data.brand_name || p.business_name || p.full_name || 'Salon';
    var img = data.image_url
      ? '<img class="admin-salon-hero__img" src="' + esc(data.image_url) + '" alt="">'
      : '<span class="admin-salon-hero__fallback">' + esc(salonInitials(name)) + '</span>';

    var bookingRows = (data.bookings || [])
      .slice(0, 25)
      .map(function (b) {
        return (
          '<tr><td>' +
          fmtDate(b.appointment_starts_at) +
          '</td><td>' +
          esc(b.full_name) +
          '</td><td>' +
          esc(b.style_name) +
          '</td><td>' +
          esc(b.booking_status) +
          '</td><td>' +
          esc(b.payment_status) +
          '</td><td>' +
          fmtMoney(b.estimated_total) +
          '</td></tr>'
        );
      })
      .join('');

    var reviewRows = (data.reviews || [])
      .slice(0, 10)
      .map(function (r) {
        var d = r.data || {};
        return (
          '<tr><td>' +
          fmtDate(r.created_at) +
          '</td><td>' +
          esc(d.rating) +
          '★</td><td>' +
          esc(d.client_name) +
          '</td><td>' +
          esc(d.message) +
          '</td></tr>'
        );
      })
      .join('');

    var onboarding = data.onboarding_responses || null;
    var onboardingHtml = onboarding
      ? '<pre class="admin-json">' + esc(JSON.stringify(onboarding, null, 2)) + '</pre>'
      : '<p class="admin-muted">No onboarding responses saved.</p>';

    return (
      '<div class="admin-salon-hero">' +
      '<div class="admin-salon-hero__media">' +
      img +
      '</div>' +
      '<div class="admin-salon-hero__copy">' +
      '<h3>' +
      esc(name) +
      '</h3>' +
      '<p class="admin-muted">' +
      esc(p.email) +
      '</p>' +
      (data.public_url
        ? '<a class="admin-salon-link" href="' +
          esc(data.public_url) +
          '" target="_blank" rel="noopener">' +
          esc(data.public_url) +
          '</a>'
        : '<p class="admin-muted">Site not published</p>') +
      '</div></div>' +
      '<div class="admin-salon-metrics">' +
      '<article><span>Total revenue</span><strong>' +
      fmtMoney(rev.gross) +
      '</strong></article>' +
      '<article><span>Collected</span><strong>' +
      fmtMoney(rev.collected) +
      '</strong></article>' +
      '<article><span>Pending</span><strong>' +
      fmtMoney(rev.pending) +
      '</strong></article>' +
      '<article><span>Bookings</span><strong>' +
      esc(rev.booking_count || 0) +
      '</strong></article>' +
      '<article><span>Clients</span><strong>' +
      esc(rev.unique_clients || 0) +
      '</strong></article>' +
      '<article><span>Cancelled</span><strong>' +
      esc(rev.cancelled_count || 0) +
      '</strong></article>' +
      '</div>' +
      '<div class="admin-drawer-section"><h4>Account</h4><dl class="admin-dl">' +
      '<dt>Owner</dt><dd>' +
      esc(p.full_name) +
      '</dd>' +
      '<dt>Business</dt><dd>' +
      esc(p.business_name || '—') +
      '</dd>' +
      '<dt>Joined</dt><dd>' +
      fmtDate(p.created_at) +
      '</dd>' +
      '<dt>Last sign-in</dt><dd>' +
      fmtDate(data.last_sign_in_at || p.last_sign_in_at) +
      '</dd>' +
      '<dt>Published</dt><dd>' +
      (settings.site_publish && settings.site_publish.published ? 'Yes' : 'No') +
      '</dd>' +
      '<dt>Subscription</dt><dd>' +
      esc(sub.status || 'unknown') +
      (sub.product ? ' · ' + esc(sub.product) : '') +
      '</dd>' +
      '</dl></div>' +
      '<div class="admin-drawer-section"><h4>Stripe Connect</h4><dl class="admin-dl">' +
      '<dt>Charges</dt><dd>' +
      (stripe.charges_enabled ? 'Enabled' : 'No') +
      '</dd>' +
      '<dt>Payouts</dt><dd>' +
      (stripe.payouts_enabled ? 'Enabled' : 'No') +
      '</dd>' +
      '<dt>Available</dt><dd>' +
      (stripe.balance_available_cents != null
        ? fmtMoney(Number(stripe.balance_available_cents) / 100)
        : '—') +
      '</dd>' +
      '<dt>Pending</dt><dd>' +
      (stripe.balance_pending_cents != null
        ? fmtMoney(Number(stripe.balance_pending_cents) / 100)
        : '—') +
      '</dd>' +
      '</dl></div>' +
      '<div class="admin-drawer-section"><h4>Recent bookings</h4>' +
      (bookingRows
        ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Appointment</th><th>Client</th><th>Service</th><th>Status</th><th>Payment</th><th>Total</th></tr></thead><tbody>' +
          bookingRows +
          '</tbody></table></div>'
        : '<p class="admin-muted">No bookings yet.</p>') +
      '</div>' +
      '<div class="admin-drawer-section"><h4>Reviews</h4>' +
      (reviewRows
        ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>When</th><th>Rating</th><th>Client</th><th>Message</th></tr></thead><tbody>' +
          reviewRows +
          '</tbody></table></div>'
        : '<p class="admin-muted">No reviews yet.</p>') +
      '</div>' +
      '<div class="admin-drawer-section"><h4>Onboarding survey</h4>' +
      onboardingHtml +
      '</div>' +
      '<div class="admin-drawer-section"><h4>Site settings</h4><pre class="admin-json">' +
      esc(JSON.stringify(settings, null, 2)) +
      '</pre></div>' +
      '<div class="admin-drawer-section"><h4>Cancellations</h4><pre class="admin-json">' +
      esc(JSON.stringify(data.cancellations || [], null, 2)) +
      '</pre></div>'
    );
  }

  function openUserDrawer(userId) {
    setStatus('Loading salon…');
    api('user_detail', { user_id: userId }, state.pin)
      .then(function (data) {
        setStatus('');
        var name = data.brand_name || (data.profile && data.profile.business_name) || 'Salon detail';
        openDrawer(name, renderSalonDetail(data));
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  }

  function openBookingDrawer(b) {
    if (!b) {
      setStatus('Could not open booking', true);
      return;
    }
    openDrawer(
      'Booking ' + (b.id || '').slice(0, 8),
      '<pre class="admin-json">' + esc(JSON.stringify(b, null, 2)) + '</pre>',
    );
  }

  function loadTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.admin-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === tab);
    });
    document.querySelectorAll('.admin-panel').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== tab;
    });

    setStatus('Loading…');
    var promise;
    var search = state.search;

    switch (tab) {
      case 'overview':
        promise = api('overview', {}, state.pin)
          .then(function (data) {
            state.overview = data;
            renderKpis(data);
          })
          .then(function () {
            if (state.users.length) {
              renderSalonGrid(state.users, els.overviewSalons, 6);
              return;
            }
            return api('users', { search: search }, state.pin).then(function (data) {
              state.users = data.users || [];
              renderSalonGrid(state.users, els.overviewSalons, 6);
            });
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
          renderCancellations(data.cancellations || []);
        });
        break;
      case 'inquiries':
        promise = api('inquiries', { search: search }, state.pin).then(function (data) {
          renderSimpleRecords(els.inquiriesBody, data.inquiries || [], ['full_name', 'name', 'email', 'message']);
        });
        break;
      case 'reviews':
        promise = api('reviews', {}, state.pin).then(function (data) {
          renderSimpleRecords(els.reviewsBody, data.reviews || [], ['client_name', 'rating', 'message']);
        });
        break;
      case 'onboarding':
        promise = api('onboarding', {}, state.pin).then(function (data) {
          renderSimpleRecords(
            els.onboardingBody,
            (data.responses || []).map(function (r) {
              return {
                created_at: r.created_at,
                user_id: r.user_id,
                data: r.value,
              };
            }),
            ['fullName', 'accountEmail'],
          );
        });
        break;
      case 'analytics':
        promise = api('analytics', {}, state.pin).then(function (data) {
          renderAnalytics(data);
        });
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
        openUserDrawer(userBtn.getAttribute('data-open-user'));
        return;
      }
      var bookingBtn = e.target.closest('[data-booking-index]');
      if (bookingBtn) {
        var idx = Number(bookingBtn.getAttribute('data-booking-index'));
        openBookingDrawer(state.bookings[idx]);
        return;
      }
      if (e.target.closest('[data-drawer-close]')) {
        closeDrawer();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  function init() {
    if (!state.pin) {
      window.location.href = '/marketing/index.html?admin=required';
      return;
    }

    els = {
      kpiGrid: $('admin-kpi-grid'),
      subNote: $('admin-sub-note'),
      salonsGrid: $('admin-salons-grid'),
      overviewSalons: $('admin-overview-salons'),
      bookingsBody: $('admin-bookings-body'),
      clientsBody: $('admin-clients-body'),
      cancellationsBody: $('admin-cancellations-body'),
      inquiriesBody: $('admin-inquiries-body'),
      reviewsBody: $('admin-reviews-body'),
      onboardingBody: $('admin-onboarding-body'),
      analyticsPanel: $('admin-analytics-panel'),
      status: $('admin-status'),
      search: $('admin-search'),
      refresh: $('admin-refresh'),
      logout: $('admin-logout'),
      exportBookings: $('admin-export-bookings'),
      exportOnboarding: $('admin-export-onboarding'),
      drawer: $('admin-drawer'),
      drawerTitle: $('admin-drawer-title'),
      drawerBody: $('admin-drawer-body'),
    };

    bindEvents();
    loadTab('salons');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.StyldAdmin = { api: api, savePin: savePin, clearPin: clearPin, getPin: getPin };
})();
