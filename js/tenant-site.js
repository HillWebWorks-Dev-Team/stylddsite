(function loadStyldTenantSite() {
  var cfg = window.__STYLD_TENANT__ || {};
  var rootDomain = cfg.rootDomain || 'styldd.com';
  var host = (window.location.hostname || '').toLowerCase();
  var subdomain = new URLSearchParams(window.location.search).get('subdomain');

  if (!subdomain && host.endsWith('.' + rootDomain) && host !== rootDomain && host !== 'www.' + rootDomain) {
    subdomain = host.slice(0, -(rootDomain.length + 1));
  }

  var statusEl = document.getElementById('tenant-status');

  function showError(message) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = message;
    }
    document.body.classList.add('tenant-error');
  }

  if (!subdomain) {
    showError('Site not found.');
    return;
  }

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    showError('This site host is not configured yet. Redeploy templatesite with Styld Supabase env vars.');
    return;
  }

  var headers = {
    apikey: cfg.supabaseAnonKey,
    Authorization: 'Bearer ' + cfg.supabaseAnonKey,
  };

  function rest(path) {
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, { headers: headers }).then(function (res) {
      if (!res.ok) throw new Error('Could not load site data.');
      return res.json();
    });
  }

  function settingValue(row) {
    if (!row || !row.data || typeof row.data !== 'object') return null;
    if (row.data.value != null) return row.data.value;
    return row.data;
  }

  function coverStoragePath(value) {
    if (!value || typeof value !== 'object') {
      return typeof value === 'string' ? value : null;
    }
    return value.storage_path || value.storagePath || null;
  }

  function coverUrl(path) {
    if (!path) return null;
    return cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + String(path).replace(/^\/+/, '');
  }

  function formatPrice(amount) {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) return 'Price TBD';
    return '$' + Math.round(amount);
  }

  function normalizeDurationMinutes(value) {
    var parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return 120;
    return Math.min(720, Math.max(15, Math.round(parsed)));
  }

  function formatStyleDuration(minutes) {
    var mins = normalizeDurationMinutes(minutes);
    var hours = Math.floor(mins / 60);
    var remainder = mins % 60;
    if (hours <= 0) return remainder + ' min';
    if (remainder === 0) return hours === 1 ? '1 hr' : hours + ' hrs';
    if (hours === 1) return '1 hr ' + remainder + ' min';
    return hours + ' hrs ' + remainder + ' min';
  }

  function sizeLabelFromStyleId(styleId) {
    var parts = String(styleId || '').split('-');
    var last = parts[parts.length - 1];
    var sizes = {
      sm: 'SMALL',
      md: 'MEDIUM',
      lg: 'LARGE',
    };
    return sizes[last] || '';
  }

  Promise.all([
    rest('styld_site_subdomains?subdomain=eq.' + encodeURIComponent(subdomain) + '&select=user_id,published_at'),
    Promise.resolve(null),
  ])
    .then(function (results) {
      var rows = results[0];
      var row = rows && rows[0];
      if (!row || !row.published_at) {
        throw new Error('This site has not been published yet.');
      }
      return rest(
        'styld_site_records?user_id=eq.' +
          encodeURIComponent(row.user_id) +
          '&select=record_type,record_key,data',
      );
    })
    .then(function (records) {
      var content = null;
      var theme = { heroLayout: 'split', heroImageUrl: null, logoImageUrl: null };
      var meta = {};
      var prices = {};
      var covers = {};

      records.forEach(function (record) {
        var value = settingValue(record);
        if (record.record_type === 'site_setting' && record.record_key === 'site_content') content = value;
        if (record.record_type === 'site_setting' && record.record_key === 'site_theme') theme = Object.assign(theme, value || {});
        if (record.record_type === 'site_setting' && record.record_key === 'style_catalog_meta') meta = value || {};
        if (record.record_type === 'site_setting' && record.record_key === 'style_price_overrides') prices = value || {};
        if (record.record_type === 'style_cover_image' && record.record_key) {
          var coverPath = coverStoragePath(value);
          if (typeof coverPath === 'string') covers[record.record_key] = coverPath;
        }
      });

      if (!content) {
        throw new Error('Site content not found.');
      }

      window.__STYLD_SITE_CONTENT__ = content;
      window.__STYLD_SITE_THEME__ = {
        heroLayout: theme.heroLayout || 'split',
        heroImageUrl: coverUrl(theme.heroImagePath),
        logoImageUrl: coverUrl(theme.logoImagePath),
        primaryColor: theme.primaryColor || null,
        secondaryColor: theme.secondaryColor || null,
        styleCardLayout: theme.styleCardLayout || 'card',
      };

      // Apply brand colors as CSS variables
      if (theme.primaryColor || theme.secondaryColor) {
        (function applyBrandColors() {
          var primary = theme.primaryColor || '#db2777';
          var secondary = theme.secondaryColor || '#0a0a0a';

          function hexToRgb(hex) {
            var clean = hex.replace('#', '');
            if (clean.length !== 6) return null;
            return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
          }
          function darken(hex, factor) {
            var rgb = hexToRgb(hex);
            if (!rgb) return hex;
            return '#' + rgb.map(function(c){ return Math.max(0, Math.round(c * factor)).toString(16).padStart(2, '0'); }).join('');
          }
          function lighten(hex, factor) {
            var rgb = hexToRgb(hex);
            if (!rgb) return hex;
            return '#' + rgb.map(function(c){ return Math.min(255, Math.round(c + (255 - c) * factor)).toString(16).padStart(2, '0'); }).join('');
          }

          var root = document.documentElement;
          root.style.setProperty('--pink', primary);
          root.style.setProperty('--pink-dark', darken(primary, 0.68));
          root.style.setProperty('--pink-heading', lighten(primary, 0.1));
          root.style.setProperty('--hero-pink', lighten(primary, 0.22));
          root.style.setProperty('--hero-pink-deep', darken(primary, 0.68));
          root.style.setProperty('--pink-light', lighten(primary, 0.22));
          root.style.setProperty('--ink', secondary);
        })();
      }

      var styleIds = {};
      Object.keys(meta || {}).forEach(function (id) {
        styleIds[id] = true;
      });
      Object.keys(prices || {}).forEach(function (id) {
        styleIds[id] = true;
      });
      Object.keys(covers || {}).forEach(function (id) {
        styleIds[id] = true;
      });

      var styles = Object.keys(styleIds)
        .slice(0, 12)
        .map(function (styleId) {
          var item = meta[styleId] || {};
          var sizeLabel = item.sizeLabel || item.variant || sizeLabelFromStyleId(styleId);
        return {
          id: styleId,
          title: item.title || styleId,
          description: item.description || '',
          priceLabel: formatPrice(prices[styleId]),
          sizeLabel: sizeLabel || undefined,
          durationLabel: formatStyleDuration(item.durationMinutes),
          imageUrl: coverUrl(covers[styleId]),
        };
        });

      window.__STYLD_SITE_STYLES__ = styles;

      if (statusEl) statusEl.hidden = true;
      if (window.applyStyldPreviewContent) {
        window.applyStyldPreviewContent();
      }

      var logo = document.querySelector('.hero-brand__logo');
      if (logo && window.__STYLD_SITE_THEME__.logoImageUrl) {
        logo.src = window.__STYLD_SITE_THEME__.logoImageUrl;
      }

      document.title = (content.brandName || subdomain) + ' | Book online';
    })
    .catch(function (err) {
      showError(err && err.message ? err.message : 'Site not found.');
    });
})();
