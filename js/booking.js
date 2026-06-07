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
    var amountCents = Math.round(stylistAmount * 100);
    // Gross-up for Stripe (~2.9% + $0.30); exact charge comes from stripe-booking-pay at checkout.
    var chargeCents = Math.ceil((amountCents + 30) / (1 - 0.029));
    return Math.max(0, (chargeCents - amountCents) / 100);
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
    var totalDue = Math.round((deposit + serviceFee) * 100) / 100;
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

  function buildBookingPayload() {
    var pricing = computePricing(selectedStyle);
    var name = (document.getElementById('full-name') || {}).value || '';
    var email = (document.getElementById('email') || {}).value || '';
    var phone = (document.getElementById('phone') || {}).value || '';
    var notes = (document.getElementById('notes') || {}).value || '';

    return {
      id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'bk-' + Date.now()),
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
      booking_status: 'pending',
      payment_status: pricing.deposit > 0 ? 'unpaid' : 'none',
      source: 'website',
      notes: notes.trim() || null,
    };
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
    var dateIso = slotStart.toISODate();

    if (submitBtn) submitBtn.disabled = true;
    showFeedback('Checking availability…', false);

    fetchUnavailableForDay(dateIso)
      .then(function (unavailable) {
        if (!availability.isSlotBookable(slotStart, pricing.duration, unavailable)) {
          var reason = availability.slotConflictReason
            ? availability.slotConflictReason(slotStart, pricing.duration, unavailable)
            : null;
          var message =
            reason === 'blocked'
              ? 'This time is blocked. Please choose another time.'
              : 'That time slot is no longer available. Please choose another time.';
          showFeedback(message, true);
          if (submitBtn) submitBtn.disabled = false;
          paintSlots(unavailable, dateIso, pricing);
          return null;
        }

        showFeedback('Saving your booking…', false);
        var payload = buildBookingPayload();

        return rpc('styld_tenant_insert_booking', {
          p_subdomain: subdomain,
          p_booking: payload,
        }).then(function (bookingId) {
          var id = typeof bookingId === 'string' ? bookingId : payload.id;
          if (pricing.deposit <= 0 || !window.__STYLD_STRIPE__ || !stripeCard) {
            redirectSuccess(id, pricing);
            return null;
          }

          showFeedback('Booking saved. Payment processing is not available yet — your spot is held unpaid.', false);
          setTimeout(function () { redirectSuccess(id, pricing); }, 1200);
          return null;
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
