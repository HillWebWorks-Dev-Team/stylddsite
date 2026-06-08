(function loadStyldTenantSite() {
  var cfg = window.__STYLD_TENANT__ || {};
  var rootDomain = cfg.rootDomain || 'styldd.com';
  var host = (window.location.hostname || '').toLowerCase();
  var subdomain = new URLSearchParams(window.location.search).get('subdomain');
  var offlineMessage =
    (window.StyldTenant && window.StyldTenant.SITE_OFFLINE_MESSAGE) ||
    'This site is temporarily offline. The owner needs an active Styld subscription to keep their booking site live.';

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
    var url = cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path;
    return fetch(url, { headers: headers, cache: 'no-store' }).then(function (res) {
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
    var sizes = { sm: 'SMALL', md: 'MEDIUM', lg: 'LARGE' };
    return sizes[last] || '';
  }

  function pageTypeFromPath(path) {
    var clean = String(path || '/').toLowerCase();
    if (clean === '/' || clean.indexOf('profile') !== -1) return 'profile';
    if (clean.indexOf('booking') !== -1) return 'booking';
    return 'other';
  }

  function trackPageView(tenantSubdomain) {
    var path = location.pathname || '/';
    var sessionKey = 'styld:pv:' + tenantSubdomain + ':' + path;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, '1');
    } catch (err) {
      /* sessionStorage unavailable */
    }

    fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/styld_site_page_views', {
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({
        subdomain: tenantSubdomain,
        path: path,
        page_type: pageTypeFromPath(path),
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(function () {});
  }

  Promise.all([
    rest('styld_site_subdomains?subdomain=eq.' + encodeURIComponent(subdomain) + '&select=user_id,published_at'),
    Promise.resolve(null),
  ])
    .then(function (results) {
      var rows = results[0];
      var row = rows && rows[0];
      if (!row || !row.published_at) {
        throw new Error(offlineMessage);
      }
      trackPageView(subdomain);
      return rest(
        'styld_site_records?user_id=eq.' +
          encodeURIComponent(row.user_id) +
          '&select=id,record_type,record_key,data,created_at',
      );
    })
    .then(function (records) {
      var content = null;
      var theme = { heroLayout: 'split', heroImageUrl: null, logoImageUrl: null };
      var meta = {};
      var prices = {};
      var covers = {};
      var reviewsSettings = { enabled: true };
      var reviews = [];

      records.forEach(function (record) {
        var value = settingValue(record);
        if (record.record_type === 'site_setting' && record.record_key === 'site_content') content = value;
        if (record.record_type === 'site_setting' && record.record_key === 'site_theme') theme = Object.assign(theme, value || {});
        if (record.record_type === 'site_setting' && record.record_key === 'style_catalog_meta') meta = value || {};
        if (record.record_type === 'site_setting' && record.record_key === 'style_price_overrides') prices = value || {};
        if (record.record_type === 'site_setting' && record.record_key === 'reviews_settings') {
          reviewsSettings = value || reviewsSettings;
        }
        if (record.record_type === 'review') {
          var reviewData = record.data && typeof record.data === 'object' ? record.data : value;
          if (reviewData && reviewData.published !== false) {
            reviews.push({
              id: record.id,
              clientName: reviewData.client_name || '',
              rating: reviewData.rating || 5,
              message: reviewData.message || '',
              createdAt: reviewData.created_at || record.created_at || null,
            });
          }
        }
        if (record.record_type === 'style_cover_image' && record.record_key) {
          var coverPath = coverStoragePath(value);
          if (typeof coverPath === 'string') covers[record.record_key] = coverPath;
        }
      });

      if (!content) {
        throw new Error('Site content not found.');
      }

      var templateId = 'profile';

      window.__STYLD_SITE_CONTENT__ = content;
      var heroStackImagePaths = Array.isArray(theme.heroStackImagePaths) ? theme.heroStackImagePaths : [];
      window.__STYLD_SITE_THEME__ = {
        heroLayout: theme.heroLayout || 'split',
        heroImagePosition: theme.heroImagePosition || 'center top',
        heroImageUrl: coverUrl(theme.heroImagePath),
        logoImageUrl: coverUrl(theme.logoImagePath),
        heroStackImageUrls: heroStackImagePaths.map(function(p) { return coverUrl(p); }).filter(Boolean),
        primaryColor: theme.primaryColor || null,
        secondaryColor: theme.secondaryColor || null,
        navbarColor: theme.navbarColor || null,
        cardOutlineColor: theme.cardOutlineColor || null,
        styleCardLayout: theme.styleCardLayout || 'card',
        fontFamily: theme.fontFamily || 'cormorant',
        hideBookNowButton: !!theme.hideBookNowButton,
        templateId: templateId,
      };

      (function applyTheme() {
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
        root.style.setProperty('--nav-text', secondary);

        var secRgb = hexToRgb(secondary);
        if (secRgb) {
          var r = secRgb[0], g = secRgb[1], b = secRgb[2];
          root.style.setProperty('--muted', 'rgba(' + r + ',' + g + ',' + b + ',0.62)');
          root.style.setProperty('--muted-soft', 'rgba(' + r + ',' + g + ',' + b + ',0.46)');
        }

        var bg = (theme.backgroundColor || '').trim();
        if (bg && /^#[0-9a-fA-F]{6}$/.test(bg)) {
          root.style.setProperty('--cream', bg);
          root.style.setProperty('--white', bg);
          document.body.style.backgroundColor = bg;
        }

        function colorLuminance(hex) {
          var rgb = hexToRgb(hex);
          if (!rgb) return null;
          return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
        }

        var cardSurface = '#fafafa';
        if (bg && /^#[0-9a-fA-F]{6}$/.test(bg)) {
          cardSurface = bg;
        } else {
          var inkLum = colorLuminance(secondary);
          if (inkLum != null && inkLum > 0.55) {
            cardSurface = '#0a0a0a';
            root.style.setProperty('--cream', cardSurface);
            root.style.setProperty('--white', cardSurface);
            document.body.style.backgroundColor = cardSurface;
          }
        }
        root.style.setProperty('--card-surface', cardSurface);

        var surfaceLum = colorLuminance(cardSurface);
        var isDarkSurface = surfaceLum != null && surfaceLum < 0.35;
        root.classList.toggle('theme-dark-surface', isDarkSurface);
        if (isDarkSurface) {
          root.style.setProperty('--review-card-border', 'rgba(255, 255, 255, 0.12)');
          root.style.setProperty('--review-card-border-hover', 'rgba(255, 255, 255, 0.22)');
          root.style.setProperty('--review-star-empty', 'rgba(255, 255, 255, 0.22)');
        } else {
          root.style.setProperty('--review-card-border', 'rgba(0, 0, 0, 0.08)');
          root.style.setProperty('--review-card-border-hover', 'rgba(219, 39, 119, 0.22)');
          root.style.setProperty('--review-star-empty', 'rgba(0, 0, 0, 0.15)');
        }

        var navBg = (theme.navbarColor || '').trim();
        if (navBg && /^#[0-9a-fA-F]{6}$/.test(navBg)) {
          root.style.setProperty('--nav-bg', navBg);
          root.style.setProperty('--nav-bg-solid', navBg);
        }

        var cardOutline = (theme.cardOutlineColor || theme.secondaryColor || secondary || '').trim();
        if (cardOutline && /^#[0-9a-fA-F]{6}$/.test(cardOutline)) {
          root.style.setProperty('--card-outline', cardOutline);
        }

        var validPositions = ['center top', 'center center', 'center bottom'];
        var heroPos = (theme.heroImagePosition || '').trim();
        if (validPositions.indexOf(heroPos) !== -1) {
          root.style.setProperty('--hero-img-position', heroPos);
        }

        var fontDisplayMap = {
          'cormorant': '"Cormorant Garamond", Georgia, serif',
          'playfair': '"Playfair Display", Georgia, serif',
          'inter': 'Inter, system-ui, sans-serif',
          'dm-sans': '"DM Sans", system-ui, sans-serif',
          'montserrat': 'Montserrat, system-ui, sans-serif',
          'lora': '"Lora", Georgia, serif',
          'poppins': 'Poppins, system-ui, sans-serif',
          'nunito': '"Nunito", system-ui, sans-serif',
        };
        var fontBodyMap = {
          'cormorant': '"Source Sans 3", system-ui, sans-serif',
          'playfair': '"Source Sans 3", system-ui, sans-serif',
          'inter': 'Inter, system-ui, sans-serif',
          'dm-sans': '"DM Sans", system-ui, sans-serif',
          'montserrat': 'Montserrat, system-ui, sans-serif',
          'lora': '"Source Sans 3", system-ui, sans-serif',
          'poppins': 'Poppins, system-ui, sans-serif',
          'nunito': '"Nunito", system-ui, sans-serif',
        };
        var fontId = theme.fontFamily || 'cormorant';
        root.style.setProperty('--font-display', fontDisplayMap[fontId] || fontDisplayMap['cormorant']);
        root.style.setProperty('--font-body', fontBodyMap[fontId] || fontBodyMap['cormorant']);
      })();

      var styleIds = {};
      Object.keys(meta || {}).forEach(function (id) { styleIds[id] = true; });
      Object.keys(prices || {}).forEach(function (id) { styleIds[id] = true; });
      Object.keys(covers || {}).forEach(function (id) { styleIds[id] = true; });

      var logoFallbackUrl = coverUrl(theme.logoImagePath);

      var styles = Object.keys(styleIds)
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
            imageUrl: coverUrl(covers[styleId]) || logoFallbackUrl,
            category: item.category || '',
          };
        });

      window.__STYLD_SITE_STYLES__ = styles;
      window.__STYLD_REVIEWS_SETTINGS__ = {
        enabled: reviewsSettings.enabled !== false,
      };
      window.__STYLD_SITE_REVIEWS__ = reviews.sort(function (a, b) {
        var aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        var bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

      if (theme.hideBookNowButton) {
        document.querySelectorAll('.profile-book-btn').forEach(function (btn) {
          btn.style.display = 'none';
        });
      }

      if (statusEl) statusEl.hidden = true;
      if (window.applyStyldPreviewContent) {
        window.applyStyldPreviewContent();
      }
      if (window.initStyldSiteReviews) {
        window.initStyldSiteReviews();
      }

      if (theme.hideBookNowButton) {
        document.querySelectorAll('.profile-book-btn').forEach(function (btn) {
          btn.style.display = 'none';
        });
      }

      var logo = document.querySelector('.hero-brand__logo');
      if (logo && window.__STYLD_SITE_THEME__.logoImageUrl) {
        logo.src = window.__STYLD_SITE_THEME__.logoImageUrl;
      }

      var logoUrl = window.__STYLD_SITE_THEME__.logoImageUrl;
      if (logoUrl) {
        var favicon = document.querySelector("link[rel='icon']") || document.createElement('link');
        favicon.rel = 'icon';
        favicon.href = logoUrl;
        if (!favicon.parentNode) document.head.appendChild(favicon);
      }

      document.title = (content.brandName || subdomain) + ' | Book online';
    })
    .catch(function (err) {
      showError(err && err.message ? err.message : 'Site not found.');
    });
})();
