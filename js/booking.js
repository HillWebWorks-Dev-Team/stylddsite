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

  var viewMonth = DateTime.now().setZone(zone).startOf('month');
  var selectedDate = null;
  var selectedSlotStart = null;
  var selectedStyle = null;
  var stripeCard = null;
  var stripeElements = null;

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

  function styleById(id) {
    return styles.find(function (s) { return s.id === id; }) || null;
  }

  function durationMinutesForStyle(style) {
    var duration = style && style.durationMinutes;
    if (typeof duration === 'number' && duration > 0) return Math.round(duration);
    return 120;
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

  function computePricing(style) {
    var base = typeof style.base === 'number' ? style.base : 0;
    var duration = durationMinutesForStyle(style);
    var total = base;
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
    var balanceDue = mode === 'deposit' ? Math.max(0, total - deposit) : 0;
    var depositLabel = mode === 'full' ? 'Full payment' : 'Deposit';

    return {
      base: base,
      total: total,
      duration: duration,
      deposit: deposit,
      serviceFee: serviceFee,
      totalDue: totalDue,
      balanceDue: balanceDue,
      depositLabel: depositLabel,
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

  function updateDueBreakdown(p) {
    var showDue = p.deposit > 0;
    var lineBreakdown = document.getElementById('line-due-breakdown');
    var sideBreakdown = document.getElementById('side-due-breakdown');
    var lineBalanceWrap = document.getElementById('line-balance-wrap');
    var sideBalanceWrap = document.getElementById('side-balance-wrap');

    if (lineBreakdown) lineBreakdown.hidden = !showDue;
    if (sideBreakdown) sideBreakdown.hidden = !showDue;

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    if (!showDue) return;

    setText('line-deposit-label', p.depositLabel + ':');
    setText('side-deposit-label', p.depositLabel);
    setText('pay-deposit-label', p.depositLabel + ':');
    setText('line-deposit-amount', moneyPrecise(p.deposit));
    setText('side-deposit-amount', moneyPrecise(p.deposit));
    setText('pay-deposit-preview', moneyPrecise(p.deposit));
    setText('line-service-fee', moneyPrecise(p.serviceFee));
    setText('side-service-fee', moneyPrecise(p.serviceFee));
    setText('pay-service-fee-preview', moneyPrecise(p.serviceFee));
    setText('line-total-due', moneyPrecise(p.totalDue));
    setText('side-total-due', moneyPrecise(p.totalDue));
    setText('pay-total-due-preview', moneyPrecise(p.totalDue));

    var showBalance = p.mode === 'deposit' && p.balanceDue > 0;
    if (lineBalanceWrap) lineBalanceWrap.hidden = !showBalance;
    if (sideBalanceWrap) sideBalanceWrap.hidden = !showBalance;
    if (showBalance) {
      setText('line-balance-due', moneyPrecise(p.balanceDue));
      setText('side-balance-due', moneyPrecise(p.balanceDue));
    }
  }

  function updatePricingDisplay() {
    if (!selectedStyle) return;
    var p = computePricing(selectedStyle);

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    setText('line-subtotal', money(p.base));
    setText('side-subtotal', money(p.base));
    setText('line-total', money(p.total));
    setText('side-total', money(p.total));
    updateDueBreakdown(p);

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
  }

  function currentDurationMinutes() {
    if (!selectedStyle) return 0;
    return durationMinutesForStyle(selectedStyle);
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
      .catch(function () {
        if (token !== slotsLoadToken) return null;
        cachedUnavailable = null;
        cachedUnavailableDateIso = null;
        clearSelectedSlot();
        slotsContainer.innerHTML =
          '<p class="booking-slots-placeholder">Could not load availability. Please refresh the page and try again.</p>';
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

      if (day.month !== viewMonth.month) btn.classList.add('is-outside');
      if (day.hasSame(today, 'day')) btn.classList.add('is-today');
      if (selectedDate && day.hasSame(selectedDate, 'day')) btn.classList.add('is-selected');

      var iso = day.toISODate();
      var selectable = !availability.calendarDayDisabledReason(day);
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
    selectedStyle = styleById(styleId);
    selectedDate = null;
    selectedSlotStart = null;
    if (startsAtInput) startsAtInput.value = '';

    if (!selectedStyle) {
      if (styleGate) styleGate.hidden = false;
      if (durationStrip) durationStrip.textContent = 'Estimated duration: TBD';
      if (slotsContainer) slotsContainer.innerHTML = '';
      stopSlotsPoll();
      updateSelectedSummary();
      return;
    }

    if (styleGate) styleGate.hidden = true;
    updatePricingDisplay();
    refreshCalendar().then(function () {
      updateSelectedSummary();
      if (slotsContainer) slotsContainer.innerHTML = '';
    });
  }

  function setupStripe() {
    if (!window.__STYLD_STRIPE__ || !paymentSection) return;
    var mount = document.getElementById('stripe-card-element');
    if (!mount || stripeCard) return;
    stripeElements = window.__STYLD_STRIPE__.elements();
    stripeCard = stripeElements.create('card');
    stripeCard.mount('#stripe-card-element');
  }

  function initStripeIfNeeded() {
    var pk = cfg.stripePk || '';
    if (pk && window.Stripe && !window.__STYLD_STRIPE__) {
      window.__STYLD_STRIPE__ = window.Stripe(pk);
      window.__STYLD_STRIPE_READY__ = true;
    }
    setupStripe();
  }

  function redirectSuccess(bookingId, pricing) {
    var url = '/booking-success?confirmed=1';
    if (pricing && pricing.deposit > 0) url += '&deposit=1';
    if (subdomain) url += '&subdomain=' + encodeURIComponent(subdomain);
    window.location.href = url;
  }

  function isValidBookingUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(id || ''),
    );
  }

  function newBookingId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (window.crypto && typeof crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = Array.from(bytes, function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
      return (
        hex.slice(0, 8) +
        '-' +
        hex.slice(8, 12) +
        '-' +
        hex.slice(12, 16) +
        '-' +
        hex.slice(16, 20) +
        '-' +
        hex.slice(20)
      );
    }
    throw new Error('Could not create a booking reference. Please refresh and try again.');
  }

  function requireBookingUuid(id, label) {
    if (!isValidBookingUuid(id)) {
      throw new Error(
        (label || 'Booking reference') +
          ' is invalid. Please hard-refresh this page (Ctrl+Shift+R) and try again.',
      );
    }
    return id;
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
    var pricing = computePricing(selectedStyle);
    var name = (document.getElementById('full-name') || {}).value || '';
    var email = (document.getElementById('email') || {}).value || '';
    var phone = (document.getElementById('phone') || {}).value || '';
    var notes = (document.getElementById('notes') || {}).value || '';
    var paidOnline = !!options.paidOnline;
    var paymentStatus = 'none';

    if (paidOnline) {
      paymentStatus = pricing.mode === 'full' ? 'paid' : 'deposit_paid';
    } else if (pricing.deposit > 0) {
      paymentStatus = 'unpaid';
    }

    return {
      id: options.bookingId || newBookingId(),
      full_name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      style_id: selectedStyle.id,
      style_name: selectedStyle.name,
      appointment_starts_at: selectedSlotStart.toISO(),
      appointment_date: selectedSlotStart.toISODate(),
      appointment_slot: selectedSlotStart.toFormat('h:mm a'),
      duration_minutes: pricing.duration,
      estimated_total: pricing.total,
      deposit_amount: pricing.deposit,
      booking_status: paidOnline ? 'confirmed' : 'pending',
      payment_status: paymentStatus,
      stripe_payment_intent_id: options.paymentIntentId || null,
      current_hair_photo_path: options.hairPath || null,
      reference_photo_path: options.refPath || null,
      source: 'website',
      notes: notes.trim() || null,
    };
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

  function confirmBookingPayment(bookingId, paymentIntentId, attempt) {
    attempt = attempt || 0;
    return edgeFunction('stripe-booking-confirm', {
      subdomain: subdomain,
      bookingId: bookingId,
      paymentIntentId: paymentIntentId,
    })
      .then(function (result) {
        if (!isPaymentConfirmSuccess(result)) {
          throw new Error((result && result.error) || 'Payment could not be verified.');
        }
        return result;
      })
      .catch(function (err) {
        if (attempt >= 4) throw err;
        return new Promise(function (resolve) {
          setTimeout(resolve, 1000 * (attempt + 1));
        }).then(function () {
          return confirmBookingPayment(bookingId, paymentIntentId, attempt + 1);
        });
      });
  }

  function processStripeCheckout(bookingId, pricing, payload) {
    var amountCents = Math.round(pricing.deposit * 100);
    var paymentIntentId = null;

    return edgeFunction('stripe-booking-pay', {
      subdomain: subdomain,
      bookingId: requireBookingUuid(bookingId, 'Booking id'),
      amountCents: amountCents,
      email: payload.email,
    })
      .then(function (payResult) {
        var payBookingId = requireBookingUuid(
          payResult.bookingId || bookingId,
          'Payment booking id',
        );
        if (payResult.fees) {
          applyServerFeePreview(payResult.fees, pricing);
        }
        if (!payResult.clientSecret) {
          throw new Error('Could not start payment.');
        }
        return window.__STYLD_STRIPE__
          .confirmCardPayment(payResult.clientSecret, {
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
            return new Promise(function (resolve) {
              setTimeout(resolve, 500);
            })
              .then(function () {
                return confirmBookingPayment(payBookingId, paymentIntentId);
              })
              .then(function () {
                return { paymentIntentId: paymentIntentId, bookingId: payBookingId };
              });
          });
      })
      .catch(function (err) {
        if (paymentIntentId) {
          var detail = err && err.message ? err.message : 'Confirmation failed.';
          throw new Error(
            detail +
              ' Your card was charged — save this reference for support: ' +
              paymentIntentId,
          );
        }
        throw err;
      });
  }

  function isSlotConflictMessage(message) {
    return /no longer available|not available|already booked|blocked|time slot/i.test(String(message || ''));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!selectedStyle) {
      showFeedback('Choose a menu item to continue.', true);
      return;
    }
    if (!selectedSlotStart) {
      showFeedback('Select a date and time for your appointment.', true);
      return;
    }
    if (!bookingForm || !bookingForm.reportValidity()) return;

    var pricing = computePricing(selectedStyle);
    var slotStart = selectedSlotStart;

    if (submitBtn) submitBtn.disabled = true;
    showFeedback('Checking availability…', false);

    var bookingId = requireBookingUuid(newBookingId(), 'Booking id');
    var needsPayment = pricing.deposit > 0 && window.__STYLD_STRIPE__ && stripeCard;

    ensureSlotStillAvailable(slotStart, pricing.duration)
      .then(function () {
        showFeedback('Uploading photos…', false);
        return uploadBookingPhotos(bookingId);
      })
      .then(function (photoPaths) {
        if (!needsPayment) {
          showFeedback('Saving your booking…', false);
          var freePayload = buildBookingPayload({
            bookingId: bookingId,
            hairPath: photoPaths.hairPath,
            refPath: photoPaths.refPath,
            paidOnline: false,
          });
          return rpc('styld_tenant_insert_booking', {
            p_subdomain: subdomain,
            p_booking: freePayload,
          }).then(function () {
            redirectSuccess(bookingId, pricing);
          });
        }

        var payPayload = buildBookingPayload({
          bookingId: bookingId,
          hairPath: photoPaths.hairPath,
          refPath: photoPaths.refPath,
          paidOnline: false,
        });

        showFeedback('Processing payment…', false);
        return processStripeCheckout(bookingId, pricing, payPayload)
          .then(function (checkout) {
            bookingId = checkout.bookingId;
            showFeedback('Confirming availability…', false);
            return ensureSlotStillAvailable(slotStart, pricing.duration).then(function () {
              return checkout;
            });
          })
          .then(function (checkout) {
            showFeedback('Saving your booking…', false);
            var paidPayload = buildBookingPayload({
              bookingId: checkout.bookingId,
              hairPath: photoPaths.hairPath,
              refPath: photoPaths.refPath,
              paidOnline: true,
              paymentIntentId: checkout.paymentIntentId,
            });
            return rpc('styld_tenant_insert_booking', {
              p_subdomain: subdomain,
              p_booking: paidPayload,
            }).then(function () {
              redirectSuccess(checkout.bookingId, pricing);
            });
          });
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : 'Could not complete booking.';
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
  onStyleChange();

  var preselected = new URLSearchParams(window.location.search).get('style');
  if (preselected && styleSelect) {
    styleSelect.value = preselected;
    onStyleChange();
  }
})();
