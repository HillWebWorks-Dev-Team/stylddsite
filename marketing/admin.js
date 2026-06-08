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
          var err = new Error(data.error || 'Request failed');
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
    tab: 'overview',
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

  function renderUsersTable(users) {
    if (!els.usersBody) return;
    els.usersBody.innerHTML = (users || [])
      .map(function (u) {
        var sub = u.subscription || {};
        var subLabel =
          sub.status === 'active'
            ? 'Pro'
            : sub.status === 'none'
              ? 'None'
              : sub.status === 'unknown'
                ? 'Unknown'
                : sub.status || '—';
        return (
          '<tr data-user-id="' +
          esc(u.user_id) +
          '">' +
          '<td>' +
          esc(u.full_name || u.business_name || '—') +
          '<br><span class="admin-muted">' +
          esc(u.email) +
          '</span></td>' +
          '<td>' +
          (u.public_url
            ? '<a href="' + esc(u.public_url) + '" target="_blank" rel="noopener">' + esc(u.subdomain) + '</a>'
            : esc(u.subdomain || '—')) +
          '</td>' +
          '<td>' +
          (u.site_published ? 'Yes' : 'No') +
          '</td>' +
          '<td>' +
          (u.onboarding_completed ? 'Yes' : 'No') +
          '</td>' +
          '<td>' +
          esc(u.booking_count) +
          '</td>' +
          '<td>' +
          esc(u.page_views_30d) +
          '</td>' +
          '<td>' +
          (u.stripe && u.stripe.charges_enabled ? 'Live' : '—') +
          '</td>' +
          '<td>' +
          esc(subLabel) +
          '</td>' +
          '<td><button type="button" class="admin-link-btn" data-open-user="' +
          esc(u.user_id) +
          '">View</button></td>' +
          '</tr>'
        );
      })
      .join('');
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

  function openUserDrawer(userId) {
    setStatus('Loading stylist…');
    api('user_detail', { user_id: userId }, state.pin)
      .then(function (data) {
        setStatus('');
        var p = data.profile || {};
        var settings = data.site_settings || {};
        var html =
          '<div class="admin-drawer-section">' +
          '<h3>' +
          esc(p.full_name || p.business_name || 'Stylist') +
          '</h3>' +
          '<p class="admin-muted">' +
          esc(p.email) +
          '</p>' +
          '<dl class="admin-dl">' +
          '<dt>Bookings</dt><dd>' +
          (data.bookings || []).length +
          '</dd>' +
          '<dt>Stripe charges</dt><dd>' +
          (data.stripe && data.stripe.charges_enabled ? 'Enabled' : 'No') +
          '</dd>' +
          '<dt>Subscription</dt><dd>' +
          esc(JSON.stringify(data.subscription)) +
          '</dd>' +
          '</dl></div>' +
          '<div class="admin-drawer-section"><h4>Site settings</h4><pre class="admin-json">' +
          esc(JSON.stringify(settings, null, 2)) +
          '</pre></div>' +
          '<div class="admin-drawer-section"><h4>Recent bookings</h4><pre class="admin-json">' +
          esc(JSON.stringify((data.bookings || []).slice(0, 10), null, 2)) +
          '</pre></div>';
        openDrawer('Stylist detail', html);
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
        promise = api('overview', {}, state.pin).then(function (data) {
          state.overview = data;
          renderKpis(data);
        });
        break;
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
        if (err.status === 401) {
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
      usersBody: $('admin-users-body'),
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
    loadTab('overview');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.StyldAdmin = { api: api, savePin: savePin, clearPin: clearPin, getPin: getPin };
})();
