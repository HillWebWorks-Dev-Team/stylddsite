(function () {
  var SITE_OFFLINE_MESSAGE =
    'This site is temporarily offline. The owner needs an active Styld subscription to keep their booking site live.';

  function getSubdomain() {
    var cfg = window.__STYLD_TENANT__ || {};
    var rootDomain = (cfg.rootDomain || 'styldd.com').toLowerCase();
    var host = (window.location.hostname || '').toLowerCase();
    var fromQuery = new URLSearchParams(window.location.search).get('subdomain');
    if (fromQuery) return fromQuery.trim().toLowerCase();

    if (host.endsWith('.' + rootDomain) && host !== rootDomain && host !== 'www.' + rootDomain) {
      return host.slice(0, -(rootDomain.length + 1));
    }
    return '';
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

  function sizeLabelFromStyleId(styleId) {
    var parts = String(styleId || '').split('-');
    var last = parts[parts.length - 1];
    var sizes = { sm: 'SMALL', md: 'MEDIUM', lg: 'LARGE' };
    return sizes[last] || '';
  }

  function styleBookingName(item, styleId) {
    var title = item.title || styleId;
    var variant = item.sizeLabel || item.variant || sizeLabelFromStyleId(styleId);
    var name = title;
    if (variant && variant !== 'STANDARD') name += ' · ' + variant;
    return name;
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

  function buildBookingStyles(meta, prices) {
    var styleIds = {};
    Object.keys(meta || {}).forEach(function (id) {
      styleIds[id] = true;
    });
    Object.keys(prices || {}).forEach(function (id) {
      styleIds[id] = true;
    });

    return Object.keys(styleIds)
      .map(function (styleId) {
        var item = meta[styleId] || {};
        var name = styleBookingName(item, styleId);
        var base = prices[styleId];
        if (typeof base !== 'number' || Number.isNaN(base)) base = 0;
        return {
          id: styleId,
          name: name,
          base: base,
          durationMinutes: normalizeDurationMinutes(item.durationMinutes),
        };
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
  }

  function buildCatalogCards(meta, prices, covers, supabaseUrl, logoImagePath) {
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

    function coverUrl(path) {
      if (!path || !supabaseUrl) return null;
      return supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + String(path).replace(/^\/+/, '');
    }

    var logoFallbackUrl = coverUrl(logoImagePath);

    function formatPrice(amount) {
      if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) return 'Price TBD';
      return '$' + Math.round(amount);
    }

    return Object.keys(styleIds).map(function (styleId) {
      var item = meta[styleId] || {};
      var variant = item.sizeLabel || item.variant || sizeLabelFromStyleId(styleId);
      return {
        id: styleId,
        title: item.title || styleId,
        sizeLabel: variant || '',
        durationLabel: formatStyleDuration(item.durationMinutes),
        priceLabel: formatPrice(prices[styleId]),
        imageUrl: coverUrl(covers[styleId]) || logoFallbackUrl,
      };
    });
  }

  function applySiteFooter(content) {
    var brandName = content && content.brandName ? String(content.brandName).trim() : '';
    var brandEl = document.getElementById('preview-footer-brand');
    if (brandEl && brandName) {
      brandEl.textContent = '\u00A9 ' + brandName;
    }
    var styldLink = document.getElementById('preview-footer-styld-link');
    if (styldLink) {
      var cfg = window.__STYLD_TENANT__ || {};
      styldLink.href = cfg.marketingUrl || 'https://styldd.com';
    }
  }

  function normalizeWeekdayHours(raw) {
    if (!raw || typeof raw !== 'object') return {};
    var source = raw.weekdayHours;
    if (!source || typeof source !== 'object') return {};

    var normalized = {};
    Object.keys(source).forEach(function (key) {
      var entry = source[key];
      if (!entry || typeof entry !== 'object') return;
      normalized[String(key)] = {
        startHour: entry.startHour != null ? Number(entry.startHour) : null,
        startMinute: entry.startMinute != null ? Number(entry.startMinute) : 0,
        endHour: entry.endHour != null ? Number(entry.endHour) : null,
        endMinute: entry.endMinute != null ? Number(entry.endMinute) : 0,
      };
    });
    return normalized;
  }

  function normalizeBookingHours(raw) {
    var defaults = {
      slotDayStartHour: 8,
      slotDayStartMinute: 0,
      slotDayEndHour: 19,
      slotDayEndMinute: 30,
      slotStepMinutes: 30,
      closedWeekdays: [],
      sameDayLeadMinutes: 4320,
      saturdayLastStartHour: 14,
      saturdayLastStartMinute: 0,
      concurrentAppointmentCapacity: 1,
    };

    raw = raw && typeof raw === 'object' ? raw : {};

    if (raw.days && typeof raw.days === 'object') {
      var legacyLead = defaults.sameDayLeadMinutes;
      if (raw.sameDayLeadMinutes != null) legacyLead = Number(raw.sameDayLeadMinutes);
      else if (raw.hoursInAdvance != null) legacyLead = Number(raw.hoursInAdvance) * 60;

      return Object.assign({}, defaults, {
        days: raw.days,
        sameDayLeadMinutes: Number.isFinite(legacyLead) ? legacyLead : defaults.sameDayLeadMinutes,
        hoursInAdvance: raw.hoursInAdvance,
        weekdayHours: normalizeWeekdayHours(raw),
        concurrentAppointmentCapacity:
          raw.concurrentAppointmentCapacity != null
            ? Number(raw.concurrentAppointmentCapacity)
            : defaults.concurrentAppointmentCapacity,
      });
    }

    return {
      slotDayStartHour:
        raw.slotDayStartHour != null ? Number(raw.slotDayStartHour) : defaults.slotDayStartHour,
      slotDayStartMinute:
        raw.slotDayStartMinute != null ? Number(raw.slotDayStartMinute) : defaults.slotDayStartMinute,
      slotDayEndHour: raw.slotDayEndHour != null ? Number(raw.slotDayEndHour) : defaults.slotDayEndHour,
      slotDayEndMinute:
        raw.slotDayEndMinute != null ? Number(raw.slotDayEndMinute) : defaults.slotDayEndMinute,
      slotStepMinutes:
        raw.slotStepMinutes != null ? Number(raw.slotStepMinutes) : defaults.slotStepMinutes,
      closedWeekdays: Array.isArray(raw.closedWeekdays)
        ? raw.closedWeekdays.map(Number)
        : defaults.closedWeekdays.slice(),
      weekdayHours: normalizeWeekdayHours(raw),
      sameDayLeadMinutes:
        raw.sameDayLeadMinutes != null
          ? Number(raw.sameDayLeadMinutes)
          : defaults.sameDayLeadMinutes,
      saturdayLastStartHour:
        raw.saturdayLastStartHour != null
          ? Number(raw.saturdayLastStartHour)
          : defaults.saturdayLastStartHour,
      saturdayLastStartMinute:
        raw.saturdayLastStartMinute != null
          ? Number(raw.saturdayLastStartMinute)
          : defaults.saturdayLastStartMinute,
      concurrentAppointmentCapacity:
        raw.concurrentAppointmentCapacity != null
          ? Number(raw.concurrentAppointmentCapacity)
          : defaults.concurrentAppointmentCapacity,
    };
  }

  function getBookingFormRequirements(bookingPayment) {
    var settings = bookingPayment && typeof bookingPayment === 'object' ? bookingPayment : {};
    var requireHair = settings.requireCurrentHairPhoto;
    if (requireHair == null) requireHair = settings.require_current_hair_photo;
    if (requireHair == null) requireHair = true;

    var requireRef = settings.requireReferencePhoto;
    if (requireRef == null) requireRef = settings.require_reference_photo;
    if (requireRef == null) requireRef = false;

    return {
      requireCurrentHairPhoto: requireHair !== false,
      requireReferencePhoto: requireRef === true,
    };
  }

  function resolveCancellationPolicySummary(cancellationPolicy, siteContent) {
    var policy =
      cancellationPolicy && typeof cancellationPolicy === 'object' ? cancellationPolicy : {};
    var summary = policy.policySummary || policy.policy_summary || '';
    if (summary && String(summary).trim()) {
      return String(summary).trim();
    }

    var hours = Number(policy.fullRefundNoticeHours || policy.full_refund_notice_hours);
    var appliesTo = String(policy.refundAppliesTo || policy.refund_applies_to || 'both').toLowerCase();
    if (Number.isFinite(hours) && hours > 0) {
      var windowLabel =
        hours >= 168
          ? Math.round(hours / 168) + ' day' + (Math.round(hours / 168) === 1 ? '' : 's')
          : hours >= 24
            ? Math.round(hours / 24) + ' hour' + (Math.round(hours / 24) === 1 ? '' : 's')
            : hours + ' hour' + (hours === 1 ? '' : 's');
      var scope =
        appliesTo === 'deposit'
          ? 'Online deposits are fully refunded'
          : appliesTo === 'full'
            ? 'Full online payments are fully refunded'
            : appliesTo === 'deposit_non_refundable' ||
                appliesTo === 'deposits_non_refundable' ||
                appliesTo === 'deposits-non-refundable'
              ? 'All deposits are non-refundable. Full online payments are fully refunded'
              : appliesTo === 'no_online_refunds' ||
                  appliesTo === 'none' ||
                  appliesTo === 'no-refunds'
                ? 'Deposits and full online payments are non-refundable. You may still cancel online anytime before your appointment'
                : 'Online deposits and full payments are fully refunded';
      if (
        appliesTo === 'no_online_refunds' ||
        appliesTo === 'none' ||
        appliesTo === 'no-refunds'
      ) {
        return scope + '.';
      }
      return (
        'You may cancel online anytime before your appointment. ' +
        scope +
        ' when you cancel at least ' +
        windowLabel +
        ' before your appointment time.'
      );
    }

    var content = siteContent && typeof siteContent === 'object' ? siteContent : {};
    if (content.bookingPolicy && String(content.bookingPolicy).trim()) {
      return String(content.bookingPolicy).trim();
    }

    return '';
  }

  function coverUrl(path, supabaseUrl) {
    if (!path || !supabaseUrl) return null;
    return (
      supabaseUrl.replace(/\/$/, '') +
      '/storage/v1/object/public/style-covers/' +
      String(path).replace(/^\/+/, '')
    );
  }

  function applySiteTheme(theme) {
    theme = theme && typeof theme === 'object' ? theme : {};
    var primary = theme.primaryColor || '#db2777';
    var secondary = theme.secondaryColor || '#0a0a0a';

    function hexToRgb(hex) {
      var clean = String(hex || '').replace('#', '');
      if (clean.length !== 6) return null;
      return [
        parseInt(clean.slice(0, 2), 16),
        parseInt(clean.slice(2, 4), 16),
        parseInt(clean.slice(4, 6), 16),
      ];
    }
    function darken(hex, factor) {
      var rgb = hexToRgb(hex);
      if (!rgb) return hex;
      return (
        '#' +
        rgb
          .map(function (c) {
            return Math.max(0, Math.round(c * factor)).toString(16).padStart(2, '0');
          })
          .join('')
      );
    }
    function lighten(hex, factor) {
      var rgb = hexToRgb(hex);
      if (!rgb) return hex;
      return (
        '#' +
        rgb
          .map(function (c) {
            return Math.min(255, Math.round(c + (255 - c) * factor)).toString(16).padStart(2, '0');
          })
          .join('')
      );
    }
    function colorLuminance(hex) {
      var rgb = hexToRgb(hex);
      if (!rgb) return null;
      return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
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
      var r = secRgb[0];
      var g = secRgb[1];
      var b = secRgb[2];
      root.style.setProperty('--muted', 'rgba(' + r + ',' + g + ',' + b + ',0.62)');
      root.style.setProperty('--muted-soft', 'rgba(' + r + ',' + g + ',' + b + ',0.46)');
    }

    var bg = (theme.backgroundColor || '').trim();
    if (bg && /^#[0-9a-fA-F]{6}$/.test(bg)) {
      root.style.setProperty('--cream', bg);
      root.style.setProperty('--white', bg);
      document.body.style.backgroundColor = bg;
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
    } else if (bg && /^#[0-9a-fA-F]{6}$/.test(bg)) {
      root.style.setProperty('--nav-bg', bg);
      root.style.setProperty('--nav-bg-solid', bg);
    }

    document.body.style.color = secondary;
    if (bg && /^#[0-9a-fA-F]{6}$/.test(bg)) {
      document.body.style.backgroundColor = bg;
    } else if (isDarkSurface) {
      document.body.style.backgroundColor = cardSurface;
    } else {
      document.body.style.backgroundColor = '';
    }

    root.style.setProperty('--site-footer-bg', bg && /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : cardSurface);

    var cardOutline = (theme.cardOutlineColor || theme.secondaryColor || secondary || '').trim();
    if (cardOutline && /^#[0-9a-fA-F]{6}$/.test(cardOutline)) {
      root.style.setProperty('--card-outline', cardOutline);
    }

    var fontDisplayMap = {
      cormorant: '"Cormorant Garamond", Georgia, serif',
      playfair: '"Playfair Display", Georgia, serif',
      inter: 'Inter, system-ui, sans-serif',
      'dm-sans': '"DM Sans", system-ui, sans-serif',
      montserrat: 'Montserrat, system-ui, sans-serif',
      lora: '"Lora", Georgia, serif',
      poppins: 'Poppins, system-ui, sans-serif',
      nunito: '"Nunito", system-ui, sans-serif',
    };
    var fontBodyMap = {
      cormorant: '"Source Sans 3", system-ui, sans-serif',
      playfair: '"Source Sans 3", system-ui, sans-serif',
      inter: 'Inter, system-ui, sans-serif',
      'dm-sans': '"DM Sans", system-ui, sans-serif',
      montserrat: 'Montserrat, system-ui, sans-serif',
      lora: '"Source Sans 3", system-ui, sans-serif',
      poppins: 'Poppins, system-ui, sans-serif',
      nunito: '"Nunito", system-ui, sans-serif',
    };
    var fontId = theme.fontFamily || 'cormorant';
    root.style.setProperty('--font-display', fontDisplayMap[fontId] || fontDisplayMap.cormorant);
    root.style.setProperty('--font-body', fontBodyMap[fontId] || fontBodyMap.cormorant);

    return { isDarkSurface: isDarkSurface };
  }

  function applyTenantBranding(site) {
    site = site && typeof site === 'object' ? site : {};
    var cfg = window.__STYLD_TENANT__ || {};
    var content = site.content || {};
    var theme = site.theme || {};
    var logoImageUrl = coverUrl(theme.logoImagePath, cfg.supabaseUrl);

    window.__STYLD_SITE_CONTENT__ = content;
    window.__STYLD_CANCELLATION_POLICY__ = site.cancellationPolicy || {};
    window.__STYLD_CANCELLATION_POLICY_SUMMARY__ = resolveCancellationPolicySummary(
      site.cancellationPolicy,
      content,
    );
    window.__STYLD_SITE_THEME__ = {
      heroLayout: theme.heroLayout || 'split',
      logoImageUrl: logoImageUrl,
      primaryColor: theme.primaryColor || null,
      secondaryColor: theme.secondaryColor || null,
      navbarColor: theme.navbarColor || null,
      cardOutlineColor: theme.cardOutlineColor || null,
      fontFamily: theme.fontFamily || 'cormorant',
      hideBookNowButton: !!theme.hideBookNowButton,
      backgroundColor: theme.backgroundColor || null,
    };

    applySiteTheme(theme);
    applySiteFooter(content);

    var brandNameEl = document.getElementById('profile-brand-name');
    if (brandNameEl) brandNameEl.textContent = content.brandName || 'Your Brand';

    if (logoImageUrl) {
      var logoPlaceholder = document.getElementById('profile-logo-placeholder');
      if (logoPlaceholder) {
        var logoImg = document.createElement('img');
        logoImg.className = 'profile-brand__logo-img';
        logoImg.src = logoImageUrl;
        logoImg.alt = '';
        logoImg.width = 38;
        logoImg.height = 38;
        logoImg.decoding = 'async';
        logoPlaceholder.replaceWith(logoImg);
      }
    }

    document.querySelectorAll('.profile-book-btn').forEach(function (btn) {
      btn.style.display = theme.hideBookNowButton ? 'none' : '';
    });

    document.body.classList.add('tenant-branded');

    var footer = document.querySelector('.site-footer.site-footer--home-promo');
    if (footer && theme.backgroundColor) {
      footer.style.background = theme.backgroundColor;
    }

    var tenantStatusEl = document.getElementById('tenant-status');
    if (tenantStatusEl) {
      tenantStatusEl.style.background = document.body.style.backgroundColor || '';
      tenantStatusEl.style.color = getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#525252';
    }
  }

  function applyBookingFormSettings(bookingPayment) {
    var req = getBookingFormRequirements(bookingPayment);
    var hairLabel = document.querySelector('label[for="photo-hair"]');
    var hairInput = document.getElementById('photo-hair');
    var refLabel = document.querySelector('label[for="photo-ref"]');
    var refInput = document.getElementById('photo-ref');

    if (hairLabel) {
      hairLabel.textContent = req.requireCurrentHairPhoto
        ? 'Current hair photo *'
        : 'Current hair photo (optional)';
    }
    if (hairInput) {
      if (req.requireCurrentHairPhoto) hairInput.setAttribute('required', '');
      else hairInput.removeAttribute('required');
    }
    if (refLabel) {
      refLabel.textContent = req.requireReferencePhoto
        ? 'Reference image *'
        : 'Reference image (optional)';
    }
    if (refInput) {
      if (req.requireReferencePhoto) refInput.setAttribute('required', '');
      else refInput.removeAttribute('required');
    }

    return req;
  }

  window.StyldTenant = {
    SITE_OFFLINE_MESSAGE: SITE_OFFLINE_MESSAGE,
    getSubdomain: getSubdomain,
    applySiteFooter: applySiteFooter,
    applySiteTheme: applySiteTheme,
    applyTenantBranding: applyTenantBranding,
    normalizeBookingHours: normalizeBookingHours,
    normalizeWeekdayHours: normalizeWeekdayHours,
    getBookingFormRequirements: getBookingFormRequirements,
    applyBookingFormSettings: applyBookingFormSettings,
    resolveCancellationPolicySummary: resolveCancellationPolicySummary,

    loadPublishedSite: function () {
      var cfg = window.__STYLD_TENANT__ || {};
      var subdomain = getSubdomain();
      if (!subdomain) {
        return Promise.reject(new Error('Site not found.'));
      }
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
        return Promise.reject(new Error('Site host is not configured yet.'));
      }

      var headers = {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
      };

      function rest(path) {
        return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, {
          headers: headers,
          cache: 'no-store',
        }).then(
          function (res) {
            if (!res.ok) throw new Error('Could not load site data.');
            return res.json();
          },
        );
      }

      return rest(
        'styld_site_subdomains?subdomain=eq.' + encodeURIComponent(subdomain) + '&select=user_id,published_at',
      )
        .then(function (rows) {
          var row = rows && rows[0];
          if (!row || !row.published_at) {
            throw new Error(SITE_OFFLINE_MESSAGE);
          }
          return rest(
            'styld_site_records?user_id=eq.' +
              encodeURIComponent(row.user_id) +
              '&select=record_type,record_key,data',
          ).then(function (records) {
            var content = null;
            var theme = { heroLayout: 'split' };
            var meta = {};
            var prices = {};
            var covers = {};
            var bookingHours = null;
            var bookingPayment = null;
            var cancellationPolicy = null;

            records.forEach(function (record) {
              var value = settingValue(record);
              if (record.record_type === 'site_setting' && record.record_key === 'site_content') content = value;
              if (record.record_type === 'site_setting' && record.record_key === 'site_theme') {
                theme = Object.assign(theme, value || {});
              }
              if (record.record_type === 'site_setting' && record.record_key === 'style_catalog_meta') {
                meta = value || {};
              }
              if (record.record_type === 'site_setting' && record.record_key === 'style_price_overrides') {
                prices = value || {};
              }
              if (record.record_type === 'site_setting' && record.record_key === 'booking_hours') {
                bookingHours = value;
              }
              if (record.record_type === 'site_setting' && record.record_key === 'booking_payment') {
                bookingPayment = value;
                if (!cancellationPolicy && value && typeof value === 'object') {
                  cancellationPolicy = value.cancellationPolicy || value.cancellation_policy || null;
                }
              }
              if (record.record_type === 'site_setting' && record.record_key === 'cancellation_policy') {
                cancellationPolicy = value;
              }
              if (record.record_type === 'style_cover_image' && record.record_key) {
                var coverPath = coverStoragePath(value);
                if (typeof coverPath === 'string') covers[record.record_key] = coverPath;
              }
            });

            if (!content) throw new Error('Site content not found.');

            return {
              subdomain: subdomain,
              userId: row.user_id,
              content: content,
              theme: theme,
              meta: meta,
              prices: prices,
              covers: covers,
              bookingHours: normalizeBookingHours(bookingHours),
              bookingPayment: bookingPayment,
              cancellationPolicy: cancellationPolicy,
              bookingStyles: buildBookingStyles(meta, prices),
              catalogCards: buildCatalogCards(meta, prices, covers, cfg.supabaseUrl, theme.logoImagePath),
            };
          });
        });
    },
  };
})();
