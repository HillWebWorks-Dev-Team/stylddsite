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

  function truncate(str, max) {
    str = String(str || '');
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
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
    salonTab: 'analytics',
    salonData: null,
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

  function subscriptionDetailHtml(sub) {
    sub = sub || {};
    if (sub.status === 'unknown') {
      return '<p class="admin-muted">' + esc(sub.message || 'RevenueCat not configured.') + '</p>';
    }
    return (
      '<dl class="admin-dl">' +
      '<dt>Status</dt><dd>' +
      esc(sub.status || '—') +
      '</dd>' +
      '<dt>Plan</dt><dd>' +
      esc(sub.plan_label || sub.product || '—') +
      '</dd>' +
      '<dt>Entitlement</dt><dd>' +
      esc(sub.entitlement || '—') +
      '</dd>' +
      '<dt>Store</dt><dd>' +
      esc(sub.store || '—') +
      '</dd>' +
      '<dt>Renews</dt><dd>' +
      (sub.will_renew ? 'Yes' : 'No') +
      '</dd>' +
      '<dt>Expires</dt><dd>' +
      (sub.expires_date ? fmtDate(sub.expires_date) : '—') +
      '</dd>' +
      '<dt>Purchased</dt><dd>' +
      (sub.purchase_date ? fmtDate(sub.purchase_date) : '—') +
      '</dd>' +
      (sub.billing_issues ? '<dt>Billing</dt><dd class="admin-text-warn">Issue detected</dd>' : '') +
      (sub.unsubscribe_detected_at
        ? '<dt>Cancelled</dt><dd>' + fmtDate(sub.unsubscribe_detected_at) + '</dd>'
        : '') +
      '</dl>'
    );
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
      esc(u.booking_count) +
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
    renderSalonList(users, els.salonsGrid);
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
          var display = formatVal ? formatVal(val, item) : String(val);
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
      '<div class="admin-salon-metrics admin-salon-metrics--wide">' +
      items
        .map(function (item) {
          return (
            '<article><span>' +
            esc(item.label) +
            '</span><strong>' +
            esc(item.value) +
            '</strong>' +
            (item.hint ? '<small>' + esc(item.hint) + '</small>' : '') +
            '</article>'
          );
        })
        .join('') +
      '</div>'
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
      renderBookingsMiniTable((data.bookings || []).slice(0, 6)) +
      '</section>'
    );
  }

  function renderSalonTab(data, tab) {
    var p = data.profile || {};
    var rev = data.revenue_summary || {};
    var a = data.analytics || {};
    var stripe = data.stripe || {};
    var sub = data.subscription || {};
    var contact = data.contact || {};

    if (tab === 'analytics') {
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

    if (tab === 'bookings') {
      return (
        '<div class="admin-panel-head"><h3>All bookings (' + (data.bookings || []).length + ')</h3></div>' +
        renderBookingsFullTable(data.bookings || [])
      );
    }

    if (tab === 'clients') {
      var clientRows = (data.clients || [])
        .map(function (c) {
          return (
            '<tr><td>' +
            esc(c.client_name) +
            '</td><td>' +
            esc(c.email) +
            '</td><td>' +
            esc(c.phone) +
            '</td><td>' +
            esc(c.booking_count) +
            '</td><td>' +
            fmtMoney(c.total_spend) +
            '</td><td>' +
            fmtDate(c.last_booking_at) +
            '</td></tr>'
          );
        })
        .join('');
      return (
        '<div class="admin-panel-head"><h3>Clients (' + (data.clients || []).length + ')</h3></div>' +
        (clientRows
          ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Visits</th><th>Spend</th><th>Last booking</th></tr></thead><tbody>' +
            clientRows +
            '</tbody></table></div>'
          : '<p class="admin-muted">No clients yet.</p>')
      );
    }

    if (tab === 'reviews') {
      var reviewRows = (data.reviews || [])
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
            '</td><td>' +
            (d.published ? 'Public' : 'Hidden') +
            '</td></tr>'
          );
        })
        .join('');
      return (
        statCards([
          { label: 'Total reviews', value: a.reviews_count || 0 },
          { label: 'Average rating', value: a.reviews_avg_rating ? a.reviews_avg_rating + '★' : '—' },
        ]) +
        (reviewRows
          ? '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>When</th><th>Rating</th><th>Client</th><th>Message</th><th>Status</th></tr></thead><tbody>' +
            reviewRows +
            '</tbody></table></div>'
          : '<p class="admin-muted">No reviews yet.</p>')
      );
    }

    if (tab === 'business') {
      var onboarding = data.onboarding_responses;
      var survey = onboarding && onboarding.survey ? onboarding.survey : null;
      var biz = onboarding && onboarding.business ? onboarding.business : null;
      return (
        '<div class="admin-dash-grid">' +
        '<section class="admin-dash-card"><h4>Account</h4><dl class="admin-dl">' +
        '<dt>Owner</dt><dd>' +
        esc(p.full_name) +
        '</dd>' +
        '<dt>Email</dt><dd>' +
        esc(p.email) +
        '</dd>' +
        '<dt>Joined</dt><dd>' +
        fmtDate(p.created_at) +
        '</dd>' +
        '<dt>Last sign-in</dt><dd>' +
        fmtDate(data.last_sign_in_at) +
        '</dd>' +
        '<dt>Published</dt><dd>' +
        fmtDate(data.published_at) +
        '</dd></dl></section>' +
        '<section class="admin-dash-card"><h4>Contact & location</h4><dl class="admin-dl">' +
        '<dt>Phone</dt><dd>' +
        esc(contact.phone || '—') +
        '</dd>' +
        '<dt>Email</dt><dd>' +
        esc(contact.email || '—') +
        '</dd>' +
        '<dt>Instagram</dt><dd>' +
        esc(contact.instagram || '—') +
        '</dd>' +
        '<dt>Address</dt><dd>' +
        esc([contact.address, contact.city, contact.state].filter(Boolean).join(', ') || '—') +
        '</dd>' +
        '<dt>Timezone</dt><dd>' +
        esc(contact.timezone || '—') +
        '</dd></dl></section>' +
        '<section class="admin-dash-card"><h4>RevenueCat subscription</h4>' +
        subscriptionDetailHtml(sub) +
        '</section>' +
        '<section class="admin-dash-card"><h4>Stripe Connect</h4><dl class="admin-dl">' +
        '<dt>Charges</dt><dd>' +
        (stripe.charges_enabled ? 'Enabled' : 'No') +
        '</dd>' +
        '<dt>Payouts</dt><dd>' +
        (stripe.payouts_enabled ? 'Enabled' : 'No') +
        '</dd>' +
        '<dt>Available</dt><dd>' +
        (stripe.balance_available_cents != null ? fmtMoney(stripe.balance_available_cents / 100) : '—') +
        '</dd>' +
        '<dt>Pending</dt><dd>' +
        (stripe.balance_pending_cents != null ? fmtMoney(stripe.balance_pending_cents / 100) : '—') +
        '</dd></dl></section>' +
        '<section class="admin-dash-card"><h4>Onboarding survey</h4>' +
        (survey
          ? '<dl class="admin-dl"><dt>Heard from</dt><dd>' +
            esc(survey.heardFrom || '—') +
            '</dd><dt>Why Styld</dt><dd>' +
            esc((survey.whyStyld || []).join(', ') || '—') +
            '</dd><dt>Dream outcome</dt><dd>' +
            esc(survey.dreamOutcome || '—') +
            '</dd></dl>'
          : '<p class="admin-muted">No survey responses.</p>') +
        (biz
          ? '<dl class="admin-dl admin-dl--spaced"><dt>Business</dt><dd>' +
            esc(biz.name || '—') +
            '</dd><dt>Phone</dt><dd>' +
            esc(biz.phone || '—') +
            '</dd></dl>'
          : '') +
        '</section>' +
        '<section class="admin-dash-card admin-dash-card--wide"><h4>Booking & payments config</h4><pre class="admin-json">' +
        esc(JSON.stringify({ booking_payment: data.booking_payment, booking_hours: data.booking_hours, cancellation_policy: data.cancellation_policy }, null, 2)) +
        '</pre></section>' +
        '<section class="admin-dash-card admin-dash-card--wide"><h4>Inquiries (' +
        (data.inquiries || []).length +
        ')</h4><pre class="admin-json">' +
        esc(JSON.stringify(data.inquiries || [], null, 2)) +
        '</pre></section></div>'
      );
    }

    return '';
  }

  function renderBookingsMiniTable(bookings) {
    if (!bookings.length) return '<p class="admin-muted">No bookings yet.</p>';
    return (
      '<ul class="admin-booking-list">' +
      bookings
        .map(function (b) {
          var when = fmtApptParts(b.appointment_starts_at || b.created_at);
          var service = b.style_name || 'Service';
          var payLabel = paymentStatusLabel(b.payment_status);
          return (
            '<li class="admin-booking-row">' +
            '<div class="admin-booking-row__when">' +
            '<span class="admin-booking-row__weekday">' +
            esc(when.weekday) +
            '</span>' +
            '<strong class="admin-booking-row__date">' +
            esc(when.date) +
            '</strong>' +
            '<span class="admin-booking-row__time">' +
            esc(when.time) +
            '</span>' +
            '</div>' +
            '<div class="admin-booking-row__main">' +
            '<strong class="admin-booking-row__client">' +
            esc(b.full_name || 'Client') +
            '</strong>' +
            '<span class="admin-booking-row__service" title="' +
            esc(service) +
            '">' +
            esc(truncate(service, 42)) +
            '</span>' +
            '</div>' +
            '<div class="admin-booking-row__end">' +
            '<span class="admin-pill ' +
            bookingStatusClass(b.booking_status) +
            '">' +
            esc(bookingStatusLabel(b.booking_status)) +
            '</span>' +
            (payLabel
              ? '<span class="admin-pill admin-pill--neutral admin-pill--soft">' + esc(payLabel) + '</span>'
              : '') +
            '<strong class="admin-booking-row__total">' +
            fmtMoney(b.estimated_total) +
            '</strong>' +
            '</div>' +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderBookingsFullTable(bookings) {
    if (!bookings.length) return '<p class="admin-muted">No bookings yet.</p>';
    return (
      '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Appointment</th><th>Client</th><th>Service</th><th>Status</th><th>Payment</th><th>Total</th><th>Deposit</th></tr></thead><tbody>' +
      bookings
        .map(function (b) {
          return (
            '<tr><td>' +
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
    state.salonTab = tab;
    document.querySelectorAll('.admin-salon-tab').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-salon-tab') === tab);
    });
    if (els.salonTabPanel && state.salonData) {
      els.salonTabPanel.innerHTML = renderSalonTab(state.salonData, tab);
    }
  }

  function renderSalonDashboard(data) {
    if (els.salonSummary) {
      els.salonSummary.innerHTML = renderSalonSummary(data);
    }
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
      if (e.key === 'Escape') {
        if (state.salonData) closeSalonDashboard();
        else closeDrawer();
      }
    });

    if (els.salonBack) {
      els.salonBack.addEventListener('click', closeSalonDashboard);
    }

    document.querySelectorAll('.admin-salon-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSalonTab(btn.getAttribute('data-salon-tab'));
      });
    });
  }

  function init() {
    if (!state.pin) {
      window.location.href = '/marketing/index.html?admin=required';
      return;
    }

    els = {
      salonsGrid: $('admin-salons-grid'),
      salonView: $('admin-salon-view'),
      salonViewTitle: $('admin-salon-view-title'),
      salonViewSub: $('admin-salon-view-sub'),
      salonViewLink: $('admin-salon-view-link'),
      salonSummary: $('admin-salon-summary'),
      salonTabPanel: $('admin-salon-tab-panel'),
      salonBack: $('admin-salon-back'),
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
