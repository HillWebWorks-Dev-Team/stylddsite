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
    if (value == null) return null;
    if (typeof value === 'string') {
      var trimmed = value.trim();
      return trimmed || null;
    }
    if (typeof value === 'object') {
      var nested = value.storage_path || value.storagePath || value.path || value.url;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
    return null;
  }

  function coverUrl(path) {
    var storagePath = coverStoragePath(path);
    if (!storagePath) return null;
    if (storagePath.indexOf('http://') === 0 || storagePath.indexOf('https://') === 0) return storagePath;
    var objectPath = storagePath.replace(/^\/+/, '').replace(/^style-covers\//, '');
    return cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + objectPath;
  }

  function formatStylePriceRange(basePrice, addons) {
    if (window.StyldTenant && window.StyldTenant.formatStylePriceRange) {
      return window.StyldTenant.formatStylePriceRange(basePrice, addons);
    }
    if (typeof basePrice !== 'number' || Number.isNaN(basePrice) || basePrice <= 0) return 'Price TBD';
    return '$' + Math.round(basePrice);
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
      var heroStackImageFocus = Array.isArray(theme.heroStackImageFocus) ? theme.heroStackImageFocus : [];
      window.__STYLD_SITE_THEME__ = {
        heroLayout: theme.heroLayout || 'split',
        heroImagePosition: theme.heroImagePosition || 'center top',
        heroImageFocusX: theme.heroImageFocusX != null ? theme.heroImageFocusX : null,
        heroImageFocusY: theme.heroImageFocusY != null ? theme.heroImageFocusY : null,
        heroImageUrl: coverUrl(theme.heroImagePath),
        logoImageUrl: coverUrl(theme.logoImagePath),
        heroStackImageUrls: heroStackImagePaths.map(function(p) { return coverUrl(p); }),
        heroStackImageFocus: heroStackImageFocus,
        heroStackImageFormat: theme.heroStackImageFormat === 'tall' ? 'tall' : 'wide',
        primaryColor: theme.primaryColor || null,
        secondaryColor: theme.secondaryColor || null,
        navbarColor: theme.navbarColor || null,
        cardOutlineColor: theme.cardOutlineColor || null,
        styleCardLayout: theme.styleCardLayout || 'card',
        fontFamily: theme.fontFamily || 'cormorant',
        hideBookNowButton: !!theme.hideBookNowButton,
        templateId: templateId,
        textColors: theme.textColors && typeof theme.textColors === 'object' ? theme.textColors : null,
        textColorSources:
          theme.textColorSources && typeof theme.textColorSources === 'object' ? theme.textColorSources : null,
        heroCoverBlur: !!theme.heroCoverBlur,
        portfolioItems: Array.isArray(theme.portfolioItems) ? theme.portfolioItems : [],
        galleryImagePaths: Array.isArray(theme.galleryImagePaths) ? theme.galleryImagePaths : [],
      };

      if (window.StyldTenant && window.StyldTenant.applySiteTheme) {
        window.StyldTenant.applySiteTheme(theme);
      }

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
            priceLabel: formatStylePriceRange(prices[styleId], item.addons),
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
        document.querySelectorAll('.profile-nav .profile-book-btn').forEach(function (btn) {
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
        document.querySelectorAll('.profile-nav .profile-book-btn').forEach(function (btn) {
          btn.style.display = 'none';
        });
      }

      var logo = document.querySelector('.hero-brand__logo');
      if (logo && window.__STYLD_SITE_THEME__.logoImageUrl) {
        logo.src = window.__STYLD_SITE_THEME__.logoImageUrl;
      }

      var shareImageUrl = window.__STYLD_SITE_THEME__.logoImageUrl;
      if (window.StyldTenant && window.StyldTenant.resolveShareImageUrl) {
        shareImageUrl =
          window.StyldTenant.resolveShareImageUrl(theme, covers, cfg.supabaseUrl) || shareImageUrl;
      }
      if (window.StyldTenant && window.StyldTenant.applySiteShareBranding) {
        window.StyldTenant.applySiteShareBranding({
          brandName: content.brandName || subdomain,
          imageUrl: shareImageUrl,
          description:
            content.tagline ||
            content.heroDescription ||
            content.menuBlurb ||
            ('Book appointments with ' + (content.brandName || subdomain) + ' online.'),
          pageUrl: window.location.href,
        });
      } else {
        document.title = (content.brandName || subdomain) + ' | Book online';
      }
    })
    .catch(function (err) {
      showError(err && err.message ? err.message : 'Site not found.');
    });
})();
