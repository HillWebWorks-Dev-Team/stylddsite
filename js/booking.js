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
    },
    DateTime,
  );

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
  var hairLengthWrap = document.getElementById('hair-length-field-wrap');
  var hairLengthSelect = document.getElementById('hair-length-select');

  var viewMonth = DateTime.now().setZone(zone).startOf('month');
  var selectedDate = null;
  var selectedSlotStart = null;
  var selectedStyle = null;
  var availableDates = new Set();
  var stripeCard = null;
  var stripeElements = null;

  function money(n) {
    return '$' + (Math.round(Number(n) || 0)).toFixed(0);
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

  function styleSupportsExtraHairLength(styleId) {
    var id = String(styleId || '').toLowerCase();
    return /braid|twist|loc|knotless|boho|passion|feed|faux/.test(id);
  }

  function lengthAddon(key) {
    var tiers = {
      'lower-back': { price: 15, minutes: 30, label: 'Lower Back Length (+$15 · +30 min)' },
      butt: { price: 25, minutes: 60, label: 'Butt Length (+$25 · +60 min)' },
      knee: { price: 35, minutes: 90, label: 'Knee Length (+$35 · +90 min)' },
    };
    return tiers[key] || null;
  }

  function computePricing(style, lengthKey) {
    var base = typeof style.base === 'number' ? style.base : 0;
    var duration = style.durationMinutes || 120;
    var addon = lengthKey ? lengthAddon(lengthKey) : null;
    var lengthPrice = addon ? addon.price : 0;
    var lengthMinutes = addon ? addon.minutes : 0;
    var total = base + lengthPrice;
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

    return {
      base: base,
      lengthPrice: lengthPrice,
      lengthLabel: addon ? addon.label.split('(')[0].trim() : '—',
      total: total,
      duration: duration + lengthMinutes,
      deposit: deposit,
      mode: mode,
    };
  }

  function updatePricingDisplay() {
    if (!selectedStyle) return;
    var lengthKey = hairLengthSelect && !hairLengthWrap.hidden ? hairLengthSelect.value : '';
    var p = computePricing(selectedStyle, lengthKey);

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    }

    setText('line-subtotal', money(p.base));
    setText('side-subtotal', money(p.base));
    setText('line-length-addon', p.lengthPrice ? money(p.lengthPrice) : '—');
    setText('side-length-addon', p.lengthPrice ? money(p.lengthPrice) : '—');
    setText('line-total', money(p.total));
    setText('side-total', money(p.total));
    setText('line-deposit', money(p.deposit));
    setText('side-deposit', money(p.deposit));
    setText('pay-deposit-preview', money(p.deposit));

    if (durationStrip) {
      durationStrip.textContent = 'ESTIMATED DURATION ' + p.duration + ' MIN';
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

  function renderSlots() {
    if (!slotsContainer || !selectedDate || !selectedStyle) return;

    var dateIso = selectedDate.toISODate();
    var pricing = computePricing(selectedStyle, hairLengthSelect && !hairLengthWrap.hidden ? hairLengthSelect.value : '');

    slotsContainer.innerHTML = '<p class="booking-slots-placeholder">Loading time slots…</p>';

    rpc('styld_tenant_get_unavailable_times_for_day', {
      p_subdomain: subdomain,
      p_date: dateIso,
    })
      .then(function (unavailable) {
        var candidates = availability.generateSlotTimes(dateIso);
        var earliest = availability.earliestBookableTime();
        slotsContainer.innerHTML = '';

        if (!candidates.length) {
          slotsContainer.innerHTML = '<p class="booking-slots-placeholder">No times available on this day.</p>';
          return;
        }

        var openCount = 0;
        candidates.forEach(function (slotStart) {
          if (slotStart < earliest) return;

          var slotState = availability.classifySlot(slotStart, pricing.duration, unavailable);
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'time-slot time-slot--' + slotState;
          btn.textContent = slotStart.toFormat('h:mm a');
          btn.disabled = slotState === 'full';

          if (slotState !== 'full') {
            openCount += 1;
            btn.addEventListener('click', function () {
              selectedSlotStart = slotStart;
              if (startsAtInput) startsAtInput.value = slotStart.toISO();
              slotsContainer.querySelectorAll('.time-slot').forEach(function (el) {
                el.classList.toggle('selected', el === btn);
              });
            });
          }

          slotsContainer.appendChild(btn);
        });

        if (!openCount) {
          slotsContainer.innerHTML = '<p class="booking-slots-placeholder">All time slots are booked on this day.</p>';
        }
      })
      .catch(function (err) {
        slotsContainer.innerHTML = '<p class="booking-slots-placeholder">' + (err.message || 'Could not load time slots.') + '</p>';
      });
  }

  function loadAvailableDates() {
    var start = viewMonth.startOf('month').toISODate();
    var end = viewMonth.endOf('month').toISODate();
    return rpc('styld_tenant_booking_dates_in_range', {
      p_subdomain: subdomain,
      p_start: start,
      p_end: end,
    }).then(function (dates) {
      availableDates = new Set(Array.isArray(dates) ? dates : []);
    });
  }

  function renderCalendar() {
    if (!calGrid || !calMonthLabel) return;

    calMonthLabel.textContent = viewMonth.toFormat('LLLL yyyy');
    calGrid.innerHTML = '';

    var monthStart = viewMonth.startOf('month');
    var gridStart = monthStart.startOf('week');
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
      var disabledReason = availability.calendarDayDisabledReason(day);
      var selectable = !disabledReason && availableDates.has(iso);
      if (!selectable) {
        btn.classList.add('is-disabled');
        btn.disabled = true;
      } else {
        btn.addEventListener('click', function (pickedIso) {
          return function () {
            selectedDate = DateTime.fromISO(pickedIso, { zone: zone });
            selectedSlotStart = null;
            if (startsAtInput) startsAtInput.value = '';
            if (calSelectedLine) calSelectedLine.textContent = 'Selected Date: ' + selectedDate.toFormat('cccc, LLL d');
            renderCalendar();
            renderSlots();
          };
        }(iso));
      }

      calGrid.appendChild(btn);
    }
  }

  function refreshCalendar() {
    return loadAvailableDates().then(renderCalendar);
  }

  function onStyleChange() {
    var styleId = styleSelect ? styleSelect.value : '';
    selectedStyle = styleById(styleId);
    selectedDate = null;
    selectedSlotStart = null;
    if (startsAtInput) startsAtInput.value = '';

    if (!selectedStyle) {
      if (styleGate) styleGate.hidden = false;
      if (durationStrip) durationStrip.textContent = 'ESTIMATED DURATION TBD';
      if (slotsContainer) slotsContainer.innerHTML = '';
      if (calSelectedLine) calSelectedLine.textContent = 'Selected Date: —';
      if (hairLengthWrap) hairLengthWrap.hidden = true;
      return;
    }

    if (styleGate) styleGate.hidden = true;
    if (hairLengthWrap) {
      hairLengthWrap.hidden = !styleSupportsExtraHairLength(selectedStyle.id);
    }
    updatePricingDisplay();
    refreshCalendar().then(function () {
      if (calSelectedLine) calSelectedLine.textContent = 'Selected Date: —';
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
    var lengthKey = hairLengthSelect && !hairLengthWrap.hidden ? hairLengthSelect.value : '';
    var pricing = computePricing(selectedStyle, lengthKey);
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
      hair_length: lengthKey || null,
    };
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

    var pricing = computePricing(selectedStyle, hairLengthSelect && !hairLengthWrap.hidden ? hairLengthSelect.value : '');
    if (submitBtn) submitBtn.disabled = true;
    showFeedback('Saving your booking…', false);

    var payload = buildBookingPayload();

    rpc('styld_tenant_insert_booking', {
      p_subdomain: subdomain,
      p_booking: payload,
    })
      .then(function (bookingId) {
        var id = typeof bookingId === 'string' ? bookingId : payload.id;
        if (pricing.deposit <= 0 || !window.__STYLD_STRIPE__ || !stripeCard) {
          redirectSuccess(id, pricing);
          return null;
        }

        showFeedback('Booking saved. Payment processing is not available yet — your spot is held unpaid.', false);
        setTimeout(function () { redirectSuccess(id, pricing); }, 1200);
        return null;
      })
      .catch(function (err) {
        showFeedback(err && err.message ? err.message : 'Could not complete booking.', true);
        if (submitBtn) submitBtn.disabled = false;
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
  if (hairLengthSelect) {
    hairLengthSelect.addEventListener('change', function () {
      updatePricingDisplay();
      renderSlots();
    });
  }
  if (bookingForm) bookingForm.addEventListener('submit', handleSubmit);

  initStripeIfNeeded();
  onStyleChange();

  var preselected = new URLSearchParams(window.location.search).get('style');
  if (preselected && styleSelect) {
    styleSelect.value = preselected;
    onStyleChange();
  }
})();
