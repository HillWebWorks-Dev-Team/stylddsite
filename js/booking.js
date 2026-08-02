(function initStyldBookingPage() {
  var DateTime = window.luxon && window.luxon.DateTime;
  if (!DateTime) {
    console.error('Luxon is required for booking.');
    return;
  }
  if (!window.BookingAvailability || !window.BookingAvailability.createEngine) {
    console.error('booking-availability.js must load before booking.js');
    return;
  }

  var cfg = window.__STYLD_TENANT__ || {};
  var tenantBooking = window.__STYLD_TENANT_BOOKING__ || window.__SALON_SITE_BOOKING__ || {};
  var styles = window.__STYLD_BOOKING_STYLES__ || [];
  var hours = Object.assign(
    {},
    tenantBooking.bookingHours || {},
    window.__STYLD_BOOKING_HOURS__ || {},
  );
  var paymentSettings = window.__STYLD_BOOKING_PAYMENT__ || {};
  var subdomain =
    tenantBooking.subdomain ||
    (window.StyldTenant && window.StyldTenant.getSubdomain ? window.StyldTenant.getSubdomain() : '');

  var zone =
    tenantBooking.timezone ||
    (window.__STYLD_SITE_CONTENT__ && window.__STYLD_SITE_CONTENT__.timezone) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'America/New_York';

  var availability = window.BookingAvailability.createEngine(
    {
      salonTimeZone: zone,
      bookingHours: hours,
      subdomain: subdomain,
      strictNoOverlap: tenantBooking.strictNoOverlap !== false && !!subdomain,
    },
    DateTime,
  );

  var isTenantSite = !!subdomain;
  var cachedUnavailable = null;
  var cachedUnavailableDateIso = null;
  var slotsPollTimer = null;
  var slotsLoadToken = 0;

  var styleSelect = document.getElementById('style-select');
  var styleGate = document.getElementById('style-gate-alert');
  var durationStrip = document.getElementById('duration-strip');
  var slotsContainer = document.getElementById('time-slots-container');
  var calGrid = document.getElementById('booking-cal-grid');
  var calMonthLabel = document.getElementById('booking-cal-month-label');
  var calSelectedLine = document.getElementById('booking-cal-selected-line');
  var calPrev = document.getElementById('booking-cal-prev');
  var calNext = document.getElementById('booking-cal-next');
  var startsAtInput = document.getElementById('appointment-starts-at');
  var durationInput = document.getElementById('duration-minutes-input');
  var bookingForm = document.getElementById('booking-form');
  var submitBtn = document.getElementById('booking-submit-btn');
  var feedbackEl = document.getElementById('booking-feedback');
  var paymentSection = document.getElementById('payment-section');
  var cancellationPolicySection = document.getElementById('cancellation-policy-section');
  var cancellationPolicyText = document.getElementById('cancellation-policy-text');
  var sidebarCancellationPolicy = document.getElementById('side-cancellation-policy');
  var sidebarCancellationPolicyText = document.getElementById('side-cancellation-policy-text');
  var sidebarDepositNote = document.getElementById('side-deposit-note');

  var viewMonth = DateTime.now().setZone(zone).startOf('month');
  var selectedDate = null;
  var selectedSlotStart = null;
  var selectedStyle = null;
  var selectedAddonId = '';
  var selectedVariantId = '';
  var stripeCard = null;
  var stripeElements = null;
  var stripeCheckout = null;
  var stripeConnectAccountId = null;
  var stripeConnectAccountPromise = null;
  var appliedPromo = null;
  var lastValidatedSubtotalCents = null;
  var productsCatalogRaw =
    window.__STYLD_BOOKING_PRODUCTS__ || tenantBooking.products || [];
  var productsCatalog =
    window.StyldTenant && window.StyldTenant.normalizeSiteProducts
      ? window.StyldTenant.normalizeSiteProducts(productsCatalogRaw)
      : productsCatalogRaw;
  var selectedProductIds = {};
  var preselectedProductId = new URLSearchParams(window.location.search).get('product') || '';

  var WIZARD_STEPS = ['personal', 'service', 'appointment', 'pricing'];
  var currentWizardStep = 0;
  var variantModalStyleId = '';
  var lockedStyleSelection = false;
  var bookingUrlParams = new URLSearchParams(window.location.search);
  var preselectedStyleId = bookingUrlParams.get('style') || '';
  var preselectedVariantId = bookingUrlParams.get('variant') || '';

  var travelStylist =
    window.StyldTenant && window.StyldTenant.normalizeTravelStylist
      ? window.StyldTenant.normalizeTravelStylist(tenantBooking.travelStylist)
      : tenantBooking.travelStylist || null;
  var travelFeeUsd = 0;
  var travelDistanceMiles = null;
  var travelFeeLoading = false;
  var travelFeeError = '';
  var travelFeeDebounceTimer = null;

  function money(n) {
    return '$' + (Math.round(Number(n) || 0)).toFixed(0);
  }

  function moneyPrecise(n) {
    return '$' + (Math.round(Number(n) * 100) / 100).toFixed(2);
  }

  function computeServiceFee(stylistAmount) {
    if (!stylistAmount || stylistAmount <= 0) return 0;
    return Math.round((totalChargeWithFee(stylistAmount) - stylistAmount) * 100) / 100;
  }

  function totalChargeWithFee(stylistAmount) {
    if (!stylistAmount || stylistAmount <= 0) return 0;
    var amountCents = Math.round(stylistAmount * 100);
    var chargeCents = Math.ceil((amountCents + 30) / (1 - 0.029 - 0.01));
    return chargeCents / 100;
  }

  function edgeFunction(name, body) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      return Promise.reject(new Error('Site is not configured for online booking.'));
    }
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/functions/v1/' + name, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (payload) {
        if (!res.ok) {
          var msg =
            (payload && (payload.error || payload.message)) ||
            'Request failed';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        return payload;
      });
    });
  }

  function rpc(name, params) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      return Promise.reject(new Error('Site is not configured for online booking.'));
    }
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          throw new Error((body && body.message) || 'Request failed');
        }
        return body;
      });
    });
  }

  function showFeedback(message, isError) {
    if (!feedbackEl) return;
    feedbackEl.hidden = false;
    feedbackEl.textContent = message;
    feedbackEl.className = 'booking-feedback' + (isError ? ' booking-feedback--error' : ' booking-feedback--success');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function styleById(id) {
    return styles.find(function (s) { return s.id === id; }) || null;
  }

  function durationMinutesForStyle(style) {
    var duration = style && style.durationMinutes;
    if (typeof duration === 'number' && duration > 0) return Math.round(duration);
    return 120;
  }

  function getGoogleMapsApiKey() {
    return (window.BOOKING_CONFIG && window.BOOKING_CONFIG.googleMapsApiKey) || '';
  }

  function isHouseCallStyle(style) {
    return !!(style && String(style.id || '').toLowerCase().indexOf('house-') === 0);
  }

  function isTravelStylistConfigured() {
    if (window.StyldTenant && window.StyldTenant.isTravelStylistActive) {
      return window.StyldTenant.isTravelStylistActive(travelStylist);
    }
    return !!(travelStylist && travelStylist.enabled);
  }

  function isTravelRequestChecked() {
    var toggle = document.getElementById('travel-request-toggle');
    return !!(toggle && toggle.checked);
  }

  function isTravelBooking() {
    if (!isTravelStylistConfigured() || !selectedStyle) return false;
    if (isHouseCallStyle(selectedStyle)) return true;
    return isTravelRequestChecked();
  }

  function readAddressFields(prefix) {
    function val(id) {
      var el = document.getElementById(id);
      return el && el.value ? String(el.value).trim() : '';
    }
    var street = val(prefix + '-street');
    var unit = val(prefix + '-unit');
    var city = val(prefix + '-city');
    var state = val(prefix + '-state').toUpperCase();
    var zip = val(prefix + '-zip');
    var formatted = formatAddressFromParts({
      street: street,
      unit: unit,
      city: city,
      state: state,
      zip: zip,
    });
    if (!isAddressComplete({ street: street, unit: unit, city: city, state: state, zip: zip }) && street) {
      formatted = street;
    }
    return { street: street, unit: unit, city: city, state: state, zip: zip, formatted: formatted };
  }

  function formatAddressFromParts(parts) {
    parts = parts && typeof parts === 'object' ? parts : {};
    var line1 = [parts.street, parts.unit].filter(Boolean).join(parts.unit ? ', ' : ' ').trim();
    if (!line1 && parts.street) line1 = parts.street;
    return [line1, parts.city, parts.state, parts.zip].filter(Boolean).join(', ');
  }

  function isAddressComplete(address) {
    return !!(
      address &&
      address.city &&
      address.state &&
      address.zip &&
      (address.street || address.formatted)
    );
  }

  function getServiceAddress() {
    if (!selectedStyle) return null;
    if (isHouseCallStyle(selectedStyle)) return readAddressFields('house-addr');
    if (isTravelRequestChecked()) return readAddressFields('travel-addr');
    return null;
  }

  function setAddressFieldsRequired(prefix, required) {
    var streetEl = document.getElementById(prefix + '-street');
    if (streetEl) streetEl.required = !!required;
  }

  function clearParsedAddress(prefix) {
    ['unit', 'city', 'state', 'zip'].forEach(function (part) {
      var el = document.getElementById(prefix + '-' + part);
      if (el) el.value = '';
    });
    markAddressResolved(prefix, false);
  }

  var addressAutocompleteBound = {};

  function fetchAddressSuggestions(query) {
    if (!query || query.length < 3) return Promise.resolve([]);
    return edgeFunction('booking-places', {
      action: 'autocomplete',
      input: query,
    }).then(function (data) {
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(data.error_message || data.error || 'Address lookup failed.');
      }
      return (data.predictions || []).map(function (prediction) {
        return {
          placeId: prediction.place_id,
          description: prediction.description,
        };
      });
    });
  }

  function fetchPlaceDetails(placeId) {
    return edgeFunction('booking-places', {
      action: 'details',
      placeId: placeId,
    }).then(function (data) {
      if (data.status !== 'OK' || !data.result) {
        throw new Error(data.error_message || data.error || 'Could not load address details.');
      }
      return data.result;
    });
  }

  function fetchAddressGeocode(query) {
    return edgeFunction('booking-places', {
      action: 'geocode',
      query: query,
    }).then(function (data) {
      if (data.status !== 'OK' || !data.result) {
        throw new Error(data.error_message || data.error || 'Could not find that address.');
      }
      return data.result;
    });
  }

  function markAddressResolved(prefix, resolved) {
    var streetEl = document.getElementById(prefix + '-street');
    if (streetEl) streetEl.dataset.addressResolved = resolved ? '1' : '';
  }

  function isAddressResolved(prefix) {
    var streetEl = document.getElementById(prefix + '-street');
    if (streetEl && streetEl.dataset.addressResolved === '1') return true;
    return isAddressComplete(readAddressFields(prefix));
  }

  function applyResolvedPlace(prefix, place) {
    var parts = parseGoogleAddressComponents(place.address_components);
    applyParsedAddress(prefix, parts, place.formatted_address || '');
    markAddressResolved(prefix, isAddressComplete(readAddressFields(prefix)));
  }

  function resolveTypedAddress(prefix, query) {
    return fetchAddressGeocode(query)
      .then(function (place) {
        applyResolvedPlace(prefix, place);
        hideAddressSuggestions(prefix);
        scheduleTravelFeeRefresh();
      })
      .catch(function (err) {
        travelFeeError = (err && err.message) || 'Could not find that address.';
        updateTravelFeePreviewText();
      });
  }

  function ensureSuggestionList(prefix) {
    var listId = prefix + '-suggestions';
    var existing = document.getElementById(listId);
    if (existing) return existing;
    var streetEl = document.getElementById(prefix + '-street');
    var parent = streetEl && streetEl.closest('.house-address-search');
    if (!parent) return null;
    var list = document.createElement('div');
    list.id = listId;
    list.className = 'booking-address-suggestions';
    list.hidden = true;
    list.setAttribute('role', 'listbox');
    parent.appendChild(list);
    return list;
  }

  function hideAddressSuggestions(prefix) {
    var list = document.getElementById(prefix + '-suggestions');
    var streetEl = document.getElementById(prefix + '-street');
    if (list) list.hidden = true;
    if (streetEl) streetEl.setAttribute('aria-expanded', 'false');
  }

  function renderAddressSuggestions(prefix, items) {
    var list = ensureSuggestionList(prefix);
    var streetEl = document.getElementById(prefix + '-street');
    if (!list) return;
    list.innerHTML = '';
    if (!items.length) {
      list.hidden = true;
      if (streetEl) streetEl.setAttribute('aria-expanded', 'false');
      return;
    }
    items.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'booking-address-suggestions__item';
      btn.setAttribute('role', 'option');
      btn.textContent = item.description;
      btn.addEventListener('mousedown', function (event) {
        event.preventDefault();
      });
      btn.addEventListener('click', function () {
        selectAddressSuggestion(prefix, item.placeId);
      });
      list.appendChild(btn);
    });
    list.hidden = false;
    if (streetEl) streetEl.setAttribute('aria-expanded', 'true');
  }

  function selectAddressSuggestion(prefix, placeId) {
    fetchPlaceDetails(placeId)
      .then(function (place) {
        applyResolvedPlace(prefix, place);
        hideAddressSuggestions(prefix);
        scheduleTravelFeeRefresh();
      })
      .catch(function (err) {
        hideAddressSuggestions(prefix);
        travelFeeError = (err && err.message) || 'Could not load that address.';
        updateTravelFeePreviewText();
      });
  }

  function parseGoogleAddressComponents(components) {
    var parts = { street: '', unit: '', city: '', state: '', zip: '' };
    var streetNumber = '';
    var route = '';
    (components || []).forEach(function (component) {
      var types = component.types || [];
      if (types.indexOf('street_number') !== -1) streetNumber = component.long_name || '';
      if (types.indexOf('route') !== -1) route = component.long_name || '';
      if (types.indexOf('subpremise') !== -1) parts.unit = component.long_name || '';
      if (types.indexOf('locality') !== -1) parts.city = component.long_name || '';
      if (!parts.city && types.indexOf('postal_town') !== -1) {
        parts.city = component.long_name || '';
      }
      if (!parts.city && types.indexOf('sublocality') !== -1) {
        parts.city = component.long_name || '';
      }
      if (types.indexOf('administrative_area_level_1') !== -1) {
        parts.state = (component.short_name || component.long_name || '').toUpperCase();
      }
      if (types.indexOf('postal_code') !== -1) parts.zip = component.long_name || '';
    });
    parts.street = [streetNumber, route].filter(Boolean).join(' ').trim();
    return parts;
  }

  function applyParsedAddress(prefix, parts, formattedAddress) {
    function set(part, value) {
      var el = document.getElementById(prefix + '-' + part);
      if (el) el.value = value || '';
    }
    set('unit', parts.unit);
    set('city', parts.city);
    set('state', parts.state);
    set('zip', parts.zip);
    var streetEl = document.getElementById(prefix + '-street');
    if (streetEl) {
      streetEl.value =
        formattedAddress || formatAddressFromParts(parts) || parts.street || streetEl.value;
    }
  }

  function bindAddressAutocomplete(prefix) {
    if (addressAutocompleteBound[prefix]) return;
    var streetEl = document.getElementById(prefix + '-street');
    if (!streetEl) return;
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return;

    addressAutocompleteBound[prefix] = true;
    streetEl.setAttribute('autocomplete', 'off');
    streetEl.setAttribute('placeholder', 'Start typing your address…');
    streetEl.setAttribute('aria-autocomplete', 'list');
    streetEl.setAttribute('aria-expanded', 'false');
    streetEl.setAttribute('aria-controls', prefix + '-suggestions');

    var debounceTimer = null;
    var resolveTimer = null;

    streetEl.addEventListener('input', function () {
      clearParsedAddress(prefix);
      scheduleTravelFeeRefresh();
      var query = streetEl.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (query.length < 3) {
        hideAddressSuggestions(prefix);
        return;
      }
      debounceTimer = setTimeout(function () {
        fetchAddressSuggestions(query)
          .then(function (items) {
            renderAddressSuggestions(prefix, items);
          })
          .catch(function (err) {
            hideAddressSuggestions(prefix);
            travelFeeError = (err && err.message) || 'Address lookup failed.';
            updateTravelFeePreviewText();
          });
      }, 320);
    });

    streetEl.addEventListener('blur', function () {
      setTimeout(function () {
        hideAddressSuggestions(prefix);
        if (isAddressResolved(prefix)) return;
        var query = streetEl.value.trim();
        if (query.length < 8) return;
        if (resolveTimer) clearTimeout(resolveTimer);
        resolveTimer = setTimeout(function () {
          resolveTypedAddress(prefix, query);
        }, 180);
      }, 180);
    });

    streetEl.addEventListener('focus', function () {
      var query = streetEl.value.trim();
      if (query.length < 3) return;
      fetchAddressSuggestions(query)
        .then(function (items) {
          renderAddressSuggestions(prefix, items);
        })
        .catch(function () {
          hideAddressSuggestions(prefix);
        });
    });
  }

  function syncAddressAutocompleteBindings() {
    var houseWrap = document.getElementById('house-address-field-wrap');
    var travelAddrWrap = document.getElementById('travel-address-field-wrap');
    if (houseWrap && !houseWrap.hidden) bindAddressAutocomplete('house-addr');
    if (travelAddrWrap && !travelAddrWrap.hidden) bindAddressAutocomplete('travel-addr');
  }

  function updateAddressAutocompleteHints(showHouse, showTravelAddr) {
    var houseHint = document.getElementById('house-addr-maps-hint');
    var travelHint = document.getElementById('travel-addr-maps-hint');
    if (houseHint) houseHint.hidden = !showHouse;
    if (travelHint) travelHint.hidden = true;
  }

  function travelHomeOrigin() {
    if (!travelStylist) return '';
    if (travelStylist.homeBaseLat != null && travelStylist.homeBaseLng != null) {
      return { lat: travelStylist.homeBaseLat, lng: travelStylist.homeBaseLng };
    }
    var home = travelStylist.homeBaseAddress;
    var formatted =
      home && typeof home === 'object'
        ? String(home.formatted || '').trim()
        : String(home || '').trim();
    return formatted || '';
  }

  function fetchTravelDistanceMiles(destinationAddress) {
    var origin = travelHomeOrigin();
    var originsParam = '';
    if (origin && typeof origin === 'object') {
      originsParam = origin.lat + ',' + origin.lng;
    } else if (origin) {
      originsParam = origin;
    } else {
      return Promise.reject(new Error('Stylist home base is not configured.'));
    }
    return edgeFunction('booking-places', {
      action: 'distancematrix',
      origins: originsParam,
      destinations: destinationAddress,
    }).then(function (data) {
      if (data.status !== 'OK') {
        throw new Error(data.error_message || data.error || 'Could not calculate travel distance.');
      }
      var row = data.rows && data.rows[0];
      var element = row && row.elements && row.elements[0];
      if (!element || element.status !== 'OK' || !element.distance) {
        throw new Error('Could not calculate travel distance for that address.');
      }
      return element.distance.value / 1609.344;
    });
  }

  function getTravelFeePreviewTargets() {
    return [
      {
        wrap: document.getElementById('travel-address-field-wrap'),
        el: document.getElementById('travel-fee-preview'),
      },
      {
        wrap: document.getElementById('house-address-field-wrap'),
        el: document.getElementById('house-travel-fee-preview'),
      },
    ].filter(function (target) {
      return target.el;
    });
  }

  function setTravelFeePreviewText(text, showOnVisibleWrapOnly) {
    getTravelFeePreviewTargets().forEach(function (target) {
      var show = !!text;
      if (showOnVisibleWrapOnly && target.wrap && target.wrap.hidden) show = false;
      target.el.hidden = !show;
      target.el.textContent = show ? text : '';
      target.el.classList.toggle('booking-travel-fee-preview--ready', !!text && !travelFeeLoading && !travelFeeError && travelFeeUsd > 0);
    });
  }

  function updateTravelFeePreviewText() {
    if (!isTravelBooking()) {
      setTravelFeePreviewText('');
      return;
    }
    if (travelFeeLoading) {
      setTravelFeePreviewText('Calculating travel fee…', true);
      return;
    }
    if (travelFeeError) {
      setTravelFeePreviewText(travelFeeError, true);
      return;
    }

    var address = getServiceAddress();
    var addressReady = isAddressComplete(address);

    if (addressReady && travelFeeUsd > 0) {
      var milesText =
        travelDistanceMiles != null
          ? ' (' + travelDistanceMiles.toFixed(1) + ' mi)'
          : '';
      var feeLabel =
        travelStylist && travelStylist.feeMode === 'flat'
          ? 'Travel fee: '
          : 'Estimated travel fee: ';
      setTravelFeePreviewText(feeLabel + moneyPrecise(travelFeeUsd) + milesText, true);
      return;
    }

    setTravelFeePreviewText('');
  }

  function refreshTravelFee() {
    travelFeeError = '';
    travelDistanceMiles = null;
    travelFeeUsd = 0;

    if (!isTravelBooking()) {
      travelFeeLoading = false;
      updateTravelFeePreviewText();
      updatePricingDisplay();
      return Promise.resolve();
    }

    if (!travelStylist) return Promise.resolve();

    var address = getServiceAddress();
    if (!isAddressComplete(address)) {
      updateTravelFeePreviewText();
      updatePricingDisplay();
      return Promise.resolve();
    }

    if (travelStylist.feeMode === 'flat') {
      travelFeeUsd = Math.max(0, Number(travelStylist.flatFeeUsd) || 0);
      updateTravelFeePreviewText();
      updatePricingDisplay();
      return Promise.resolve();
    }

    travelFeeLoading = true;
    updateTravelFeePreviewText();
    return fetchTravelDistanceMiles(address.formatted)
      .then(function (miles) {
        travelDistanceMiles = Math.max(0, Number(miles) || 0);
        travelFeeUsd = Math.round(travelDistanceMiles * (Number(travelStylist.perMileRateUsd) || 0) * 100) / 100;
        travelFeeLoading = false;
        updateTravelFeePreviewText();
        updatePricingDisplay();
        if (selectedDate) refreshSlotsAvailability(false);
      })
      .catch(function (err) {
        travelFeeLoading = false;
        travelFeeError =
          (err && err.message) || 'Could not calculate travel fee. Check your address and try again.';
        updateTravelFeePreviewText();
        updatePricingDisplay();
      });
  }

  function scheduleTravelFeeRefresh() {
    if (travelFeeDebounceTimer) clearTimeout(travelFeeDebounceTimer);
    travelFeeDebounceTimer = setTimeout(function () {
      refreshTravelFee();
    }, 450);
  }

  function updateTravelUi() {
    var travelWrap = document.getElementById('travel-request-wrap');
    var travelAddrWrap = document.getElementById('travel-address-field-wrap');
    var houseWrap = document.getElementById('house-address-field-wrap');
    var mapsHint = document.getElementById('travel-addr-maps-hint');
    var active = isTravelStylistConfigured();
    var style = selectedStyle;
    var showHouse = !!(active && style && isHouseCallStyle(style));
    var showTravelCheckbox = !!(active && style && !isHouseCallStyle(style));
    var showTravelAddr = showTravelCheckbox && isTravelRequestChecked();

    if (travelWrap) travelWrap.hidden = !showTravelCheckbox;
    if (houseWrap) houseWrap.hidden = !showHouse;
    if (travelAddrWrap) travelAddrWrap.hidden = !showTravelAddr;

    if (!showTravelCheckbox) {
      var toggle = document.getElementById('travel-request-toggle');
      if (toggle) toggle.checked = false;
    }

    setAddressFieldsRequired('house-addr', showHouse);
    setAddressFieldsRequired('travel-addr', showTravelAddr);

    updateAddressAutocompleteHints(showHouse, showTravelAddr);
    syncAddressAutocompleteBindings();

    refreshTravelFee();
  }

  function setupTravelBookingUi() {
    var toggle = document.getElementById('travel-request-toggle');
    if (toggle && toggle.dataset.bound !== '1') {
      toggle.dataset.bound = '1';
      toggle.addEventListener('change', function () {
        updateTravelUi();
      });
    }

    ['house-addr', 'travel-addr'].forEach(function (prefix) {
      var streetEl = document.getElementById(prefix + '-street');
      if (streetEl && streetEl.dataset.travelBound !== '1') {
        streetEl.dataset.travelBound = '1';
      }
    });

    updateTravelUi();
  }

  function formatDurationLabel(minutes) {
    var mins = Math.round(Number(minutes) || 0);
    if (mins <= 0) return 'TBD';
    var hours = Math.floor(mins / 60);
    var remainder = mins % 60;
    if (hours <= 0) return remainder + ' min';
    if (remainder === 0) return hours === 1 ? '1 hr' : hours + ' hrs';
    if (hours === 1) return '1 hr ' + remainder + ' min';
    return hours + ' hrs ' + remainder + ' min';
  }

  function calendarGridStart(monthStart) {
    return monthStart.minus({ days: monthStart.weekday % 7 });
  }

  function isDepositIncludedInPrice() {
    var val = paymentSettings.depositIncludedInPrice;
    if (val == null) val = paymentSettings.deposit_included_in_price;
    if (val == null) return true;
    if (typeof val === 'string') {
      var normalized = val.trim().toLowerCase();
      return normalized !== 'false' && normalized !== '0' && normalized !== 'no';
    }
    return val !== false;
  }

  function styleExtraVariants(style) {
    return style && Array.isArray(style.variants) ? style.variants : [];
  }

  function getStyleVariantsForStyle(style) {
    if (window.StyldTenant && window.StyldTenant.getStyleVariantChoices) {
      return window.StyldTenant.getStyleVariantChoices(style);
    }
    if (!style) return [];
    var extras = styleExtraVariants(style);
    if (!extras.length) return [];
    var base = typeof style.base === 'number' ? style.base : 0;
    var label =
      style.defaultVariantLabel && String(style.defaultVariantLabel).trim()
        ? String(style.defaultVariantLabel).trim()
        : 'Standard';
    return [{ id: 'default', label: label, price: base }].concat(extras);
  }

  function getSelectedVariant(style) {
    var variants = getStyleVariantsForStyle(style);
    if (!variants.length) return null;
    var id = selectedVariantId;
    if (!id) {
      var checked = document.querySelector('input[name="style-variant"]:checked');
      if (checked) id = checked.value;
    }
    for (var i = 0; i < variants.length; i++) {
      if (variants[i].id === id) return variants[i];
    }
    return variants[0] || null;
  }

  function effectiveStyleBase(style) {
    if (!style) return 0;
    var variant = getSelectedVariant(style);
    if (variant && typeof variant.price === 'number') {
      if (variant.price > 0) return variant.price;
      return typeof style.base === 'number' ? style.base : 0;
    }
    return typeof style.base === 'number' ? style.base : 0;
  }

  function getSelectedAddon(style) {
    if (!style || !selectedAddonId) return null;
    var addons = Array.isArray(style.addons) ? style.addons : [];
    for (var i = 0; i < addons.length; i++) {
      if (addons[i].id === selectedAddonId) return addons[i];
    }
    return null;
  }

  function styleDisplayName(style, addon) {
    if (!style) return '';
    var variant = getSelectedVariant(style);
    var base = style.name || style.id || '';
    if (variant) base = base + ' \u2014 ' + variant.label;
    if (!addon) return base;
    return base + ' + ' + addon.name;
  }

  function buildVariantOptionHtml(variant, index, checkedId) {
    var checked = checkedId === variant.id || (!checkedId && index === 0);
    return (
      '<label class="booking-addon-option style-variant-option">' +
      '<input type="radio" name="style-variant" value="' +
      escapeHtml(variant.id) +
      '"' +
      (checked ? ' checked' : '') +
      ' required />' +
      '<span class="booking-addon-option__label">' +
      escapeHtml(variant.label) +
      ' (' +
      money(variant.price) +
      ')</span>' +
      '</label>'
    );
  }

  function renderVariantPicker(style) {
    var field = document.getElementById('style-variant-field-wrap');
    var container = document.getElementById('style-variant-list');
    if (!field || !container) return;

    var extras = styleExtraVariants(style);
    if (!style || !extras.length || lockedStyleSelection) {
      field.hidden = true;
      container.innerHTML = '';
      if (!lockedStyleSelection && extras.length === 0) selectedVariantId = '';
      return;
    }

    var variants = getStyleVariantsForStyle(style);
    if (!selectedVariantId || !variants.some(function (v) { return v.id === selectedVariantId; })) {
      selectedVariantId = variants[0].id;
    }

    field.hidden = false;
    var html = '';
    variants.forEach(function (variant, index) {
      html += buildVariantOptionHtml(variant, index, selectedVariantId);
    });
    container.innerHTML = html;
  }

  function showVariantModal(style) {
    var modal = document.getElementById('style-variant-modal');
    var backdrop = document.getElementById('style-variant-modal-backdrop');
    if (!modal || !style) return;

    if (!styleExtraVariants(style).length) return;

    var variants = getStyleVariantsForStyle(style);

    variantModalStyleId = style.id;
    var title = document.getElementById('style-variant-modal-title');
    if (title) title.textContent = 'Choose your option — ' + (style.name || style.id);

    var list = document.getElementById('style-variant-modal-list');
    if (list) {
      var html = '';
      variants.forEach(function (variant, index) {
        html += buildVariantOptionHtml(variant, index, selectedVariantId);
      });
      list.innerHTML = html;
    }

    modal.hidden = false;
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('booking-variant-modal-open');
  }

  function closeVariantModal() {
    var modal = document.getElementById('style-variant-modal');
    var backdrop = document.getElementById('style-variant-modal-backdrop');
    if (modal) modal.hidden = true;
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('booking-variant-modal-open');
    variantModalStyleId = '';
  }

  function syncVariantSelectionFromDom() {
    var checked = document.querySelector('input[name="style-variant"]:checked');
    if (checked) selectedVariantId = checked.value || '';
  }

  function setupVariantPicker() {
    var container = document.getElementById('style-variant-list');
    if (container && container.dataset.bound !== '1') {
      container.dataset.bound = '1';
      container.addEventListener('change', function (e) {
        var input = e.target;
        if (!input || input.name !== 'style-variant') return;
        selectedVariantId = input.value || '';
        maybeInvalidateAppliedPromo();
        updatePricingDisplay();
      });
    }

    var modalList = document.getElementById('style-variant-modal-list');
    if (modalList && modalList.dataset.bound !== '1') {
      modalList.dataset.bound = '1';
      modalList.addEventListener('change', function (e) {
        var input = e.target;
        if (!input || input.name !== 'style-variant') return;
        selectedVariantId = input.value || '';
      });
    }

    var modalContinue = document.getElementById('style-variant-modal-continue');
    if (modalContinue && modalContinue.dataset.bound !== '1') {
      modalContinue.dataset.bound = '1';
      modalContinue.addEventListener('click', function () {
        syncVariantSelectionFromDom();
        if (!selectedVariantId) {
          showFeedback('Choose an option to continue.', true);
          return;
        }
        if (selectedStyle) {
          renderVariantPicker(selectedStyle);
          applyLockedStyleUI();
          updateStyleSelectionSummary();
        }
        maybeInvalidateAppliedPromo();
        updatePricingDisplay();
        updateBookingVariantUrl();
        closeVariantModal();
      });
    }
  }

  function updateBookingVariantUrl() {
    if (!lockedStyleSelection || !selectedVariantId || !window.history || !window.history.replaceState) return;
    var params = new URLSearchParams(window.location.search);
    params.set('style', preselectedStyleId || (selectedStyle && selectedStyle.id) || '');
    params.set('variant', selectedVariantId);
    var next = window.location.pathname + '?' + params.toString();
    window.history.replaceState(null, '', next);
    preselectedVariantId = selectedVariantId;
  }

  function applyLockedStyleUI() {
    var selectWrap = document.getElementById('style-select-field-wrap');
    var summary = document.getElementById('style-selection-summary');
    if (selectWrap) selectWrap.hidden = lockedStyleSelection;
    if (summary) summary.hidden = !lockedStyleSelection;
    if (styleSelect) {
      if (lockedStyleSelection) styleSelect.removeAttribute('required');
      else styleSelect.setAttribute('required', '');
    }
    if (lockedStyleSelection) updateStyleSelectionSummary();
  }

  function updateStyleSelectionSummary() {
    var textEl = document.getElementById('style-selection-summary-text');
    if (!textEl || !selectedStyle) return;
    var variant = getSelectedVariant(selectedStyle);
    var name = selectedStyle.name || selectedStyle.id || '';
    if (variant) {
      textEl.textContent = name + ' \u2014 ' + variant.label + ' (' + money(variant.price) + ')';
      return;
    }
    var base = typeof selectedStyle.base === 'number' ? selectedStyle.base : 0;
    textEl.textContent = name + (base > 0 ? ' (' + money(base) + ')' : '');
  }

  function renderAddonPicker(style) {
    var field = document.getElementById('style-addon-field-wrap');
    var container = document.getElementById('booking-addon-options');
    selectedAddonId = '';
    if (!field || !container) return;

    var addons = style && Array.isArray(style.addons) ? style.addons : [];
    if (!style || !addons.length) {
      field.hidden = true;
      container.innerHTML = '';
      return;
    }

    field.hidden = false;
    var html =
      '<label class="booking-addon-option">' +
      '<input type="radio" name="booking-addon" value="" checked />' +
      '<span class="booking-addon-option__label">No add-on</span>' +
      '</label>';

    addons.forEach(function (addon) {
      html +=
        '<label class="booking-addon-option">' +
        '<input type="radio" name="booking-addon" value="' +
        escapeHtml(addon.id) +
        '" />' +
        '<span class="booking-addon-option__label">' +
        escapeHtml(addon.name) +
        ' (+' +
        money(addon.price) +
        ')</span>' +
        '</label>';
    });

    container.innerHTML = html;
  }

  function setupAddonPicker() {
    var container = document.getElementById('booking-addon-options');
    if (!container || container.dataset.bound === '1') return;
    container.dataset.bound = '1';
    container.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || input.name !== 'booking-addon') return;
      selectedAddonId = input.value || '';
      maybeInvalidateAppliedPromo();
      updatePricingDisplay();
    });
  }

  function getRawSubtotal(style) {
    var base = effectiveStyleBase(style);
    var addon = getSelectedAddon(style);
    var addonPrice = addon && typeof addon.price === 'number' ? addon.price : 0;
    return base + addonPrice;
  }

  function getRawSubtotalCents(style) {
    return Math.round(getRawSubtotal(style || selectedStyle) * 100);
  }

  function setPromoFeedback(message, isError) {
    var el = document.getElementById('promo-code-feedback');
    if (!el) return;
    var text = message ? String(message).trim() : '';
    el.hidden = !text;
    el.textContent = text;
    el.classList.toggle('booking-promo-feedback--error', !!isError);
    el.classList.toggle('booking-promo-feedback--success', !!text && !isError);
  }

  function clearAppliedPromo(message, isError) {
    appliedPromo = null;
    lastValidatedSubtotalCents = null;
    setPromoFeedback(message || '', isError);
    updatePricingDisplay();
  }

  function maybeInvalidateAppliedPromo() {
    if (!appliedPromo) return;
    if (getRawSubtotalCents() !== lastValidatedSubtotalCents) {
      clearAppliedPromo('Your service changed — re-apply your promo code.', true);
    }
  }

  function productImageUrl(path) {
    if (!path) return '';
    if (window.StyldTenant && window.StyldTenant.resolveStyleCoverUrl) {
      return window.StyldTenant.resolveStyleCoverUrl(path) || '';
    }
    var base = (cfg.supabaseUrl || '').replace(/\/$/, '');
    if (!base) return '';
    var objectPath = String(path).replace(/^\/+/, '').replace(/^style-covers\//, '');
    return base + '/storage/v1/object/public/style-covers/' + objectPath;
  }

  function getBookingProductImageUrls(product) {
    if (!product || typeof product !== 'object') return [];
    var paths = [];
    if (Array.isArray(product.imagePaths) && product.imagePaths.length) {
      paths = product.imagePaths.slice();
    } else if (product.storagePath) {
      paths = [product.storagePath];
    }
    return paths.map(productImageUrl).filter(Boolean);
  }

  var bookingProductModalState = { product: null, imageIndex: 0 };

  function renderBookingProductModal() {
    var product = bookingProductModalState.product;
    if (!product) return;

    var urls = getBookingProductImageUrls(product);
    var index = bookingProductModalState.imageIndex;
    if (index >= urls.length) index = 0;
    if (index < 0) index = urls.length - 1;
    bookingProductModalState.imageIndex = index;

    var titleEl = document.getElementById('booking-product-modal-title');
    var priceEl = document.getElementById('booking-product-modal-price');
    var descEl = document.getElementById('booking-product-modal-desc');
    var imageEl = document.getElementById('booking-product-modal-image');
    var counterEl = document.getElementById('booking-product-modal-counter');
    var actionsEl = document.getElementById('booking-product-modal-actions');
    var prevBtn = document.querySelector('[data-booking-product-modal-prev]');
    var nextBtn = document.querySelector('[data-booking-product-modal-next]');
    var showNav = urls.length > 1;
    var quantity = getProductQuantity(product.id);

    if (titleEl) titleEl.textContent = product.title || 'Product';
    if (priceEl) {
      priceEl.textContent =
        quantity > 1
          ? money(product.price) + ' each · ' + money(product.price * quantity) + ' total'
          : money(product.price);
    }
    if (descEl) {
      var fullDesc = String(product.description || '').trim();
      descEl.textContent = fullDesc;
      descEl.hidden = !fullDesc;
    }
    if (imageEl) {
      imageEl.src = urls[index] || '';
      imageEl.hidden = !urls.length;
    }
    if (counterEl) {
      counterEl.hidden = !showNav;
      counterEl.textContent = showNav ? index + 1 + ' / ' + urls.length : '';
    }
    if (prevBtn) prevBtn.hidden = !showNav;
    if (nextBtn) nextBtn.hidden = !showNav;
    if (actionsEl) {
      if (isProductOutOfStock(product)) {
        actionsEl.innerHTML =
          '<p class="booking-product-modal-qty__label booking-product-modal-qty__label--out">Out of stock</p>' +
          '<p class="booking-product-option__unavailable">This product cannot be added to your booking right now.</p>';
      } else {
        var stockLabel = formatProductStockLabel(product);
        actionsEl.innerHTML =
          (stockLabel
            ? '<p class="booking-product-modal-qty__label">' + escapeHtml(stockLabel) + '</p>'
            : '<p class="booking-product-modal-qty__label">Quantity</p>') +
          buildBookingProductQtyHtml(product, quantity);
      }
    }
  }

  function openBookingProductModal(productId) {
    var product = productsCatalog.find(function (item) {
      return item && item.id === productId;
    });
    if (!product) return;

    bookingProductModalState.product = product;
    bookingProductModalState.imageIndex = 0;
    renderBookingProductModal();

    var modal = document.getElementById('booking-product-modal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('profile-product-modal-open');
  }

  function closeBookingProductModal() {
    var modal = document.getElementById('booking-product-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('profile-product-modal-open');
    bookingProductModalState.product = null;
    bookingProductModalState.imageIndex = 0;
  }

  function stepBookingProductModal(delta) {
    if (!bookingProductModalState.product) return;
    var urls = getBookingProductImageUrls(bookingProductModalState.product);
    if (urls.length <= 1) return;
    bookingProductModalState.imageIndex =
      (bookingProductModalState.imageIndex + delta + urls.length) % urls.length;
    renderBookingProductModal();
  }

  function setupBookingProductModal() {
    if (document.body.dataset.bookingProductModalBound) return;
    document.body.dataset.bookingProductModalBound = '1';

    document.addEventListener('click', function (e) {
      var detailBtn = e.target.closest
        ? e.target.closest('.booking-product-option__details, .booking-product-option__thumb-btn')
        : null;
      if (detailBtn) {
        e.preventDefault();
        e.stopPropagation();
        var productId = detailBtn.getAttribute('data-product-id');
        if (productId) openBookingProductModal(productId);
        return;
      }
      if (e.target.closest && e.target.closest('[data-booking-product-modal-close]')) {
        closeBookingProductModal();
        return;
      }
      if (e.target.closest && e.target.closest('[data-booking-product-modal-prev]')) {
        stepBookingProductModal(-1);
        return;
      }
      if (e.target.closest && e.target.closest('[data-booking-product-modal-next]')) {
        stepBookingProductModal(1);
        return;
      }
      var minusBtn = e.target.closest ? e.target.closest('[data-booking-product-qty-minus]') : null;
      if (minusBtn) {
        e.preventDefault();
        var minusId = minusBtn.getAttribute('data-product-id');
        var minusProduct = minusId ? findBookingProduct(minusId) : null;
        if (minusId && minusProduct && canSelectBookingProduct(minusProduct)) {
          setProductQuantity(minusId, getProductQuantity(minusId) - 1);
        }
        return;
      }
      var plusBtn = e.target.closest ? e.target.closest('[data-booking-product-qty-plus]') : null;
      if (plusBtn) {
        e.preventDefault();
        var plusId = plusBtn.getAttribute('data-product-id');
        var plusProduct = plusId ? findBookingProduct(plusId) : null;
        if (plusId && plusProduct && canSelectBookingProduct(plusProduct)) {
          setProductQuantity(plusId, getProductQuantity(plusId) + 1);
        }
      }
    });

    document.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || !input.matches || !input.matches('[data-booking-product-qty-input]')) return;
      var productId = input.getAttribute('data-product-id');
      var product = productId ? findBookingProduct(productId) : null;
      if (productId && product && canSelectBookingProduct(product)) {
        setProductQuantity(productId, input.value);
      } else if (productId) {
        setProductQuantity(productId, 0);
      }
    });

    document.addEventListener('keydown', function (e) {
      var modal = document.getElementById('booking-product-modal');
      if (!modal || modal.hidden) return;
      if (e.key === 'Escape') closeBookingProductModal();
      if (e.key === 'ArrowLeft') stepBookingProductModal(-1);
      if (e.key === 'ArrowRight') stepBookingProductModal(1);
    });
  }

  function bookingProductInputId(productId) {
    return 'booking-product-' + String(productId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  function normalizeProductQuantity(value) {
    var qty = parseInt(value, 10);
    if (!Number.isFinite(qty) || qty < 0) return 0;
    if (qty > 99) return 99;
    return qty;
  }

  function productInventoryApi() {
    return window.StyldTenant || {};
  }

  function isProductOutOfStock(product) {
    var fn = productInventoryApi().isProductOutOfStock;
    if (fn) return fn(product);
    return !!(product && product.trackInventory === true && (product.quantityInStock || 0) <= 0);
  }

  function getProductMaxOrderQuantity(product) {
    var fn = productInventoryApi().getProductMaxOrderQuantity;
    if (fn) return fn(product);
    if (isProductOutOfStock(product)) return 0;
    if (!product || product.trackInventory !== true) return 99;
    return Math.min(99, Number(product.quantityInStock) || 0);
  }

  function formatProductStockLabel(product) {
    var fn = productInventoryApi().formatProductStockLabel;
    if (fn) return fn(product);
    if (!product || product.trackInventory !== true) return '';
    var stock = Number(product.quantityInStock) || 0;
    return stock <= 0 ? 'Out of stock' : stock + ' in stock';
  }

  function findBookingProduct(productId) {
    return productsCatalog.find(function (item) {
      return item && item.id === productId;
    });
  }

  function canSelectBookingProduct(product) {
    return !isProductOutOfStock(product);
  }

  function clearOutOfStockSelections() {
    productsCatalog.forEach(function (product) {
      if (isProductOutOfStock(product) && getProductQuantity(product.id) > 0) {
        delete selectedProductIds[product.id];
      }
    });
  }

  function getProductQuantity(productId) {
    var stored = selectedProductIds[productId];
    if (stored === true) return 1;
    return normalizeProductQuantity(stored);
  }

  function setProductQuantity(productId, quantity) {
    var product = findBookingProduct(productId);
    if (!product) return;
    if (isProductOutOfStock(product)) {
      delete selectedProductIds[productId];
      syncBookingProductQuantityUi(productId);
      updatePricingDisplay();
      return;
    }
    var maxQty = getProductMaxOrderQuantity(product);
    var qty = normalizeProductQuantity(quantity);
    if (maxQty <= 0) qty = 0;
    else if (qty > maxQty) qty = maxQty;
    if (qty <= 0) delete selectedProductIds[productId];
    else selectedProductIds[productId] = qty;
    syncBookingProductQuantityUi(productId);
    updatePricingDisplay();
  }

  function buildBookingProductQtyHtml(product, quantity) {
    var productId = product.id;
    var maxQty = getProductMaxOrderQuantity(product);
    var outOfStock = maxQty <= 0;
    var atMax = quantity >= maxQty && maxQty > 0;
    return (
      '<div class="booking-product-qty' +
      (outOfStock ? ' booking-product-qty--disabled' : '') +
      '" data-product-id="' +
      escapeHtml(productId) +
      '">' +
      '<button type="button" class="booking-product-qty__btn" data-booking-product-qty-minus data-product-id="' +
      escapeHtml(productId) +
      '" aria-label="Decrease quantity"' +
      (outOfStock || quantity <= 0 ? ' disabled' : '') +
      '>−</button>' +
      '<input type="number" class="booking-product-qty__input" data-booking-product-qty-input data-product-id="' +
      escapeHtml(productId) +
      '" min="0" max="' +
      maxQty +
      '" step="1" inputmode="numeric" value="' +
      quantity +
      '" aria-label="Quantity"' +
      (outOfStock ? ' disabled' : '') +
      ' />' +
      '<button type="button" class="booking-product-qty__btn" data-booking-product-qty-plus data-product-id="' +
      escapeHtml(productId) +
      '" aria-label="Increase quantity"' +
      (outOfStock || atMax ? ' disabled' : '') +
      '>+</button>' +
      '</div>'
    );
  }

  function validateBookingProductInventory() {
    var invalid = null;
    productsCatalog.forEach(function (product) {
      if (invalid) return;
      var qty = getProductQuantity(product.id);
      if (qty <= 0) return;
      if (isProductOutOfStock(product)) {
        invalid = (product.title || 'A product') + ' is out of stock. Remove it to continue.';
        return;
      }
      var maxQty = getProductMaxOrderQuantity(product);
      if (qty > maxQty) {
        invalid =
          'Only ' +
          maxQty +
          ' of ' +
          (product.title || 'this product') +
          (maxQty === 1 ? ' is' : ' are') +
          ' in stock.';
      }
    });
    return invalid;
  }

  function syncBookingProductQuantityUi(productId) {
    var qty = getProductQuantity(productId);
    document.querySelectorAll('[data-booking-product-qty-input][data-product-id="' + productId + '"]').forEach(function (input) {
      input.value = String(qty);
    });
    var product = findBookingProduct(productId);
    document.querySelectorAll('.booking-product-option[data-product-id="' + productId + '"]').forEach(function (row) {
      row.classList.toggle('is-selected', qty > 0);
      row.classList.toggle('is-out-of-stock', !!(product && isProductOutOfStock(product)));
      if (!product) return;
      var priceWrap = row.querySelector('.booking-product-option__price');
      if (!priceWrap) return;
      var lineTotalEl = priceWrap.querySelector('.booking-product-option__line-total');
      if (qty > 1) {
        if (!lineTotalEl) {
          lineTotalEl = document.createElement('span');
          lineTotalEl.className = 'booking-product-option__line-total';
          priceWrap.appendChild(lineTotalEl);
        }
        lineTotalEl.textContent = money(product.price * qty);
      } else if (lineTotalEl) {
        lineTotalEl.remove();
      }
    });
    document.querySelectorAll('.booking-product-qty[data-product-id="' + productId + '"]').forEach(function (wrap) {
      if (!product) return;
      var maxQty = getProductMaxOrderQuantity(product);
      var minus = wrap.querySelector('[data-booking-product-qty-minus]');
      var plus = wrap.querySelector('[data-booking-product-qty-plus]');
      var input = wrap.querySelector('[data-booking-product-qty-input]');
      if (minus) minus.disabled = qty <= 0 || maxQty <= 0;
      if (plus) plus.disabled = qty >= maxQty || maxQty <= 0;
      if (input) {
        input.max = String(maxQty);
        input.disabled = maxQty <= 0;
      }
    });
    if (bookingProductModalState.product && bookingProductModalState.product.id === productId) {
      renderBookingProductModal();
    }
  }

  function getSelectedBookingProducts() {
    return productsCatalog.filter(function (product) {
      return getProductQuantity(product.id) > 0;
    });
  }

  function getProductsSubtotal() {
    return productsCatalog.reduce(function (sum, product) {
      var qty = getProductQuantity(product.id);
      if (qty <= 0) return sum;
      var price = typeof product.price === 'number' ? product.price : 0;
      return sum + price * qty;
    }, 0);
  }

  function renderBookingProducts() {
    var section = document.getElementById('booking-products-section');
    var list = document.getElementById('booking-products-list');
    if (!list) return;

    if (!productsCatalog.length) {
      if (section) section.hidden = true;
      list.innerHTML = '';
      return;
    }

    if (section) section.hidden = false;
    clearOutOfStockSelections();
    list.innerHTML = productsCatalog
      .map(function (product) {
        var outOfStock = isProductOutOfStock(product);
        var quantity = outOfStock ? 0 : getProductQuantity(product.id);
        var stockLabel = formatProductStockLabel(product);
        var imageUrl = getBookingProductImageUrls(product)[0] || '';
        var thumb = imageUrl
          ? '<button type="button" class="booking-product-option__thumb-btn" data-product-id="' +
            escapeHtml(product.id) +
            '" aria-label="View ' +
            escapeHtml(product.title || 'product') +
            ' details"><img class="booking-product-option__thumb" src="' +
            escapeHtml(imageUrl) +
            '" alt="" loading="lazy" decoding="async" /></button>'
          : '<button type="button" class="booking-product-option__thumb-btn booking-product-option__thumb-btn--empty" data-product-id="' +
            escapeHtml(product.id) +
            '" aria-label="View ' +
            escapeHtml(product.title || 'product') +
            ' details"><span class="booking-product-option__thumb booking-product-option__thumb--empty" aria-hidden="true"></span></button>';
        var shortDesc = String(product.description || '').trim();
        if (shortDesc.length > 100) shortDesc = shortDesc.slice(0, 97) + '…';
        var lineTotal =
          quantity > 1
            ? '<span class="booking-product-option__line-total">' + money(product.price * quantity) + '</span>'
            : '';
        return (
          '<div class="booking-product-option' +
          (quantity > 0 ? ' is-selected' : '') +
          (outOfStock ? ' is-out-of-stock' : '') +
          '" data-product-id="' +
          escapeHtml(product.id) +
          '">' +
          '<div class="booking-product-option__body">' +
          thumb +
          '<span class="booking-product-option__text">' +
          '<span class="booking-product-option__title">' +
          escapeHtml(product.title) +
          '</span>' +
          (stockLabel
            ? '<span class="booking-product-option__stock' +
              (outOfStock ? ' booking-product-option__stock--out' : '') +
              '">' +
              escapeHtml(stockLabel) +
              '</span>'
            : '') +
          (shortDesc
            ? '<span class="booking-product-option__desc">' + escapeHtml(shortDesc) + '</span>'
            : '') +
          '</span>' +
          '<span class="booking-product-option__price">' +
          money(product.price) +
          lineTotal +
          '</span>' +
          '</div>' +
          (outOfStock
            ? '<p class="booking-product-option__unavailable">Unavailable</p>'
            : buildBookingProductQtyHtml(product, quantity)) +
          '<button type="button" class="booking-product-option__details" data-product-id="' +
          escapeHtml(product.id) +
          '">Details</button>' +
          '</div>'
        );
      })
      .join('');
  }

  function setupBookingProducts() {
    var list = document.getElementById('booking-products-list');
    if (!list || list.dataset.bound === '1') return;
    list.dataset.bound = '1';

    if (preselectedProductId && productsCatalog.some(function (p) { return p.id === preselectedProductId; })) {
      var preProduct = findBookingProduct(preselectedProductId);
      if (preProduct && !isProductOutOfStock(preProduct)) {
        selectedProductIds[preselectedProductId] = Math.min(1, getProductMaxOrderQuantity(preProduct));
      }
    }

    renderBookingProducts();
  }

  function hasUnappliedPromoInput() {
    var input = document.getElementById('promo-code-input');
    if (!input) return false;
    var typed = String(input.value || '').trim();
    if (!typed) return false;
    if (!appliedPromo) return true;
    return typed.toUpperCase() !== String(appliedPromo.code || '').toUpperCase();
  }

  function validatePromoCode(code) {
    var normalized = String(code || '').trim().toUpperCase();
    if (!normalized) {
      return Promise.reject(new Error('Enter a promo code.'));
    }
    var subtotalCents = getRawSubtotalCents();
    return edgeFunction('validate-booking-promo', {
      subdomain: subdomain,
      code: normalized,
      subtotalCents: subtotalCents,
    }).then(function (result) {
      if (!result || result.valid === false) {
        throw new Error(
          (result && (result.message || result.error)) || 'This promo code is not valid.',
        );
      }
      var discountCents = result.discountCents;
      if (discountCents == null) discountCents = result.discountAmountCents;
      if (discountCents == null && result.discountAmount != null) {
        discountCents = Math.round(Number(result.discountAmount) * 100);
      }
      discountCents = Math.max(0, Math.min(subtotalCents, Number(discountCents) || 0));
      appliedPromo = {
        code: String(result.code || normalized).toUpperCase(),
        discountCents: discountCents,
        label: result.label || '',
      };
      lastValidatedSubtotalCents = subtotalCents;
      var input = document.getElementById('promo-code-input');
      if (input) input.value = appliedPromo.code;
      setPromoFeedback(
        appliedPromo.label
          ? appliedPromo.label + ' applied.'
          : 'Promo code applied.',
        false,
      );
      updatePricingDisplay();
      return appliedPromo;
    });
  }

  function setupPromoCode() {
    var applyBtn = document.getElementById('promo-code-apply');
    var input = document.getElementById('promo-code-input');
    if (!applyBtn || applyBtn.dataset.bound === '1') return;
    applyBtn.dataset.bound = '1';

    applyBtn.addEventListener('click', function () {
      if (!selectedStyle) {
        setPromoFeedback('Choose a service before applying a promo code.', true);
        return;
      }
      applyBtn.disabled = true;
      setPromoFeedback('Checking code…', false);
      validatePromoCode(input ? input.value : '')
        .catch(function (err) {
          clearAppliedPromo(err && err.message ? err.message : 'Could not apply promo code.', true);
        })
        .then(function () {
          applyBtn.disabled = false;
        });
    });

    if (input) {
      input.addEventListener('input', function () {
        if (appliedPromo && hasUnappliedPromoInput()) {
          appliedPromo = null;
          lastValidatedSubtotalCents = null;
          setPromoFeedback('', false);
          updatePricingDisplay();
        }
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyBtn.click();
        }
      });
    }
  }

  function computePricing(style) {
    var base = effectiveStyleBase(style);
    var addon = getSelectedAddon(style);
    var addonPrice = addon && typeof addon.price === 'number' ? addon.price : 0;
    var travelExtraMinutes =
      isTravelBooking() && travelStylist ? Math.max(0, Number(travelStylist.extraTravelMinutes) || 0) : 0;
    var duration = durationMinutesForStyle(style) + travelExtraMinutes;
    var rawSubtotal = base + addonPrice;
    var promoDiscount =
      appliedPromo && typeof appliedPromo.discountCents === 'number'
        ? appliedPromo.discountCents / 100
        : 0;
    promoDiscount = Math.min(rawSubtotal, Math.max(0, promoDiscount));
    var total = Math.max(0, rawSubtotal - promoDiscount);
    var productsSubtotal = getProductsSubtotal();
    var travelFee = isTravelBooking() ? Math.max(0, Number(travelFeeUsd) || 0) : 0;
    var grandTotal = total + productsSubtotal + travelFee;
    var mode = paymentSettings.mode || 'none';
    var deposit = 0;

    if (mode === 'deposit') {
      if ((paymentSettings.depositKind || 'percent') === 'percent') {
        deposit = Math.round(total * (Number(paymentSettings.depositValue) || 0) / 100);
      } else {
        deposit = Math.round(Number(paymentSettings.depositValue) || 0);
      }
    } else if (mode === 'full') {
      deposit = total;
    }

    if (deposit > 0 && deposit < 1) deposit = 1;

    var serviceFee = deposit > 0 ? computeServiceFee(deposit) : 0;
    var totalDue = deposit > 0 ? totalChargeWithFee(deposit) : 0;
    var includedInPrice = isDepositIncludedInPrice();
    var balanceDue =
      mode === 'deposit'
        ? includedInPrice
          ? Math.max(0, total - deposit)
          : total
        : 0;
    var depositLabel = mode === 'full' ? 'Full payment' : 'Deposit';

    return {
      base: base,
      addon: addon,
      addonPrice: addonPrice,
      rawSubtotal: rawSubtotal,
      promoDiscount: promoDiscount,
      promoCode: appliedPromo ? appliedPromo.code : null,
      total: total,
      productsSubtotal: productsSubtotal,
      travelFee: travelFee,
      travelExtraMinutes: travelExtraMinutes,
      travelDistanceMiles: travelDistanceMiles,
      grandTotal: grandTotal,
      duration: duration,
      deposit: deposit,
      serviceFee: serviceFee,
      totalDue: totalDue,
      balanceDue: balanceDue,
      depositLabel: depositLabel,
      depositIncludedInPrice: includedInPrice,
      mode: mode,
    };
  }

  function applyServerFeePreview(fees, pricing) {
    if (!fees) return pricing;
    var preview = Object.assign({}, pricing, {
      deposit: fees.bookingAmountCents / 100,
      serviceFee: fees.serviceFeeCents / 100,
      totalDue: fees.totalChargeCents / 100,
    });
    updateDueBreakdown(preview);
    return preview;
  }

  function updatePricingSummaryLabels(p) {
    function setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    var isInPerson = p.mode === 'none' || p.deposit <= 0;
    var isDepositMode = p.mode === 'deposit' && p.deposit > 0;
    var isFullPayment = p.mode === 'full' && p.deposit > 0;
    var showServiceSubtotal = p.addonPrice > 0;
    var showServiceAfterPromo = p.promoDiscount > 0;
    var summaryLabel;
    var summaryAmount;
    var payNote;

    if (isInPerson) {
      summaryLabel = p.productsSubtotal > 0 ? 'Estimated total' : 'Total at appointment';
      summaryAmount = money(p.grandTotal);
      payNote =
        p.productsSubtotal > 0
          ? 'No payment is required now. Pay your stylist in person when you arrive — service plus any products you selected.'
          : 'No payment is required now. Pay your stylist in person when you arrive for your appointment.';
    } else if (isDepositMode) {
      summaryLabel = 'Estimated total';
      summaryAmount = money(p.grandTotal);
      payNote = 'You pay the deposit now to secure your appointment. The remaining balance is due at your appointment.';
    } else {
      summaryLabel = 'Estimated total';
      summaryAmount = money(p.grandTotal);
      payNote = 'Full payment is collected when you confirm your booking.';
    }

    var serviceTotalWrap = document.getElementById('side-service-total-wrap');
    var lineServiceTotalWrap = document.getElementById('line-service-total-wrap');
    if (serviceTotalWrap) serviceTotalWrap.hidden = !showServiceSubtotal;
    if (lineServiceTotalWrap) lineServiceTotalWrap.hidden = !showServiceSubtotal;
    if (showServiceSubtotal) {
      setText('side-service-total', money(p.rawSubtotal));
      setText('line-service-total', money(p.rawSubtotal));
    }

    var lineServiceAfterPromoWrap = document.getElementById('line-service-after-promo-wrap');
    var sideServiceAfterPromoWrap = document.getElementById('side-service-after-promo-wrap');
    if (lineServiceAfterPromoWrap) lineServiceAfterPromoWrap.hidden = !showServiceAfterPromo;
    if (sideServiceAfterPromoWrap) sideServiceAfterPromoWrap.hidden = !showServiceAfterPromo;
    if (showServiceAfterPromo) {
      setText('line-service-after-promo', money(p.total));
      setText('side-service-after-promo', money(p.total));
    }

    var linePromoRow = document.getElementById('line-promo-row');
    var sidePromoRow = document.getElementById('side-promo-row');
    var showPromo = p.promoDiscount > 0 && !!p.promoCode;
    if (linePromoRow) linePromoRow.hidden = !showPromo;
    if (sidePromoRow) sidePromoRow.hidden = !showPromo;
    if (showPromo) {
      setText('line-promo-code', p.promoCode);
      setText('line-promo-discount', '\u2212' + money(p.promoDiscount));
      setText('side-promo-code', p.promoCode);
      setText('side-promo-discount', '\u2212' + money(p.promoDiscount));
    }

    var lineProductsGroup = document.getElementById('line-products-group');
    var sideProductsGroup = document.getElementById('side-products-group');
    if (lineProductsGroup) lineProductsGroup.hidden = !(p.productsSubtotal > 0);
    if (sideProductsGroup) sideProductsGroup.hidden = !(p.productsSubtotal > 0);
    if (p.productsSubtotal > 0) {
      setText('line-products-total', money(p.productsSubtotal));
      setText('side-products-total', money(p.productsSubtotal));
    }

    var lineTravelRow = document.getElementById('line-travel-fee-row');
    var sideTravelRow = document.getElementById('side-travel-fee-row');
    var showTravelFee = p.travelFee > 0;
    if (lineTravelRow) lineTravelRow.hidden = !showTravelFee;
    if (sideTravelRow) sideTravelRow.hidden = !showTravelFee;
    if (showTravelFee) {
      setText('line-travel-fee', moneyPrecise(p.travelFee));
      setText('side-travel-fee', moneyPrecise(p.travelFee));
    }

    var lineOnlinePayment = document.getElementById('line-online-payment');
    var sideOnlinePayment = document.getElementById('side-online-payment');
    var showOnlinePayment = !isInPerson && p.deposit > 0 && !!window.__STYLD_STRIPE__;
    if (lineOnlinePayment) lineOnlinePayment.hidden = !showOnlinePayment;
    if (sideOnlinePayment) sideOnlinePayment.hidden = !showOnlinePayment;

    if (!isInPerson && p.deposit > 0) {
      setText('side-total-label', isDepositMode ? 'Deposit due now' : 'Total due now');
      setText('line-total-label', isDepositMode ? 'Deposit due now' : 'Total due now');
      setText('side-total', moneyPrecise(isDepositMode ? p.deposit : p.totalDue > 0 ? p.totalDue : p.deposit));
      setText('line-total', moneyPrecise(isDepositMode ? p.deposit : p.totalDue > 0 ? p.totalDue : p.deposit));
    } else {
      setText('side-total-label', summaryLabel);
      setText('line-total-label', summaryLabel);
      setText('side-total', summaryAmount);
      setText('line-total', summaryAmount);
    }

    var sidePayNote = document.getElementById('side-pay-note');
    if (sidePayNote) {
      sidePayNote.hidden = !payNote;
      sidePayNote.textContent = payNote || '';
    }
    var lineDepositDetail = document.getElementById('line-deposit-detail');
    if (lineDepositDetail) {
      lineDepositDetail.hidden = !payNote;
      lineDepositDetail.textContent = payNote || '';
    }

    ['deposit-note-in-person', 'deposit-note-studio', 'deposit-note-house-call'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.hidden = true;
    });

    var sideEstimatedWrap = document.getElementById('side-estimated-total-wrap');
    var lineEstimatedWrap = document.getElementById('line-estimated-total-wrap');
    if (sideEstimatedWrap) sideEstimatedWrap.hidden = false;
    if (lineEstimatedWrap) lineEstimatedWrap.hidden = false;
  }

  function updateDueBreakdown(p) {
    var showDue = p.deposit > 0 && !!window.__STYLD_STRIPE__;
    var isDepositMode = p.mode === 'deposit' && p.deposit > 0;
    var lineBreakdown = document.getElementById('line-due-breakdown');
    var sideBreakdown = document.getElementById('side-due-breakdown');
    var lineDepositPricing = document.getElementById('line-deposit-pricing');
    var sideDepositPricing = document.getElementById('side-deposit-pricing');
    var lineBalanceWrap = document.getElementById('line-balance-wrap');
    var sideBalanceWrap = document.getElementById('side-balance-wrap');
    var lineSeparateNote = document.getElementById('line-deposit-separate-note');
    var sideSeparateNote = document.getElementById('side-deposit-separate-note');
    var lineDueDepositRow = document.getElementById('line-due-deposit-row');
    var lineServiceFeeRow = document.getElementById('line-service-fee-row');
    var showBalance = isDepositMode && p.balanceDue > 0;

    if (lineBreakdown) lineBreakdown.hidden = !showDue;
    if (sideBreakdown) sideBreakdown.hidden = !showDue;
    if (lineDepositPricing) lineDepositPricing.hidden = !showBalance;
    if (sideDepositPricing) sideDepositPricing.hidden = !showBalance;
    if (lineDueDepositRow) lineDueDepositRow.hidden = !showDue || p.mode === 'full';
    if (lineServiceFeeRow) lineServiceFeeRow.hidden = !showDue || !(p.serviceFee > 0);

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    updatePricingSummaryLabels(p);

    if (!showDue) return;

    setText('line-deposit-label', p.depositLabel);
    setText('side-deposit-label', p.depositLabel);
    setText('pay-deposit-label', p.depositLabel);
    setText('line-deposit-amount', moneyPrecise(p.deposit));
    setText('side-deposit-amount', moneyPrecise(p.deposit));
    setText('pay-deposit-preview', moneyPrecise(p.deposit));
    setText('line-service-fee', moneyPrecise(p.serviceFee));
    setText('side-service-fee', moneyPrecise(p.serviceFee));
    setText('pay-service-fee-preview', moneyPrecise(p.serviceFee));
    setText('line-total-due', moneyPrecise(p.totalDue));
    setText('side-total-due', moneyPrecise(p.totalDue));
    setText('pay-total-due-preview', moneyPrecise(p.totalDue));

    var depositNoteText =
      p.depositIncludedInPrice !== false
        ? 'Your deposit counts toward the total service price.'
        : 'Deposit due now is an additional hold on top of the service price. The full service price is still due at your appointment.';
    if (lineBalanceWrap) lineBalanceWrap.hidden = !showBalance;
    if (sideBalanceWrap) sideBalanceWrap.hidden = !showBalance;
    if (lineSeparateNote) {
      lineSeparateNote.hidden = !showBalance;
      if (!lineSeparateNote.hidden) lineSeparateNote.textContent = depositNoteText;
    }
    if (sideSeparateNote) {
      sideSeparateNote.hidden = !showBalance;
      if (!sideSeparateNote.hidden) sideSeparateNote.textContent = depositNoteText;
    }
    if (showBalance) {
      setText('line-balance-due', moneyPrecise(p.balanceDue));
      setText('side-balance-due', moneyPrecise(p.balanceDue));
    }
  }

  function getCancellationPolicySummary() {
    if (window.__STYLD_CANCELLATION_POLICY_SUMMARY__) {
      return String(window.__STYLD_CANCELLATION_POLICY_SUMMARY__).trim();
    }
    if (window.StyldTenant && window.StyldTenant.resolveCancellationPolicySummary) {
      return window.StyldTenant.resolveCancellationPolicySummary(
        window.__STYLD_CANCELLATION_POLICY__ || {},
        window.__STYLD_SITE_CONTENT__ || {},
      );
    }
    var policy = window.__STYLD_CANCELLATION_POLICY__ || {};
    var summary = policy.policySummary || policy.policy_summary || '';
    if (summary) return String(summary).trim();
    var content = window.__STYLD_SITE_CONTENT__ || {};
    if (content.bookingPolicy) return String(content.bookingPolicy).trim();
    return '';
  }

  function getWizardStepIndex(stepId) {
    return WIZARD_STEPS.indexOf(stepId);
  }

  function goToWizardStep(index) {
    if (index < 0 || index >= WIZARD_STEPS.length) return;
    currentWizardStep = index;
    var stepId = WIZARD_STEPS[index];

    document.querySelectorAll('[data-booking-step]').forEach(function (panel) {
      var isActive = panel.getAttribute('data-booking-step') === stepId;
      panel.hidden = !isActive;
      panel.classList.toggle('booking-wizard__panel--active', isActive);
    });

    document.querySelectorAll('[data-wizard-label]').forEach(function (label) {
      var labelStep = label.getAttribute('data-wizard-label');
      var labelIndex = getWizardStepIndex(labelStep);
      label.classList.toggle('booking-wizard__step-label--active', labelIndex === index);
      label.classList.toggle('booking-wizard__step-label--complete', labelIndex >= 0 && labelIndex < index);
    });

    if (bookingForm) {
      bookingForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function fieldsInWizardStep(stepId) {
    var panel = document.querySelector('[data-booking-step="' + stepId + '"]');
    if (!panel) return [];
    return Array.prototype.slice.call(panel.querySelectorAll('input, select, textarea')).filter(function (el) {
      return !el.disabled && el.type !== 'hidden' && el.offsetParent !== null;
    });
  }

  function validateWizardStep(stepId) {
    if (stepId === 'personal') {
      var personalFields = ['full-name', 'phone', 'email'];
      for (var i = 0; i < personalFields.length; i++) {
        var el = document.getElementById(personalFields[i]);
        if (el && !el.checkValidity()) {
          el.reportValidity();
          return false;
        }
      }
      return true;
    }

    if (stepId === 'service') {
      if (!styleSelect || !styleSelect.value) {
        showFeedback('Choose a menu item to continue.', true);
        if (styleSelect) styleSelect.focus();
        return false;
      }
      if (styleExtraVariants(selectedStyle).length > 0 && !getSelectedVariant(selectedStyle)) {
        showFeedback('Choose your service option to continue.', true);
        return false;
      }
      if (isTravelBooking()) {
        var travelAddress = getServiceAddress();
        if (!isAddressComplete(travelAddress)) {
          showFeedback('Pick your address from the suggestions to continue.', true);
          var travelStreet = document.getElementById(
            isHouseCallStyle(selectedStyle) ? 'house-addr-street' : 'travel-addr-street',
          );
          if (travelStreet) travelStreet.focus();
          return false;
        }
        if (travelFeeLoading) {
          showFeedback('Calculating travel fee — please wait a moment.', true);
          return false;
        }
        if (
          travelStylist &&
          travelStylist.feeMode === 'per_mile' &&
          travelFeeUsd <= 0
        ) {
          showFeedback(
            travelFeeError || 'Enter a valid address to calculate the per-mile travel fee.',
            true,
          );
          return false;
        }
      }
      var serviceFields = fieldsInWizardStep('service');
      for (var j = 0; j < serviceFields.length; j++) {
        var field = serviceFields[j];
        if (field.required && !field.checkValidity()) {
          field.reportValidity();
          return false;
        }
      }
      return true;
    }

    if (stepId === 'appointment') {
      if (!selectedStyle) {
        showFeedback('Choose a menu item before picking a time.', true);
        return false;
      }
      if (!selectedSlotStart) {
        showFeedback('Select a date and time for your appointment.', true);
        return false;
      }
      return true;
    }

    return true;
  }

  function bindWizardNav() {
    document.querySelectorAll('[data-next-step]').forEach(function (btn) {
      if (btn.dataset.wizardBound === '1') return;
      btn.dataset.wizardBound = '1';
      btn.addEventListener('click', function () {
        var currentStepId = WIZARD_STEPS[currentWizardStep];
        if (!validateWizardStep(currentStepId)) return;
        var nextStep = btn.getAttribute('data-next-step');
        var nextIndex = getWizardStepIndex(nextStep);
        if (nextIndex >= 0) {
          if (nextStep === 'pricing' && selectedStyle) updatePricingDisplay();
          goToWizardStep(nextIndex);
          if (feedbackEl) feedbackEl.hidden = true;
        }
      });
    });

    document.querySelectorAll('[data-prev-step]').forEach(function (btn) {
      if (btn.dataset.wizardBound === '1') return;
      btn.dataset.wizardBound = '1';
      btn.addEventListener('click', function () {
        var prevStep = btn.getAttribute('data-prev-step');
        var prevIndex = getWizardStepIndex(prevStep);
        if (prevIndex >= 0) {
          goToWizardStep(prevIndex);
          if (feedbackEl) feedbackEl.hidden = true;
        }
      });
    });
  }

  function updateCancellationPolicyDisplay() {
    var policySummary = getCancellationPolicySummary();
    var showPolicy = !!selectedStyle && !!policySummary;

    if (sidebarCancellationPolicy) {
      sidebarCancellationPolicy.classList.toggle('hidden', !showPolicy);
      sidebarCancellationPolicy.setAttribute('aria-hidden', showPolicy ? 'false' : 'true');
    }
    if (sidebarCancellationPolicyText) {
      sidebarCancellationPolicyText.textContent = policySummary;
    }
    if (sidebarDepositNote) {
      sidebarDepositNote.hidden = showPolicy;
    }
    if (cancellationPolicySection) {
      cancellationPolicySection.classList.toggle('hidden', !showPolicy);
      cancellationPolicySection.setAttribute('aria-hidden', showPolicy ? 'false' : 'true');
    }
    if (cancellationPolicyText) {
      cancellationPolicyText.textContent = policySummary;
    }
  }

  function updatePricingDisplay() {
    if (!selectedStyle) return;
    var p = computePricing(selectedStyle);
    var variant = getSelectedVariant(selectedStyle);

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    var serviceLabel = variant ? variant.label : 'Service price';
    setText('side-subtotal-label', serviceLabel);
    setText('line-subtotal-label', serviceLabel);
    setText('line-subtotal', money(p.base));
    setText('side-subtotal', money(p.base));

    var showAddon = !!(p.addon && p.addonPrice > 0);
    var lineAddonWrap = document.getElementById('line-addon-wrap');
    var sideAddonWrap = document.getElementById('side-addon-wrap');
    if (lineAddonWrap) lineAddonWrap.hidden = !showAddon;
    if (sideAddonWrap) sideAddonWrap.hidden = !showAddon;
    if (showAddon) {
      setText('line-addon-name', p.addon.name);
      setText('line-addon', money(p.addonPrice));
      setText('side-addon-label', p.addon.name);
      setText('side-addon', money(p.addonPrice));
    }

    updateDueBreakdown(p);
    updateTravelFeePreviewText();

    if (durationStrip) {
      durationStrip.textContent = 'Estimated duration: ' + formatDurationLabel(p.duration);
    }
    if (durationInput) durationInput.value = String(p.duration);

    var submitLabel = p.deposit > 0 ? 'Confirm payment' : 'Confirm booking';
    if (submitBtn) submitBtn.textContent = submitLabel;

    var showPayment = p.deposit > 0 && window.__STYLD_STRIPE__;
    if (paymentSection) {
      paymentSection.classList.toggle('hidden', !showPayment);
      paymentSection.setAttribute('aria-hidden', showPayment ? 'false' : 'true');
    }
    if (showPayment) {
      prepareStripeForPayment();
    }

    updateCancellationPolicyDisplay();
  }

  function currentDurationMinutes() {
    if (!selectedStyle) return 0;
    return computePricing(selectedStyle).duration;
  }

  function formatAppointmentRange(slotStart, durationMinutes) {
    var end = slotStart.plus({ minutes: durationMinutes });
    if (slotStart.toFormat('a') === end.toFormat('a')) {
      return slotStart.toFormat('h:mm') + ' – ' + end.toFormat('h:mm a');
    }
    return slotStart.toFormat('h:mm a') + ' – ' + end.toFormat('h:mm a');
  }

  function updateSelectedSummary() {
    if (!calSelectedLine) return;
    if (!selectedDate) {
      calSelectedLine.textContent = 'Selected Date: —';
      return;
    }
    if (selectedSlotStart && selectedStyle) {
      calSelectedLine.textContent =
        'Selected: ' +
        selectedDate.toFormat('cccc, LLL d') +
        ' · ' +
        formatAppointmentRange(selectedSlotStart, currentDurationMinutes());
      return;
    }
    calSelectedLine.textContent = 'Selected Date: ' + selectedDate.toFormat('cccc, LLL d');
  }

  function stopSlotsPoll() {
    if (slotsPollTimer) {
      clearInterval(slotsPollTimer);
      slotsPollTimer = null;
    }
  }

  function startSlotsPoll() {
    stopSlotsPoll();
    if (!isTenantSite || !selectedDate || !selectedStyle) return;
    slotsPollTimer = setInterval(function () {
      refreshSlotsAvailability(false);
    }, 60000);
  }

  function fetchUnavailableForDay(dateIso) {
    return rpc('styld_tenant_get_unavailable_times_for_day', {
      p_subdomain: subdomain,
      p_date: dateIso,
    }).then(function (rows) {
      return Array.isArray(rows) ? rows : [];
    });
  }

  function clearSelectedSlot() {
    selectedSlotStart = null;
    if (startsAtInput) startsAtInput.value = '';
    updateSelectedSummary();
  }

  function paintSlots(unavailable, dateIso, pricing) {
    if (!slotsContainer) return;

    var candidates = availability.generateSlotTimes(dateIso);
    var earliest = availability.earliestBookableTime();
    slotsContainer.innerHTML = '';

    if (!candidates.length) {
      slotsContainer.innerHTML = '<p class="booking-slots-placeholder">No times available on this day.</p>';
      return;
    }

    if (
      selectedSlotStart &&
      !availability.isSlotBookable(selectedSlotStart, pricing.duration, unavailable)
    ) {
      clearSelectedSlot();
    }

    var openCount = 0;
    candidates.forEach(function (slotStart) {
      if (slotStart < earliest) return;

      var bookable = availability.isSlotBookable(slotStart, pricing.duration, unavailable);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'time-slot' + (bookable ? '' : ' time-slot--unavailable');
      btn.textContent = slotStart.toFormat('h:mm a');
      btn.setAttribute('data-slot-start', slotStart.toFormat('h:mm a'));
      btn.disabled = !bookable;

      if (selectedSlotStart && slotStart.toMillis() === selectedSlotStart.toMillis()) {
        btn.classList.add('selected');
        btn.textContent = formatAppointmentRange(slotStart, pricing.duration);
      }

      if (bookable) {
        openCount += 1;
        btn.addEventListener('click', function () {
          selectedSlotStart = slotStart;
          if (startsAtInput) startsAtInput.value = slotStart.toISO();
          slotsContainer.querySelectorAll('.time-slot').forEach(function (el) {
            el.classList.toggle('selected', el === btn);
            if (el.disabled) return;
            var startLabel = el.getAttribute('data-slot-start');
            el.textContent =
              el === btn
                ? formatAppointmentRange(slotStart, pricing.duration)
                : startLabel || el.textContent;
          });
          updateSelectedSummary();
        });
      }

      slotsContainer.appendChild(btn);
    });

    if (!openCount) {
      slotsContainer.innerHTML = '<p class="booking-slots-placeholder">All time slots are booked on this day.</p>';
    }
  }

  function refreshSlotsAvailability(showLoading) {
    if (!slotsContainer || !selectedDate || !selectedStyle) {
      return Promise.resolve(null);
    }

    var dateIso = selectedDate.toISODate();
    var pricing = computePricing(selectedStyle);
    var token = ++slotsLoadToken;

    if (showLoading !== false) {
      slotsContainer.innerHTML = '<p class="booking-slots-placeholder">Loading time slots…</p>';
    }

    return fetchUnavailableForDay(dateIso)
      .then(function (unavailable) {
        if (token !== slotsLoadToken) return unavailable;
        cachedUnavailable = unavailable;
        cachedUnavailableDateIso = dateIso;
        paintSlots(unavailable, dateIso, pricing);
        return unavailable;
      })
      .catch(function (err) {
        if (token !== slotsLoadToken) return null;
        cachedUnavailable = null;
        cachedUnavailableDateIso = null;
        clearSelectedSlot();
        var message =
          (err && err.message) ||
          'Could not load availability. Please refresh the page and try again.';
        slotsContainer.innerHTML =
          '<p class="booking-slots-placeholder">' + escapeHtml(message) + '</p>';
        return null;
      });
  }

  function renderSlots() {
    if (!slotsContainer || !selectedDate || !selectedStyle) {
      stopSlotsPoll();
      return Promise.resolve(null);
    }
    startSlotsPoll();
    return refreshSlotsAvailability(true);
  }

  function renderCalendar() {
    if (!calGrid || !calMonthLabel) return;

    calMonthLabel.textContent = viewMonth.toFormat('LLLL yyyy');
    calGrid.innerHTML = '';

    var monthStart = viewMonth.startOf('month');
    var gridStart = calendarGridStart(monthStart);
    var today = DateTime.now().setZone(zone).startOf('day');

    for (var i = 0; i < 42; i++) {
      var day = gridStart.plus({ days: i });
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'booking-calendar__day';
      btn.textContent = String(day.day);

      if (!day.hasSame(viewMonth, 'month')) btn.classList.add('is-outside');
      if (day.hasSame(today, 'day')) btn.classList.add('is-today');
      if (selectedDate && day.hasSame(selectedDate, 'day')) btn.classList.add('is-selected');

      var iso = day.toISODate();
      var isOutside = !day.hasSame(viewMonth, 'month');
      var selectable = !isOutside && !availability.calendarDayDisabledReason(day);
      if (!selectable) {
        btn.classList.add('is-disabled');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', function (pickedIso) {
          return function () {
            selectedDate = DateTime.fromISO(pickedIso, { zone: zone });
            selectedSlotStart = null;
            if (startsAtInput) startsAtInput.value = '';
            updateSelectedSummary();
            renderCalendar();
            renderSlots();
          };
        }(iso));
      }

      calGrid.appendChild(btn);
    }
  }

  function refreshCalendar() {
    renderCalendar();
    return Promise.resolve();
  }

  function onStyleChange() {
    var styleId = styleSelect ? styleSelect.value : '';
    var modalEl = document.getElementById('style-variant-modal');
    if (modalEl && !modalEl.hidden && (!styleId || styleId !== variantModalStyleId)) {
      closeVariantModal();
    }
    selectedStyle = styleById(styleId);
    if (!lockedStyleSelection) {
      selectedVariantId = '';
    } else if (preselectedVariantId) {
      selectedVariantId = preselectedVariantId;
    }
    selectedAddonId = '';
    selectedDate = null;
    selectedSlotStart = null;
    if (startsAtInput) startsAtInput.value = '';
    clearAppliedPromo();

    if (!selectedStyle) {
      renderVariantPicker(null);
      renderAddonPicker(null);
      if (styleGate) styleGate.hidden = false;
      if (durationStrip) durationStrip.textContent = 'Estimated duration: TBD';
      if (slotsContainer) slotsContainer.innerHTML = '';
      stopSlotsPoll();
      updateSelectedSummary();
      updateCancellationPolicyDisplay();
      updateTravelUi();
      return;
    }

    if (styleGate) styleGate.hidden = true;
    if (lockedStyleSelection) {
      var variantWrap = document.getElementById('style-variant-field-wrap');
      if (variantWrap) variantWrap.hidden = true;
    } else {
      renderVariantPicker(selectedStyle);
    }
    renderAddonPicker(selectedStyle);
    updateTravelUi();
    updatePricingDisplay();
    if (lockedStyleSelection) updateStyleSelectionSummary();
    refreshCalendar().then(function () {
      updateSelectedSummary();
      if (slotsContainer) slotsContainer.innerHTML = '';
    });

    if (
      !lockedStyleSelection &&
      variantModalStyleId &&
      selectedStyle.id !== variantModalStyleId &&
      styleExtraVariants(selectedStyle).length > 0
    ) {
      showVariantModal(selectedStyle);
    }
  }

  function getStripePublishableKey() {
    return cfg.stripePk || (window.__STYLD_TENANT__ && window.__STYLD_TENANT__.stripePk) || '';
  }

  function createStripeCheckoutInstance(connectAccountId) {
    var pk = getStripePublishableKey();
    if (!pk || !window.Stripe) return null;
    connectAccountId = connectAccountId ? String(connectAccountId) : '';
    if (connectAccountId) {
      return window.Stripe(pk, { stripeAccount: connectAccountId });
    }
    return window.__STYLD_STRIPE__ || window.Stripe(pk);
  }

  function resolveStripeConnectAccountId(result) {
    if (!result || typeof result !== 'object') return null;
    var id =
      result.stripeAccountId ||
      result.stripe_account_id ||
      result.connectedAccountId ||
      result.connected_account_id ||
      null;
    return id ? String(id) : null;
  }

  function fetchStripeConnectAccount() {
    if (stripeConnectAccountPromise) return stripeConnectAccountPromise;
    stripeConnectAccountPromise = edgeFunction('stripe-booking-connect', { subdomain: subdomain })
      .then(function (result) {
        return resolveStripeConnectAccountId(result);
      })
      .catch(function () {
        stripeConnectAccountPromise = null;
        return null;
      });
    return stripeConnectAccountPromise;
  }

  function teardownStripeCard() {
    if (stripeCard) {
      try {
        stripeCard.destroy();
      } catch (e) {}
      stripeCard = null;
    }
    stripeElements = null;
    stripeCheckout = null;
  }

  function setupStripe(connectAccountId) {
    var mount = document.getElementById('stripe-card-element');
    if (!mount) return;
    connectAccountId = connectAccountId ? String(connectAccountId) : '';
    if (stripeCard && stripeConnectAccountId === connectAccountId && stripeCheckout) return;
    teardownStripeCard();
    stripeConnectAccountId = connectAccountId;
    stripeCheckout = createStripeCheckoutInstance(connectAccountId);
    if (!stripeCheckout) return;
    stripeElements = stripeCheckout.elements();
    stripeCard = stripeElements.create('card');
    stripeCard.mount('#stripe-card-element');
  }

  function prepareStripeForPayment() {
    if (!getStripePublishableKey() || !window.Stripe) return Promise.resolve();
    return fetchStripeConnectAccount().then(function (accountId) {
      setupStripe(accountId);
    });
  }

  function initStripeIfNeeded() {
    var pk = getStripePublishableKey();
    if (pk && window.Stripe && !window.__STYLD_STRIPE__) {
      window.__STYLD_STRIPE__ = window.Stripe(pk);
      window.__STYLD_STRIPE_READY__ = true;
    }
  }

  function requiresBookingApprovalSetting() {
    if (isTravelBooking()) return true;
    if (window.StyldTenant && window.StyldTenant.requiresBookingApproval) {
      return window.StyldTenant.requiresBookingApproval(paymentSettings, isTravelBooking());
    }
    var v = paymentSettings.requireBookingApproval;
    if (v == null) v = paymentSettings.require_booking_approval;
    return v === true;
  }

  function resolveBookingStatus(awaitingPayment) {
    if (window.StyldTenant && window.StyldTenant.resolveBookingStatus) {
      return window.StyldTenant.resolveBookingStatus(
        paymentSettings,
        !!awaitingPayment,
        isTravelBooking(),
      );
    }
    if (awaitingPayment) return 'pending';
    return requiresBookingApprovalSetting() ? 'pending_approval' : 'confirmed';
  }

  function redirectSuccess(bookingId, pricing, contactEmail) {
    var url = '/booking-success?confirmed=1';
    if (requiresBookingApprovalSetting()) url += '&pending_approval=1';
    if (bookingId) url += '&booking_id=' + encodeURIComponent(bookingId);
    if (pricing && pricing.deposit > 0) url += '&deposit=1';
    if (subdomain) url += '&subdomain=' + encodeURIComponent(subdomain);
    if (contactEmail) url += '&contact=' + encodeURIComponent(contactEmail);
    window.location.href = url;
  }

  function isValidBookingUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(id || ''),
    );
  }

  function createBookingUuid() {
    var id;
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else if (window.crypto && typeof crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = Array.from(bytes, function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
      id =
        hex.slice(0, 8) +
        '-' +
        hex.slice(8, 12) +
        '-' +
        hex.slice(12, 16) +
        '-' +
        hex.slice(16, 20) +
        '-' +
        hex.slice(20);
    } else {
      throw new Error('Could not create a booking reference. Please refresh and try again.');
    }
    return String(id).toLowerCase();
  }

  function requireBookingUuid(id, label) {
    var normalized = String(id || '').toLowerCase();
    if (!isValidBookingUuid(normalized)) {
      throw new Error(
        (label || 'Booking reference') +
          ' is invalid (' +
          String(id || 'missing') +
          '). Hard-refresh this page (Ctrl+Shift+R) and try again.',
      );
    }
    return normalized;
  }

  function stripeIds(bookingId, paymentIntentId) {
    bookingId = requireBookingUuid(bookingId, 'Booking id');
    var body = {
      subdomain: subdomain,
      bookingId: bookingId,
      booking_id: bookingId,
    };
    if (paymentIntentId) {
      body.paymentIntentId = paymentIntentId;
      body.payment_intent_id = paymentIntentId;
    }
    return body;
  }

  function fileExtension(file) {
    var match = file && file.name ? file.name.match(/\.[a-zA-Z0-9]+$/) : null;
    return match ? match[0].toLowerCase() : '.jpg';
  }

  function uploadBookingPhoto(bookingId, fileInput, baseName) {
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      return Promise.resolve(null);
    }
    var file = fileInput.files[0];
    var path = subdomain + '/' + bookingId + '/' + baseName + fileExtension(file);
    var url =
      cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/booking-photos/' + path;

    return fetch(url, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        'x-upsert': 'true',
        'Content-Type': file.type || 'application/octet-stream',
      },
      body: file,
    }).then(function (res) {
      if (!res.ok) {
        throw new Error('Could not upload photo. Please try again.');
      }
      return path;
    });
  }

  function uploadBookingPhotos(bookingId) {
    var hairInput = document.getElementById('photo-hair');
    var refInput = document.getElementById('photo-ref');
    var formReq = window.__STYLD_BOOKING_FORM__ || {};

    return uploadBookingPhoto(bookingId, hairInput, 'current-hair').then(function (hairPath) {
      if (formReq.requireCurrentHairPhoto !== false && !hairPath) {
        throw new Error('Please add a current hair photo.');
      }
      return uploadBookingPhoto(bookingId, refInput, 'reference').then(function (refPath) {
        return { hairPath: hairPath, refPath: refPath };
      });
    });
  }

  function buildBookingPayload(options) {
    options = options || {};
    if (!options.bookingId) {
      throw new Error('Internal error: missing booking id.');
    }
    var pricing = computePricing(selectedStyle);
    var addon = getSelectedAddon(selectedStyle);
    var variant = getSelectedVariant(selectedStyle);
    var selectedProducts = getSelectedBookingProducts();
    var name = (document.getElementById('full-name') || {}).value || '';
    var email = (document.getElementById('email') || {}).value || '';
    var phone = (document.getElementById('phone') || {}).value || '';
    var notes = (document.getElementById('notes') || {}).value || '';
    var awaitingPayment = !!options.awaitingPayment;
    var serviceAddress = getServiceAddress();
    var travelBooking = isTravelBooking();

    return {
      id: requireBookingUuid(options.bookingId, 'Booking id'),
      full_name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      style_id: selectedStyle.id,
      style_name: styleDisplayName(selectedStyle, addon),
      selected_variant_id: variant ? variant.id : null,
      selected_variant_label: variant ? variant.label : null,
      selected_variant_price: variant ? variant.price : null,
      selected_addon_id: addon ? addon.id : null,
      selected_addon_name: addon ? addon.name : null,
      selected_addon_price: addon ? addon.price : null,
      appointment_starts_at: selectedSlotStart.toISO(),
      appointment_date: selectedSlotStart.toISODate(),
      appointment_slot: selectedSlotStart.toFormat('h:mm a'),
      duration_minutes: pricing.duration,
      estimated_total: pricing.grandTotal,
      deposit_amount: pricing.deposit,
      subtotal_before_promo: pricing.rawSubtotal,
      promo_code: pricing.promoCode || null,
      promo_discount_amount: pricing.promoDiscount > 0 ? pricing.promoDiscount : null,
      order_products: selectedProducts.length
        ? selectedProducts.map(function (product) {
            return {
              id: product.id,
              title: product.title,
              price: product.price,
              quantity: getProductQuantity(product.id),
            };
          })
        : null,
      products_subtotal: pricing.productsSubtotal > 0 ? pricing.productsSubtotal : null,
      fulfillment_method: pricing.productsSubtotal > 0 ? 'at_appointment' : null,
      booking_status: resolveBookingStatus(awaitingPayment),
      payment_status: awaitingPayment ? 'unpaid' : pricing.deposit > 0 ? 'unpaid' : 'none',
      stripe_payment_intent_id: null,
      current_hair_photo_path: options.hairPath || null,
      reference_photo_path: options.refPath || null,
      source: 'website',
      notes: notes.trim() || null,
      service_address: travelBooking && serviceAddress ? serviceAddress.formatted : null,
      is_travel_booking: travelBooking,
      travel_fee_usd: travelBooking && pricing.travelFee > 0 ? pricing.travelFee : null,
      travel_distance_miles:
        travelBooking && pricing.travelDistanceMiles != null ? pricing.travelDistanceMiles : null,
      travel_extra_minutes: travelBooking ? pricing.travelExtraMinutes : null,
    };
  }

  function insertBookingRecord(payload) {
    return rpc('styld_tenant_insert_booking', {
      p_subdomain: subdomain,
      p_booking: payload,
    }).then(function (result) {
      var savedId = typeof result === 'string' ? result : payload.id;
      return requireBookingUuid(savedId, 'Saved booking id');
    });
  }

  function ensureSlotStillAvailable(slotStart, durationMinutes) {
    var dateIso = slotStart.toISODate();
    var pricing = computePricing(selectedStyle);
    return fetchUnavailableForDay(dateIso).then(function (unavailable) {
      if (!availability.isSlotBookable(slotStart, durationMinutes, unavailable)) {
        var reason = availability.slotConflictReason
          ? availability.slotConflictReason(slotStart, durationMinutes, unavailable)
          : null;
        paintSlots(unavailable, dateIso, pricing);
        throw new Error(
          reason === 'blocked'
            ? 'This time is blocked. Please choose another time.'
            : 'That time slot is no longer available. Please choose another time.',
        );
      }
      return unavailable;
    });
  }

  function isPaymentConfirmSuccess(result) {
    if (!result || result.error) return false;
    if (result.verified === true) return true;
    if (result.ok === true) return true;
    if (result.status === 'succeeded' || result.paymentStatus === 'succeeded') return true;
    return false;
  }

  function markBookingPaid(bookingId, paymentIntentId, paymentStatus) {
    return rpc('styld_tenant_mark_booking_paid', {
      p_subdomain: subdomain,
      p_booking_id: requireBookingUuid(bookingId, 'Booking id'),
      p_payment_status: paymentStatus || 'deposit_paid',
      p_unit_payment_id: paymentIntentId,
      p_booking_status: resolveBookingStatus(false),
    });
  }

  function confirmBookingPayment(bookingId, paymentIntentId, paymentStatus, attempt) {
    attempt = attempt || 0;
    var ids = stripeIds(bookingId, paymentIntentId);
    return edgeFunction(
      'stripe-booking-confirm',
      Object.assign({ email: (document.getElementById('email') || {}).value || '' }, ids),
    )
      .then(function (result) {
        if (!isPaymentConfirmSuccess(result)) {
          throw new Error((result && result.error) || 'Payment could not be verified.');
        }
        return result;
      })
      .catch(function (err) {
        if (attempt >= 4) {
          return markBookingPaid(bookingId, paymentIntentId, paymentStatus).catch(function () {
            throw err;
          });
        }
        return new Promise(function (resolve) {
          setTimeout(resolve, 1000 * (attempt + 1));
        }).then(function () {
          return confirmBookingPayment(bookingId, paymentIntentId, paymentStatus, attempt + 1);
        });
      });
  }

  function runStripePayment(bookingId, pricing, email, paymentStatus) {
    var paymentIntentId = null;
    var ids = stripeIds(bookingId);
    var payBody = {
      email: email,
      subtotalCents: Math.round(pricing.rawSubtotal * 100),
    };
    if (pricing.promoCode) {
      payBody.promoCode = pricing.promoCode;
    } else {
      payBody.amountCents = Math.round(pricing.deposit * 100);
    }

    return edgeFunction(
      'stripe-booking-pay',
      Object.assign(payBody, ids),
    )
      .then(function (payResult) {
        var payBookingId = requireBookingUuid(payResult.bookingId || bookingId, 'Payment booking id');
        if (payResult.fees) {
          applyServerFeePreview(payResult.fees, pricing);
        }
        if (!payResult.clientSecret) {
          throw new Error('Could not start payment.');
        }
        var connectAccountId =
          resolveStripeConnectAccountId(payResult) || stripeConnectAccountId || null;
        if (connectAccountId && connectAccountId !== stripeConnectAccountId) {
          setupStripe(connectAccountId);
        }
        var checkoutStripe = stripeCheckout || window.__STYLD_STRIPE__;
        if (!checkoutStripe || !stripeCard) {
          throw new Error('Payment form is not ready. Please wait a moment and try again.');
        }
        return checkoutStripe.confirmCardPayment(payResult.clientSecret, {
          payment_method: { card: stripeCard },
        })
          .then(function (result) {
            if (result.error) {
              throw new Error(result.error.message || 'Payment failed.');
            }
            paymentIntentId =
              (result.paymentIntent && result.paymentIntent.id) ||
              payResult.paymentIntentId ||
              null;
            if (!paymentIntentId) {
              throw new Error('Payment succeeded but no payment reference was returned.');
            }
            if (
              result.paymentIntent &&
              result.paymentIntent.status &&
              result.paymentIntent.status !== 'succeeded'
            ) {
              throw new Error('Payment is still processing. Please wait a moment and try again.');
            }
            return new Promise(function (resolve) {
              setTimeout(resolve, 600);
            }).then(function () {
              return confirmBookingPayment(payBookingId, paymentIntentId, paymentStatus).then(function () {
                return { bookingId: payBookingId, paymentIntentId: paymentIntentId };
              });
            });
          });
      })
      .catch(function (err) {
        if (paymentIntentId) {
          var detail = err && err.message ? err.message : 'Confirmation failed.';
          throw new Error(
            detail +
              ' Your card was charged — booking ref ' +
              requireBookingUuid(bookingId, 'Booking id') +
              ', payment ref ' +
              paymentIntentId +
              '.',
          );
        }
        throw err;
      });
  }

  function siteContactPhoneLabel() {
    var content = window.__STYLD_SITE_CONTENT__ || {};
    if (window.StyldTenant && window.StyldTenant.resolveSitePhone) {
      return window.StyldTenant.resolveSitePhone(content).display || '';
    }
    return String(content.phoneDisplay || content.phone || '').trim();
  }

  function formatBookingError(err) {
    var msg = err && err.message ? String(err.message) : 'Could not complete booking.';
    var phoneLabel = siteContactPhoneLabel();
    var callHint = phoneLabel ? 'Please call ' + phoneLabel + ' to book' : 'Please call to book';
    if (/supabase_functions/i.test(msg)) {
      return (
        'Online booking is temporarily unavailable (server database setup). ' +
        callHint +
        ', or try again after your site admin fixes the booking trigger.'
      );
    }
    if (/invalid input syntax for type uuid/i.test(msg) && /bk-001/i.test(msg)) {
      var supportHint = phoneLabel
        ? 'If your card was charged, save the payment reference shown below and call ' + phoneLabel + '.'
        : 'Payment confirmation failed on the server. If your card was charged, save the payment reference shown below and contact support.';
      return supportHint;
    }
    return msg;
  }

  function isSlotConflictMessage(message) {
    return /no longer available|not available|already booked|blocked|time slot/i.test(String(message || ''));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!validateWizardStep('service') || !validateWizardStep('appointment')) {
      if (!selectedStyle) goToWizardStep(getWizardStepIndex('service'));
      else if (!selectedSlotStart) goToWizardStep(getWizardStepIndex('appointment'));
      return;
    }
    if (!selectedStyle) {
      showFeedback('Choose a menu item to continue.', true);
      return;
    }
    if (!selectedSlotStart) {
      showFeedback('Select a date and time for your appointment.', true);
      return;
    }
    if (!bookingForm || !bookingForm.reportValidity()) return;
    if (hasUnappliedPromoInput()) {
      showFeedback('Tap Apply to use your promo code, or clear the field before continuing.', true);
      goToWizardStep(getWizardStepIndex('pricing'));
      return;
    }

    var inventoryError = validateBookingProductInventory();
    if (inventoryError) {
      showFeedback(inventoryError, true);
      goToWizardStep(getWizardStepIndex('pricing'));
      return;
    }

    var pricing = computePricing(selectedStyle);
    var slotStart = selectedSlotStart;

    if (submitBtn) submitBtn.disabled = true;
    showFeedback('Checking availability…', false);

    var bookingId = createBookingUuid();
    var needsPayment = pricing.deposit > 0 && window.__STYLD_STRIPE__;
    var paymentStatus = pricing.mode === 'full' ? 'paid' : 'deposit_paid';

    ensureSlotStillAvailable(slotStart, pricing.duration)
      .then(function () {
        showFeedback('Uploading photos…', false);
        return uploadBookingPhotos(bookingId);
      })
      .then(function (photoPaths) {
        var payload = buildBookingPayload({
          bookingId: bookingId,
          hairPath: photoPaths.hairPath,
          refPath: photoPaths.refPath,
          awaitingPayment: needsPayment,
        });

        showFeedback('Saving your booking…', false);
        return insertBookingRecord(payload).then(function (savedId) {
          if (!needsPayment) {
            redirectSuccess(savedId, pricing, payload.email);
            return null;
          }

          showFeedback('Preparing payment…', false);
          return prepareStripeForPayment().then(function () {
            if (!stripeCard) {
              throw new Error('Payment form is not ready yet. Please wait a moment and try again.');
            }
            showFeedback('Processing payment…', false);
            return runStripePayment(savedId, pricing, payload.email, paymentStatus).then(function () {
              redirectSuccess(savedId, pricing, payload.email);
            });
          });
        });
      })
      .catch(function (err) {
        var msg = formatBookingError(err);
        showFeedback(msg, true);
        if (submitBtn) submitBtn.disabled = false;
        if (isSlotConflictMessage(msg)) {
          refreshSlotsAvailability(true);
        }
      });
  }

  if (calPrev) {
    calPrev.addEventListener('click', function () {
      viewMonth = viewMonth.minus({ months: 1 });
      refreshCalendar();
    });
  }
  if (calNext) {
    calNext.addEventListener('click', function () {
      viewMonth = viewMonth.plus({ months: 1 });
      refreshCalendar();
    });
  }
  if (styleSelect) styleSelect.addEventListener('change', onStyleChange);
  if (bookingForm) bookingForm.addEventListener('submit', handleSubmit);

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && selectedDate && selectedStyle) {
      refreshSlotsAvailability(false);
    }
  });

  initStripeIfNeeded();
  setupAddonPicker();
  setupVariantPicker();
  bindWizardNav();
  setupPromoCode();
  setupBookingProducts();
  setupBookingProductModal();
  setupTravelBookingUi();

  lockedStyleSelection = !!preselectedStyleId;
  if (preselectedVariantId) selectedVariantId = preselectedVariantId;

  if (preselectedStyleId && styleSelect) {
    styleSelect.value = preselectedStyleId;
  }

  goToWizardStep(0);
  onStyleChange();
  applyLockedStyleUI();

  if (preselectedStyleId) {
    var preStyle = styleById(preselectedStyleId);
    if (preStyle && styleExtraVariants(preStyle).length > 0 && !preselectedVariantId) {
      showVariantModal(preStyle);
    } else {
      updatePricingDisplay();
    }
  }
})();
