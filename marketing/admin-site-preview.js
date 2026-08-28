(function () {
  var PIN_KEY = 'styld_admin_pin';
  var PREVIEW_KEY = 'styld_admin_site_preview';
  var PREVIEW_PAGES = [
    { id: 'home', label: 'Home', path: '/tenant/profile.html' },
    { id: 'book', label: 'Book', path: '/tenant/book.html' },
    { id: 'portfolio', label: 'Portfolio', path: '/tenant/portfolio.html' },
    { id: 'certifications', label: 'Certifications', path: '/tenant/certifications.html' },
    { id: 'products', label: 'Shop', path: '/tenant/products.html' },
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPin() {
    try {
      return sessionStorage.getItem(PIN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function getCfg() {
    return window.__STYLD_MARKETING__ || window.__STYLD_TENANT__ || {};
  }

  function api(action, filters, pin) {
    var cfg = getCfg();
    var url = (cfg.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/styld-admin-dashboard';
    return fetch(url, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey || '',
        Authorization: 'Bearer ' + (cfg.supabaseAnonKey || ''),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: action, pin: pin, filters: filters || {} }),
    }).then(function (res) {
      return res.json();
    });
  }

  function setStatus(text, isError) {
    var el = $('admin-preview-status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('admin-site-preview__status--error', !!isError);
  }

  function savePreviewPayload(payload) {
    sessionStorage.setItem(
      PREVIEW_KEY,
      JSON.stringify({
        userId: payload.user_id,
        brandName: payload.brand_name,
        subdomain: payload.subdomain,
        publishedAt: payload.published_at,
        publicUrl: payload.public_url,
        savedAt: Date.now(),
        records: payload.records || [],
      }),
    );
  }

  function previewFrameUrl(userId, pagePath) {
    return pagePath + '?styld_admin_preview=' + encodeURIComponent(userId);
  }

  function renderPageNav(userId, activePath) {
    var nav = $('admin-preview-pages');
    if (!nav) return;
    nav.innerHTML = PREVIEW_PAGES.map(function (page) {
      var active = page.path === activePath ? ' is-active' : '';
      return (
        '<button type="button" class="admin-site-preview__page' +
        active +
        '" data-preview-path="' +
        esc(page.path) +
        '">' +
        esc(page.label) +
        '</button>'
      );
    }).join('');

    nav.querySelectorAll('[data-preview-path]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var path = btn.getAttribute('data-preview-path');
        loadFrame(userId, path);
        nav.querySelectorAll('.admin-site-preview__page').forEach(function (item) {
          item.classList.toggle('is-active', item === btn);
        });
      });
    });
  }

  function loadFrame(userId, pagePath) {
    var frame = $('admin-preview-frame');
    if (!frame) return;
    frame.src = previewFrameUrl(userId, pagePath || '/tenant/profile.html');
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var userId = String(params.get('user_id') || '').trim();
    var pin = getPin();

    if (!pin) {
      window.location.href = '/marketing/admin.html';
      return;
    }
    if (!userId) {
      setStatus('Missing user_id in URL.', true);
      return;
    }

    setStatus('Loading site data from database…');
    api('site_preview', { user_id: userId }, pin)
      .then(function (data) {
        if (data.error && !data.has_content) {
          throw new Error(data.error);
        }
        if (data.error) throw new Error(data.error);
        if (!data.records || !data.records.length) {
          throw new Error('No site records found for this pro.');
        }

        savePreviewPayload(data);

        var title = $('admin-preview-title');
        var sub = $('admin-preview-sub');
        var notice = $('admin-preview-notice');
        var live = $('admin-preview-live-link');

        if (title) title.textContent = (data.brand_name || 'Pro') + ' · Preview';
        if (sub) {
          var bits = [];
          if (data.subdomain) bits.push(data.subdomain + '.styldd.com');
          else bits.push('No subdomain yet');
          bits.push(data.published_at ? 'Live' : 'Draft / unpublished');
          sub.textContent = bits.join(' · ');
        }

        if (notice) {
          notice.hidden = false;
          notice.textContent = data.published_at
            ? 'Admin preview from saved database content. Live site may match when published.'
            : 'Admin preview — this pro has not published yet. Showing saved editor content from the database.';
        }

        if (live) {
          if (data.public_url && data.published_at) {
            live.href = data.public_url;
            live.hidden = false;
          } else {
            live.hidden = true;
          }
        }

        renderPageNav(userId, '/tenant/profile.html');
        loadFrame(userId, '/tenant/profile.html');
        setStatus('');
      })
      .catch(function (err) {
        setStatus((err && err.message) || 'Could not load preview.', true);
      });
  }

  init();
})();
