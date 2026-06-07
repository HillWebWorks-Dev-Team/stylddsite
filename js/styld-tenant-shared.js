(function () {
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
    getSubdomain: getSubdomain,
    applySiteFooter: applySiteFooter,
    normalizeBookingHours: normalizeBookingHours,
    normalizeWeekdayHours: normalizeWeekdayHours,
    getBookingFormRequirements: getBookingFormRequirements,
    applyBookingFormSettings: applyBookingFormSettings,

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
        return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path, { headers: headers }).then(
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
            throw new Error('This site has not been published yet.');
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
              bookingStyles: buildBookingStyles(meta, prices),
              catalogCards: buildCatalogCards(meta, prices, covers, cfg.supabaseUrl, theme.logoImagePath),
            };
          });
        });
    },
  };
})();
