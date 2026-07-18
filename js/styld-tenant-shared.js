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

  function formatPriceAmount(amount) {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) return null;
    return '$' + Math.round(amount);
  }

  function normalizeVariants(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (entry, index) {
        if (!entry || typeof entry !== 'object') return null;
        var id = entry.id != null ? String(entry.id).trim() : 'variant-' + index;
        var label = entry.label != null ? String(entry.label).trim() : '';
        var price = typeof entry.price === 'number' ? entry.price : Number(entry.price);
        if (!label || !Number.isFinite(price) || price < 0) return null;
        return { id: id, label: label, price: Math.round(price) };
      })
      .filter(Boolean);
  }

  function getStyleVariantChoices(styleLike) {
    if (!styleLike || typeof styleLike !== 'object') return [];
    var extras = normalizeVariants(styleLike.variants);
    if (!extras.length) return [];
    var base =
      typeof styleLike.base === 'number'
        ? styleLike.base
        : Number(styleLike.base);
    if (!Number.isFinite(base)) base = 0;
    var label =
      styleLike.defaultVariantLabel && String(styleLike.defaultVariantLabel).trim()
        ? String(styleLike.defaultVariantLabel).trim()
        : 'Standard';
    return [{ id: 'default', label: label, price: base }].concat(extras);
  }

  function normalizeAddons(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (entry, index) {
        if (!entry || typeof entry !== 'object') return null;
        var id = entry.id != null ? String(entry.id).trim() : 'addon-' + index;
        var name = entry.name != null ? String(entry.name).trim() : '';
        var price = typeof entry.price === 'number' ? entry.price : Number(entry.price);
        if (!name || !Number.isFinite(price) || price < 0) return null;
        return { id: id, name: name, price: Math.round(price) };
      })
      .filter(Boolean);
  }

  function formatStylePriceRange(basePrice, addons, variants) {
    var normalizedVariants = normalizeVariants(variants);
    var base = typeof basePrice === 'number' ? basePrice : Number(basePrice);
    if (normalizedVariants.length) {
      var prices = [base].concat(
        normalizedVariants.map(function (variant) {
          return variant.price;
        }),
      );
      var minPrice = Math.min.apply(null, prices);
      var maxPrice = Math.max.apply(null, prices);
      var minLabel = formatPriceAmount(minPrice);
      var maxLabel = formatPriceAmount(maxPrice);
      if (minLabel && maxLabel && minLabel !== maxLabel) return minLabel + '\u2013' + maxLabel;
      return minLabel || maxLabel || 'Price TBD';
    }

    var normalized = normalizeAddons(addons);
    if (!Number.isFinite(base) || base <= 0) return 'Price TBD';

    var baseLabel = formatPriceAmount(base);
    if (!normalized.length) return baseLabel;

    var maxAddon = 0;
    normalized.forEach(function (addon) {
      if (addon.price > maxAddon) maxAddon = addon.price;
    });

    var highLabel = formatPriceAmount(base + maxAddon);
    if (!highLabel || highLabel === baseLabel) return baseLabel;
    return baseLabel + '\u2013' + highLabel;
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
        var base = prices[styleId];
        if (typeof base !== 'number' || Number.isNaN(base)) base = 0;
        return {
          id: styleId,
          name: item.title || styleBookingName(item, styleId),
          base: base,
          defaultVariantLabel:
            item.defaultVariantLabel != null ? String(item.defaultVariantLabel).trim() : '',
          durationMinutes: normalizeDurationMinutes(item.durationMinutes),
          variants: normalizeVariants(item.variants),
          addons: normalizeAddons(item.addons),
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

    var logoFallbackUrl = coverUrl(logoImagePath, supabaseUrl);

    return Object.keys(styleIds).map(function (styleId) {
      var item = meta[styleId] || {};
      var variant = item.sizeLabel || item.variant || sizeLabelFromStyleId(styleId);
      return {
        id: styleId,
        title: item.title || styleId,
        sizeLabel: variant || '',
        durationLabel: formatStyleDuration(item.durationMinutes),
        priceLabel: formatStylePriceRange(prices[styleId], item.addons, item.variants),
        imageUrl: coverUrl(covers[styleId], supabaseUrl) || logoFallbackUrl,
      };
    });
  }

  var STYLD_SOCIAL_LINKS = {
    instagram: 'https://www.instagram.com/styldcrm/',
    tiktok: 'https://www.tiktok.com/@styldcrm',
  };

  var STYLD_IG_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>' +
    '<circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';
  var STYLD_TT_ICON =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V8.01a7.27 7.27 0 0 0 4.3 1.38V6.29a4.1 4.1 0 0 1-1-.47z"/></svg>';

  function ensureStyldFooterSocial() {
    document.querySelectorAll('.site-footer').forEach(function (footer) {
      var bottom = footer.querySelector('.footer-bottom') || footer;
      if (!bottom || bottom.querySelector('.footer-styld-social')) return;

      var nav = document.createElement('nav');
      nav.className = 'footer-styld-social';
      nav.setAttribute('aria-label', 'Follow Styld on social media');
      nav.innerHTML =
        '<a href="' +
        STYLD_SOCIAL_LINKS.instagram +
        '" target="_blank" rel="noopener noreferrer" aria-label="Instagram @styldcrm">' +
        STYLD_IG_ICON +
        '</a>' +
        '<a href="' +
        STYLD_SOCIAL_LINKS.tiktok +
        '" target="_blank" rel="noopener noreferrer" aria-label="TikTok @styldcrm">' +
        STYLD_TT_ICON +
        '</a>';

      var builtBy = bottom.querySelector('.footer-built-by');
      if (builtBy && builtBy.parentElement === bottom) {
        bottom.insertBefore(nav, builtBy.nextSibling);
      } else {
        bottom.appendChild(nav);
      }
    });
  }

  function trimContactValue(value) {
    return value == null ? '' : String(value).trim();
  }

  function phoneTelHref(raw) {
    var value = trimContactValue(raw);
    if (!value) return '';
    if (/^tel:/i.test(value)) value = value.replace(/^tel:/i, '');
    return value.replace(/[^\d+]/g, '');
  }

  function resolveSitePhone(content) {
    content = content && typeof content === 'object' ? content : {};
    var display = trimContactValue(
      content.phoneDisplay || content.phone_display || content.phone,
    );
    var tel = phoneTelHref(
      content.phoneTel ||
        content.phone_tel ||
        content.phoneDisplay ||
        content.phone_display ||
        content.phone,
    );
    if (!display && tel) {
      display = trimContactValue(content.phoneTel || content.phone_tel || content.phone || tel);
    }
    return { display: display, tel: tel };
  }

  function applySiteContactPhones(content) {
    var phone = resolveSitePhone(content);
    document.querySelectorAll('[data-site-contact-phone]').forEach(function (el) {
      if (!phone.display) {
        el.hidden = true;
        el.textContent = '';
        el.removeAttribute('href');
        return;
      }
      el.hidden = false;
      el.textContent = phone.display;
      if (el.tagName === 'A' || el.getAttribute('href') != null) {
        if (phone.tel) el.setAttribute('href', 'tel:' + phone.tel);
        else el.removeAttribute('href');
      }
    });
    document.querySelectorAll('[data-site-contact-phone-wrap]').forEach(function (wrap) {
      wrap.hidden = !phone.display;
    });
  }

  var MAIN_SECTION_ORDER_IDS = [
    'aboutMe',
    'policies',
    'reviews',
    'portfolio',
    'menu',
    'faq',
    'visit',
  ];

  var MAIN_SECTION_ID_ALIASES = {
    about_me: 'aboutMe',
    about: 'aboutMe',
    aboutMe: 'aboutMe',
    policy: 'policies',
    policies: 'policies',
    review: 'reviews',
    reviews: 'reviews',
    portfolio: 'portfolio',
    previous_work: 'portfolio',
    previousWork: 'portfolio',
    previouswork: 'portfolio',
    reels: 'portfolio',
    menu: 'menu',
    services: 'menu',
    service: 'menu',
    faq: 'faq',
    visit: 'visit',
    location: 'visit',
  };

  function normalizeMainSectionId(raw) {
    if (raw == null) return '';
    if (typeof raw === 'object') {
      raw =
        raw.id ||
        raw.key ||
        raw.sectionId ||
        raw.section_id ||
        raw.type ||
        raw.slug ||
        raw.name;
    }
    var id = trimContactValue(raw).replace(/\s+/g, '');
    if (!id) return '';
    if (MAIN_SECTION_ID_ALIASES[id]) return MAIN_SECTION_ID_ALIASES[id];
    var lower = id.toLowerCase();
    if (MAIN_SECTION_ID_ALIASES[lower]) return MAIN_SECTION_ID_ALIASES[lower];
    return id;
  }

  function readMainSectionOrderRaw(content) {
    content = content && typeof content === 'object' ? content : {};
    var raw =
      content.mainSectionOrder ||
      content.main_section_order ||
      content.sectionOrder ||
      content.section_order ||
      null;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.order)) return raw.order;
      if (Array.isArray(raw.sections)) return raw.sections;
      if (Array.isArray(raw.items)) return raw.items;
    }
    return null;
  }

  function resolveMainSectionOrder(content) {
    content = content && typeof content === 'object' ? content : {};
    var raw = readMainSectionOrderRaw(content);
    var valid = [];

    if (raw && raw.length) {
      var seen = {};
      raw.forEach(function (item) {
        var id = normalizeMainSectionId(item);
        if (!id || MAIN_SECTION_ORDER_IDS.indexOf(id) === -1 || seen[id]) return;
        seen[id] = true;
        valid.push(id);
      });
    }

    if (!valid.length) {
      valid = MAIN_SECTION_ORDER_IDS.slice();
      var placement = trimContactValue(content.portfolioPlacement || content.portfolio_placement || 'above_menu');
      if (placement === 'below_menu') {
        valid = valid.filter(function (id) {
          return id !== 'portfolio';
        });
        var menuIndex = valid.indexOf('menu');
        if (menuIndex === -1) menuIndex = valid.length - 1;
        valid.splice(menuIndex + 1, 0, 'portfolio');
      }
    }

    var seenAll = {};
    valid.forEach(function (id) {
      seenAll[id] = true;
    });
    MAIN_SECTION_ORDER_IDS.forEach(function (id) {
      if (!seenAll[id]) valid.push(id);
    });

    if (valid.length !== MAIN_SECTION_ORDER_IDS.length) {
      return MAIN_SECTION_ORDER_IDS.slice();
    }

    return valid;
  }

  function normalizeSiteContent(content) {
    content = content && typeof content === 'object' ? content : {};
    var order = resolveMainSectionOrder(content);
    if (order.length) content.mainSectionOrder = order.slice();
    return content;
  }

  var HERO_LAYOUTS = ['split', 'stack', 'cover', 'image-below', 'minimal'];

  function normalizeSiteTheme(theme) {
    theme = theme && typeof theme === 'object' ? theme : {};
    var layoutRaw = String(theme.heroLayout || theme.hero_layout || 'split').trim().toLowerCase();
    var heroLayout = HERO_LAYOUTS.indexOf(layoutRaw) !== -1 ? layoutRaw : 'split';
    theme.heroLayout = heroLayout;
    return theme;
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
    ensureStyldFooterSocial();
    applySiteContactPhones(content);
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

  function resolveEffectiveBookingPayment(bookingPayment, stripeReady) {
    var settings =
      bookingPayment && typeof bookingPayment === 'object'
        ? Object.assign({}, bookingPayment)
        : {};
    var mode = String(settings.mode || 'none').trim();
    if (mode === 'in_person') mode = 'none';
    if (!stripeReady && (mode === 'deposit' || mode === 'full')) {
      settings.mode = 'none';
    } else {
      settings.mode = mode;
    }
    return settings;
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

  function requiresBookingApproval(bookingPayment, isTravelBooking) {
    if (isTravelBooking === true) return true;
    var settings = bookingPayment && typeof bookingPayment === 'object' ? bookingPayment : {};
    var requireApproval = settings.requireBookingApproval;
    if (requireApproval == null) requireApproval = settings.require_booking_approval;
    return requireApproval === true;
  }

  function resolveBookingStatus(bookingPayment, awaitingPayment, isTravelBooking) {
    if (awaitingPayment) return 'pending';
    if (isTravelBooking === true || requiresBookingApproval(bookingPayment)) {
      return 'pending_approval';
    }
    return 'confirmed';
  }

  function formatTravelAddressParts(parts) {
    parts = parts && typeof parts === 'object' ? parts : {};
    var street = trimContactValue(parts.street || parts.line1 || parts.addressLine1);
    var unit = trimContactValue(parts.unit || parts.line2 || parts.addressLine2);
    var city = trimContactValue(parts.city);
    var state = trimContactValue(parts.state).toUpperCase();
    var zip = trimContactValue(parts.zip || parts.postalCode || parts.postal_code);
    var line1 = street + (unit ? ', ' + unit : '');
    var formatted = [line1, city, state, zip].filter(Boolean).join(', ');
    return {
      street: street,
      unit: unit,
      city: city,
      state: state,
      zip: zip,
      formatted: formatted,
    };
  }

  function normalizeTravelStylist(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var value = raw.value && typeof raw.value === 'object' ? raw.value : raw;
    if (!value || typeof value !== 'object') return null;

    var feeMode = trimContactValue(
      value.feeMode || value.fee_mode || value.feeType || value.fee_type || 'flat',
    ).toLowerCase();
    if (feeMode === 'permile' || feeMode === 'per-mile') feeMode = 'per_mile';
    if (feeMode !== 'per_mile') feeMode = 'flat';

    var homeRaw = value.homeBaseAddress || value.home_base_address || null;
    var homeBase = { street: '', unit: '', city: '', state: '', zip: '', formatted: '' };
    if (typeof homeRaw === 'string' && trimContactValue(homeRaw)) {
      homeBase.formatted = trimContactValue(homeRaw);
    } else if (homeRaw && typeof homeRaw === 'object') {
      homeBase = formatTravelAddressParts(homeRaw);
    }

    var homeBaseLat = value.homeBaseLat != null ? value.homeBaseLat : value.home_base_lat;
    var homeBaseLng = value.homeBaseLng != null ? value.homeBaseLng : value.home_base_lng;
    var lat = typeof homeBaseLat === 'number' && Number.isFinite(homeBaseLat) ? homeBaseLat : null;
    var lng = typeof homeBaseLng === 'number' && Number.isFinite(homeBaseLng) ? homeBaseLng : null;

    return {
      enabled: value.enabled === true,
      feeMode: feeMode,
      flatFeeUsd: Math.max(0, Number(value.flatFeeUsd != null ? value.flatFeeUsd : value.flat_fee_usd) || 0),
      perMileRateUsd: Math.max(
        0,
        Number(value.perMileRateUsd != null ? value.perMileRateUsd : value.per_mile_rate_usd) || 0,
      ),
      homeBaseAddress: homeBase,
      homeBaseLat: lat,
      homeBaseLng: lng,
      extraTravelMinutes: Math.max(
        0,
        Math.round(
          Number(
            value.extraTravelMinutes != null ? value.extraTravelMinutes : value.extra_travel_minutes,
          ) || 0,
        ),
      ),
    };
  }

  function isTravelStylistActive(settings) {
    settings = normalizeTravelStylist(settings) || settings;
    if (!settings || !settings.enabled) return false;
    if (settings.homeBaseLat != null && settings.homeBaseLng != null) return true;
    var home = settings.homeBaseAddress;
    if (home && typeof home === 'object' && trimContactValue(home.formatted)) return true;
    if (typeof home === 'string' && trimContactValue(home)) return true;
    return false;
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
    var storagePath = coverStoragePath(path);
    if (!storagePath || !supabaseUrl) return null;
    if (storagePath.indexOf('http://') === 0 || storagePath.indexOf('https://') === 0) return storagePath;
    var objectPath = storagePath.replace(/^\/+/, '').replace(/^style-covers\//, '');
    return supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + objectPath;
  }

  function resolveShareImageUrl(theme, covers, supabaseUrl) {
    theme = theme && typeof theme === 'object' ? theme : {};
    covers = covers && typeof covers === 'object' ? covers : {};
    var stackPaths = Array.isArray(theme.heroStackImagePaths) ? theme.heroStackImagePaths : [];
    var candidates = [theme.logoImagePath, theme.heroImagePath, stackPaths[0]];
    var coverKeys = Object.keys(covers);
    for (var i = 0; i < coverKeys.length; i++) {
      candidates.push(covers[coverKeys[i]]);
    }
    for (var j = 0; j < candidates.length; j++) {
      var url = coverUrl(candidates[j], supabaseUrl);
      if (url) return url;
    }
    return null;
  }

  function upsertMetaTag(selector, createFn) {
    var el = document.querySelector(selector);
    if (!el) {
      el = createFn();
      document.head.appendChild(el);
    }
    return el;
  }

  function applySiteShareBranding(options) {
    options = options || {};
    var brandName = options.brandName || 'Book online';
    var imageUrl = options.imageUrl || null;
    var description =
      options.description ||
      ('Book appointments with ' + brandName + ' online.');
    var pageUrl = options.pageUrl || window.location.href;
    var title = options.title || brandName + ' | Book online';

    document.title = title;

    upsertMetaTag('meta[name="description"]', function () {
      var meta = document.createElement('meta');
      meta.name = 'description';
      return meta;
    }).setAttribute('content', description);

    if (imageUrl) {
      ['link[rel="icon"]', 'link[rel="shortcut icon"]'].forEach(function (selector) {
        var link = document.querySelector(selector) || document.createElement('link');
        link.rel = selector.indexOf('shortcut') >= 0 ? 'shortcut icon' : 'icon';
        link.href = imageUrl;
        if (!link.parentNode) document.head.appendChild(link);
      });

      upsertMetaTag('link[rel="apple-touch-icon"]', function () {
        var link = document.createElement('link');
        link.rel = 'apple-touch-icon';
        return link;
      }).setAttribute('href', imageUrl);
    }

    [
      ['meta[property="og:type"]', 'website'],
      ['meta[property="og:title"]', brandName],
      ['meta[property="og:description"]', description],
      ['meta[property="og:url"]', pageUrl],
      ['meta[name="twitter:card"]', imageUrl ? 'summary_large_image' : 'summary'],
      ['meta[name="twitter:title"]', brandName],
      ['meta[name="twitter:description"]', description],
    ].forEach(function (entry) {
      upsertMetaTag(entry[0], function () {
        var meta = document.createElement('meta');
        if (entry[0].indexOf('property=') >= 0) {
          meta.setAttribute('property', entry[0].split('"')[1]);
        } else {
          meta.name = entry[0].split('"')[1];
        }
        return meta;
      }).setAttribute('content', entry[1]);
    });

    if (imageUrl) {
      ['meta[property="og:image"]', 'meta[name="twitter:image"]'].forEach(function (selector) {
        upsertMetaTag(selector, function () {
          var meta = document.createElement('meta');
          if (selector.indexOf('property=') >= 0) {
            meta.setAttribute('property', 'og:image');
          } else {
            meta.name = 'twitter:image';
          }
          return meta;
        }).setAttribute('content', imageUrl);
      });
    }
  }

  function applySiteTheme(theme) {
    theme = theme && typeof theme === 'object' ? theme : {};
    var primary = theme.primaryColor || '#db2777';
    var secondary = theme.secondaryColor || '#0a0a0a';

    function isValidHex(hex) {
      return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex.trim());
    }

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

    root.style.setProperty('--site-footer-bg', '#0a0a0a');

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

    var validPositions = ['center top', 'center center', 'center bottom'];
    var heroPos = (theme.heroImagePosition || '').trim();
    if (validPositions.indexOf(heroPos) !== -1) {
      root.style.setProperty('--hero-img-position', heroPos);
    }

    var textColorMap = {
      heading: '--text-heading',
      body: '--text-body',
      muted: '--text-muted',
      serviceName: '--text-service-name',
      price: '--text-price',
      accent: '--text-accent',
      link: '--text-link',
      nav: '--text-nav',
      navButton: '--text-nav-button',
      navButtonBg: '--text-nav-button-bg',
      splashBrand: '--text-splash-brand',
      splashButton: '--text-splash-button',
      splashButtonBg: '--text-splash-button-bg',
    };

    function resolveTextColorValue(key) {
      var sources = theme.textColorSources;
      var textColors = theme.textColors;
      var source = sources && typeof sources === 'object' ? sources[key] : null;
      var paletteBg =
        bg && isValidHex(bg) ? bg.trim() : cardSurface && isValidHex(cardSurface) ? cardSurface : null;
      var paletteNav =
        navBg && isValidHex(navBg) ? navBg.trim() : paletteBg;

      if (source === 'accent') return primary;
      if (source === 'text') return secondary;
      if (source === 'background') return paletteBg;
      if (source === 'navbar') return paletteNav;

      if (textColors && isValidHex(textColors[key])) {
        return textColors[key].trim();
      }
      return null;
    }

    Object.keys(textColorMap).forEach(function (key) {
      var resolved = resolveTextColorValue(key);
      if (resolved && isValidHex(resolved)) {
        root.style.setProperty(textColorMap[key], resolved);
      }
    });
    var resolvedNav = resolveTextColorValue('nav');
    if (resolvedNav && isValidHex(resolvedNav)) {
      root.style.setProperty('--nav-text', resolvedNav);
    }

    if (theme.heroCoverBlur) {
      root.style.setProperty('--hero-cover-blur', '12px');
      root.classList.add('theme-hero-cover-blur');
    } else {
      root.style.removeProperty('--hero-cover-blur');
      root.classList.remove('theme-hero-cover-blur');
    }

    return { isDarkSurface: isDarkSurface };
  }

  function applyTenantBranding(site) {
    site = site && typeof site === 'object' ? site : {};
    var cfg = window.__STYLD_TENANT__ || {};
    var content = site.content || {};
    content = normalizeSiteContent(content);
    site.content = content;
    var theme = site.theme || {};
    theme = normalizeSiteTheme(theme);
    site.theme = theme;
    var covers = site.covers || {};
    var logoImageUrl = coverUrl(theme.logoImagePath, cfg.supabaseUrl);
    var shareImageUrl = resolveShareImageUrl(theme, covers, cfg.supabaseUrl) || logoImageUrl;

    window.__STYLD_SITE_CONTENT__ = content;
    if (content && typeof content === 'object') {
      var resolvedPhone = resolveSitePhone(content);
      if (resolvedPhone.display && !trimContactValue(content.phoneDisplay)) {
        content.phoneDisplay = resolvedPhone.display;
      }
      if (resolvedPhone.tel && !trimContactValue(content.phoneTel)) {
        content.phoneTel = resolvedPhone.tel;
      }
    }
    window.__STYLD_CANCELLATION_POLICY__ = site.cancellationPolicy || {};
    window.__STYLD_CANCELLATION_POLICY_SUMMARY__ = resolveCancellationPolicySummary(
      site.cancellationPolicy,
      content,
    );
    window.__STYLD_SITE_THEME__ = {
      heroLayout: theme.heroLayout || 'split',
      heroImageUrl: coverUrl(theme.heroImagePath, cfg.supabaseUrl),
      heroImagePosition: theme.heroImagePosition || null,
      heroImageFocusX: theme.heroImageFocusX != null ? theme.heroImageFocusX : null,
      heroImageFocusY: theme.heroImageFocusY != null ? theme.heroImageFocusY : null,
      logoImageUrl: logoImageUrl,
      primaryColor: theme.primaryColor || null,
      secondaryColor: theme.secondaryColor || null,
      navbarColor: theme.navbarColor || null,
      cardOutlineColor: theme.cardOutlineColor || null,
      fontFamily: theme.fontFamily || 'cormorant',
      hideBookNowButton: !!theme.hideBookNowButton,
      heroPhotoEnabled: theme.heroPhotoEnabled !== false && theme.hero_photo_enabled !== false,
      heroAboutBesidePhoto:
        theme.heroAboutBesidePhoto !== false && theme.hero_about_beside_photo !== false,
      backgroundColor: theme.backgroundColor || null,
      textColors: theme.textColors && typeof theme.textColors === 'object' ? theme.textColors : null,
      textColorSources:
        theme.textColorSources && typeof theme.textColorSources === 'object' ? theme.textColorSources : null,
      heroCoverBlur: !!theme.heroCoverBlur,
      portfolioItems: Array.isArray(theme.portfolioItems) ? theme.portfolioItems : [],
      galleryImagePaths: Array.isArray(theme.galleryImagePaths) ? theme.galleryImagePaths : [],
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

    applySiteShareBranding({
      brandName: content.brandName || 'Your Brand',
      imageUrl: shareImageUrl,
      description:
        content.tagline ||
        content.heroDescription ||
        content.menuBlurb ||
        ('Book appointments with ' + (content.brandName || 'us') + ' online.'),
      pageUrl: window.location.href,
    });

    document.querySelectorAll('.profile-nav .profile-book-btn').forEach(function (btn) {
      btn.style.display = theme.hideBookNowButton ? 'none' : '';
    });

    document.body.classList.add('tenant-branded');

    var tenantStatusEl = document.getElementById('tenant-status');
    if (tenantStatusEl) {
      tenantStatusEl.style.background = document.body.style.backgroundColor || '';
      tenantStatusEl.style.color = getComputedStyle(document.documentElement).getPropertyValue('--muted') || '#525252';
    }
  }

  function applyBookingFormSettings(bookingPayment) {
    var req = getBookingFormRequirements(bookingPayment);
    var hairWrap = document.getElementById('photo-hair-field-wrap');
    var hairLabel = document.querySelector('label[for="photo-hair"]');
    var hairInput = document.getElementById('photo-hair');
    var hairPreview = document.getElementById('photo-hair-preview');
    var refLabel = document.querySelector('label[for="photo-ref"]');
    var refInput = document.getElementById('photo-ref');

    if (hairWrap) {
      hairWrap.hidden = !req.requireCurrentHairPhoto;
    }
    if (hairLabel && req.requireCurrentHairPhoto) {
      hairLabel.textContent = 'Current hair photo *';
    }
    if (hairInput) {
      if (req.requireCurrentHairPhoto) {
        hairInput.setAttribute('required', '');
      } else {
        hairInput.removeAttribute('required');
        hairInput.value = '';
        if (hairPreview) hairPreview.innerHTML = '';
      }
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

  function readInventoryBool(value) {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    if (typeof value === 'string') {
      var normalized = value.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
      if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
    }
    return null;
  }

  function readStockQty(item) {
    if (!item || typeof item !== 'object') return 0;

    var keys = [
      'stockQty',
      'stock_qty',
      'quantityInStock',
      'quantity_in_stock',
      'stockQuantity',
      'stock_quantity',
    ];
    var i;
    for (i = 0; i < keys.length; i++) {
      var raw = item[keys[i]];
      if (raw == null || raw === '') continue;
      var num = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      if (Number.isFinite(num) && num >= 0) return num;
    }

    return 0;
  }

  function readInventoryTrackFlag(item) {
    if (!item || typeof item !== 'object') return false;
    var trackValue = readInventoryBool(item.trackInventory);
    if (trackValue != null) return trackValue;
    trackValue = readInventoryBool(item.track_inventory);
    if (trackValue != null) return trackValue;
    return false;
  }

  function normalizeSiteProducts(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (item) {
        if (!item || typeof item !== 'object') return null;
        if (item.enabled === false) return null;
        var id = String(item.id || '').trim();
        var title = String(item.title || '').trim();
        if (!id || !title) return null;
        var price = typeof item.price === 'number' ? item.price : Number(item.price);
        if (!Number.isFinite(price) || price < 0) price = 0;
        var imagePaths = Array.isArray(item.imagePaths)
          ? item.imagePaths.map(function (p) {
              return String(p || '').trim();
            }).filter(Boolean)
          : [];
        var storagePath = String(item.storagePath || imagePaths[0] || '').trim();
        var trackInventory = readInventoryTrackFlag(item);
        var stockQty = readStockQty(item);
        return {
          id: id,
          title: title,
          description: String(item.description || '').trim(),
          price: price,
          storagePath: storagePath,
          imagePaths: imagePaths.length ? imagePaths : storagePath ? [storagePath] : [],
          trackInventory: trackInventory,
          stockQty: stockQty,
          quantityInStock: stockQty,
        };
      })
      .filter(Boolean);
  }

  function productTracksInventory(product) {
    return readInventoryBool(product && product.trackInventory) === true;
  }

  function getProductQuantityInStock(product) {
    if (!product) return 0;
    var qty = product.stockQty;
    if (qty == null) qty = product.quantityInStock;
    if (typeof qty !== 'number') qty = parseInt(qty, 10);
    if (!Number.isFinite(qty) || qty < 0) return 0;
    return qty;
  }

  function isProductOutOfStock(product) {
    return productTracksInventory(product) && getProductQuantityInStock(product) <= 0;
  }

  function getProductMaxOrderQuantity(product) {
    if (isProductOutOfStock(product)) return 0;
    if (!productTracksInventory(product)) return 99;
    return Math.min(99, getProductQuantityInStock(product));
  }

  function formatProductStockLabel(product) {
    if (!productTracksInventory(product)) return '';
    var stock = getProductQuantityInStock(product);
    if (stock <= 0) return 'Out of stock';
    return stock + ' in stock';
  }

  window.StyldTenant = {
    SITE_OFFLINE_MESSAGE: SITE_OFFLINE_MESSAGE,
    getSubdomain: getSubdomain,
    applySiteFooter: applySiteFooter,
    resolveSitePhone: resolveSitePhone,
    applySiteContactPhones: applySiteContactPhones,
    normalizeSiteContent: normalizeSiteContent,
    normalizeSiteTheme: normalizeSiteTheme,
    resolveMainSectionOrder: resolveMainSectionOrder,
    ensureStyldFooterSocial: ensureStyldFooterSocial,
    applySiteTheme: applySiteTheme,
    applySiteShareBranding: applySiteShareBranding,
    resolveShareImageUrl: resolveShareImageUrl,
    resolveStyleCoverUrl: function (path) {
      var cfg = window.__STYLD_TENANT__ || {};
      return coverUrl(path, cfg.supabaseUrl);
    },
    applyTenantBranding: applyTenantBranding,
    normalizeBookingHours: normalizeBookingHours,
    normalizeWeekdayHours: normalizeWeekdayHours,
    getBookingFormRequirements: getBookingFormRequirements,
    requiresBookingApproval: requiresBookingApproval,
    resolveBookingStatus: resolveBookingStatus,
    normalizeTravelStylist: normalizeTravelStylist,
    isTravelStylistActive: isTravelStylistActive,
    resolveEffectiveBookingPayment: resolveEffectiveBookingPayment,
    applyBookingFormSettings: applyBookingFormSettings,
    resolveCancellationPolicySummary: resolveCancellationPolicySummary,
    normalizeAddons: normalizeAddons,
    normalizeVariants: normalizeVariants,
    getStyleVariantChoices: getStyleVariantChoices,
    formatStylePriceRange: formatStylePriceRange,
    normalizeSiteProducts: normalizeSiteProducts,
    productTracksInventory: productTracksInventory,
    getProductQuantityInStock: getProductQuantityInStock,
    isProductOutOfStock: isProductOutOfStock,
    getProductMaxOrderQuantity: getProductMaxOrderQuantity,
    formatProductStockLabel: formatProductStockLabel,

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
            var productsCatalog = [];
            var productsSettings = {};
            var travelStylist = null;

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
              if (record.record_type === 'site_setting' && record.record_key === 'products_catalog') {
                productsCatalog = normalizeSiteProducts(value);
              }
              if (record.record_type === 'site_setting' && record.record_key === 'products_settings') {
                productsSettings = value && typeof value === 'object' ? value : {};
              }
              if (record.record_type === 'site_setting' && record.record_key === 'travel_stylist') {
                travelStylist = normalizeTravelStylist(value);
              }
              if (record.record_type === 'style_cover_image' && record.record_key) {
                var coverPath = coverStoragePath(value);
                if (typeof coverPath === 'string') covers[record.record_key] = coverPath;
              }
            });

            if (!content) throw new Error('Site content not found.');
            content = normalizeSiteContent(content);

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
              productsCatalog: productsCatalog,
              productsSettings: productsSettings,
              travelStylist: travelStylist,
            };
          });
        });
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureStyldFooterSocial);
  } else {
    ensureStyldFooterSocial();
  }
})();
