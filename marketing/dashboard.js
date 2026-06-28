(function () {
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    if (isNaN(n)) return String(v);
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtCount(v) {
    if (v == null || v === '') return '—';
    var n = Number(v);
    if (isNaN(n)) return String(v);
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function fmtDate(value) {
    if (!value) return '—';
    var d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function statCards(items) {
    return (
      '<div class="dash-stat-grid">' +
      items
        .map(function (item) {
          return (
            '<article class="dash-stat-card">' +
            '<span class="dash-stat-card__label">' +
            esc(item.label) +
            '</span>' +
            '<strong class="dash-stat-card__value">' +
            esc(item.value) +
            '</strong>' +
            (item.hint ? '<small class="dash-stat-card__hint">' + esc(item.hint) + '</small>' : '') +
            '</article>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function barChartHtml(items, labelKey, valueKey, maxItems) {
    items = items || [];
    if (!items.length) return '<p class="dash-muted">No data yet.</p>';
    var max = 1;
    items.forEach(function (item) {
      var v = Number(item[valueKey]) || 0;
      if (v > max) max = v;
    });
    return (
      '<div class="dash-chart-bars">' +
      items
        .slice(0, maxItems || 10)
        .map(function (item) {
          var val = Number(item[valueKey]) || 0;
          var pct = Math.max(4, Math.round((val / max) * 100));
          return (
            '<div class="dash-chart-row">' +
            '<span class="dash-chart-label">' +
            esc(item[labelKey]) +
            '</span>' +
            '<div class="dash-chart-track"><div class="dash-chart-fill" style="width:' +
            pct +
            '%"></div></div>' +
            '<span class="dash-chart-val">' +
            esc(fmtCount(val)) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function sparklineHtml(daily) {
    daily = daily || [];
    if (!daily.length) return '<p class="dash-muted">No page views in the last 30 days.</p>';
    var max = 1;
    daily.forEach(function (d) {
      if ((d.views || 0) > max) max = d.views;
    });
    return (
      '<div class="dash-sparkline">' +
      daily
        .map(function (d) {
          var h = Math.max(4, Math.round(((d.views || 0) / max) * 100));
          return (
            '<div class="dash-sparkline__col" title="' +
            esc(d.day + ': ' + (d.views || 0) + ' views') +
            '"><div class="dash-sparkline__bar" style="height:' +
            h +
            '%"></div><span class="dash-sparkline__day">' +
            esc(String(d.day || '').slice(5)) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderHero(data) {
    var name = data.brand_name || 'Your business';
    var email = (data.profile && data.profile.email) || '';
    var logo = data.logo_url
      ? '<img class="dash-hero__logo" src="' + esc(data.logo_url) + '" alt="" width="72" height="72" decoding="async">'
      : '<div class="dash-hero__logo dash-hero__logo--placeholder" aria-hidden="true">' + esc(name.charAt(0)) + '</div>';

    return (
      '<section class="dash-hero">' +
      logo +
      '<div class="dash-hero__copy">' +
      '<h1>' +
      esc(name) +
      '</h1>' +
      (email ? '<p class="dash-muted">' + esc(email) + '</p>' : '') +
      (data.public_url
        ? '<a class="dash-site-link" href="' + esc(data.public_url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(data.public_url) +
          ' ↗</a>'
        : '<p class="dash-muted">Publish your booking site in the Styld app to go live.</p>') +
      '</div></section>'
    );
  }

  function renderSummary(data) {
    var rev = data.revenue_summary || {};
    var a = data.analytics || {};
    var sub = data.subscription || {};

    return (
      renderHero(data) +
      statCards([
        { label: 'Total revenue', value: fmtMoney(rev.gross) },
        { label: 'Collected', value: fmtMoney(rev.collected) },
        { label: 'Bookings', value: fmtCount(rev.booking_count) },
        { label: 'Clients', value: fmtCount(rev.unique_clients) },
        { label: 'Site views (30d)', value: fmtCount(a.views_30d) },
        { label: 'Reviews', value: fmtCount(a.reviews_count), hint: a.reviews_avg_rating ? a.reviews_avg_rating + ' avg' : '' },
        { label: 'Menu services', value: fmtCount(data.style_count) },
        { label: 'Subscription', value: sub.plan_label || sub.status || '—' },
      ])
    );
  }

  function renderAnalytics(data) {
    var a = data.analytics || {};
    return (
      '<section class="dash-section">' +
      '<h2>Site analytics</h2>' +
      statCards([
        { label: 'Views (7d)', value: fmtCount(a.views_7d) },
        { label: 'Views (30d)', value: fmtCount(a.views_30d) },
        { label: 'Views (90d)', value: fmtCount(a.views_90d) },
      ]) +
      '<div class="dash-grid">' +
      '<article class="dash-card dash-card--wide"><h3>Daily page views</h3>' +
      sparklineHtml(a.daily_views) +
      '</article>' +
      '<article class="dash-card"><h3>Top pages</h3>' +
      barChartHtml(a.top_paths, 'path', 'views', 8) +
      '</article>' +
      '<article class="dash-card"><h3>Page type</h3>' +
      barChartHtml(a.by_page_type, 'page_type', 'views', 6) +
      '</article>' +
      '<article class="dash-card"><h3>Top services</h3>' +
      barChartHtml(a.top_services, 'name', 'count', 8) +
      '</article>' +
      '</div></section>'
    );
  }

  function renderBookings(data) {
    var bookings = data.bookings || [];
    if (!bookings.length) {
      return (
        '<section class="dash-section"><h2>Recent bookings</h2><p class="dash-muted">No bookings yet.</p></section>'
      );
    }

    var rows = bookings
      .slice(0, 12)
      .map(function (b) {
        var when = b.appointment_starts_at || b.appointment_date || b.created_at;
        return (
          '<tr>' +
          '<td>' +
          esc(b.style_name || 'Service') +
          '</td>' +
          '<td>' +
          esc(b.full_name || b.email || 'Client') +
          '</td>' +
          '<td>' +
          esc(fmtDate(when)) +
          '</td>' +
          '<td><span class="dash-pill">' +
          esc(b.booking_status || '—') +
          '</span></td>' +
          '<td>' +
          esc(b.payment_status || '—') +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<section class="dash-section">' +
      '<h2>Recent bookings</h2>' +
      '<div class="dash-table-wrap"><table class="dash-table">' +
      '<thead><tr><th>Service</th><th>Client</th><th>When</th><th>Status</th><th>Payment</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table></div>' +
      '<p class="dash-footnote">Open the Styld app for full booking management.</p></section>'
    );
  }

  function renderReviews(data) {
    var reviews = data.reviews || [];
    if (!reviews.length) {
      return (
        '<section class="dash-section"><h2>Recent reviews</h2><p class="dash-muted">No reviews yet.</p></section>'
      );
    }

    var items = reviews
      .map(function (r) {
        return (
          '<article class="dash-review">' +
          '<div class="dash-review__head">' +
          '<strong>' +
          esc(r.client_name || 'Client') +
          '</strong>' +
          '<span>' +
          esc(r.rating != null ? r.rating + ' ★' : '') +
          '</span></div>' +
          (r.comment ? '<p>' + esc(r.comment) + '</p>' : '') +
          '<small class="dash-muted">' +
          esc(fmtDate(r.created_at)) +
          '</small></article>'
        );
      })
      .join('');

    return '<section class="dash-section"><h2>Recent reviews</h2><div class="dash-review-list">' + items + '</div></section>';
  }

  function renderDashboard(data) {
    return renderSummary(data) + renderAnalytics(data) + renderBookings(data) + renderReviews(data);
  }

  var statusEl = document.getElementById('dash-status');
  var contentEl = document.getElementById('dash-content');
  var loadingEl = document.getElementById('dash-loading');
  var refreshBtn = document.getElementById('dash-refresh');
  var signoutBtn = document.getElementById('dash-signout');

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.hidden = !msg;
    statusEl.classList.toggle('dash-status--error', !!isError);
  }

  function setLoading(loading) {
    if (loadingEl) loadingEl.hidden = !loading;
    if (contentEl && loading) contentEl.hidden = true;
    if (refreshBtn) refreshBtn.disabled = loading;
  }

  function loadDashboard() {
    setStatus('');
    setLoading(true);

    return window.StyldMarketingAuth.ownerDashboard()
      .then(function (data) {
        if (contentEl) {
          contentEl.innerHTML = renderDashboard(data);
          contentEl.hidden = false;
        }
        document.title = (data.brand_name || 'My dashboard') + ' — Styld';
      })
      .catch(function (err) {
        if (err && err.message === 'not_authenticated') return;
        if (err && err.message === 'redirecting') return;
        setStatus((err && err.message) || 'Could not load dashboard.', true);
      })
      .finally(function () {
        setLoading(false);
      });
  }

  window.StyldMarketingAuth.requireAuth('/login').then(loadDashboard);

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadDashboard);
  }

  if (signoutBtn) {
    signoutBtn.addEventListener('click', function () {
      window.StyldMarketingAuth.signOut().finally(function () {
        window.location.href = '/login';
      });
    });
  }
})();
