(function initBookingDetailsPage() {
  var cfg = window.__STYLD_TENANT__ || {};
  if (!cfg.supabaseUrl && window.__SALON_SITE_SUPABASE__) {
    cfg = Object.assign({}, cfg, {
      supabaseUrl: window.__SALON_SITE_SUPABASE__.url,
      supabaseAnonKey: window.__SALON_SITE_SUPABASE__.anonKey,
    });
  }
  var params = new URLSearchParams(window.location.search);
  var bookingId = (params.get('booking_id') || '').trim();
  var contact = (params.get('contact') || params.get('email') || '').trim();
  var subdomain = (params.get('subdomain') || '').trim().toLowerCase();

  var captureEl = document.getElementById('booking-details-capture');
  var errorWrap = document.getElementById('booking-details-error');
  var errorMsg = document.getElementById('booking-details-error-msg');
  var noticeEl = document.getElementById('booking-details-notice');
  var statusLine = document.getElementById('receipt-status-line');
  var heroEyebrow = document.querySelector('.booking-details-hero__eyebrow');
  var heroTitle = document.querySelector('.booking-details-hero h1');
  var heroLead = document.querySelector('.booking-details-hero__lead');

  function getSubdomain() {
    if (subdomain) return subdomain;
    if (window.StyldTenant && window.StyldTenant.getSubdomain) {
      return window.StyldTenant.getSubdomain();
    }
    var host = window.location.hostname || '';
    if (host.endsWith('.styldd.com')) {
      return host.split('.')[0].toLowerCase();
    }
    return '';
  }

  function isValidBookingUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(id || ''),
    );
  }

  function rpc(name, body) {
    var url = (cfg.supabaseUrl || cfg.url || '').replace(/\/$/, '');
    var key = cfg.supabaseAnonKey || cfg.anonKey || '';
    if (!url || !key) {
      return Promise.reject(new Error('This site is not configured yet.'));
    }
    return fetch(url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      return res.json().then(function (payload) {
        if (!res.ok) {
          var msg =
            (payload && (payload.message || payload.error || payload.hint)) || 'Request failed';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        return payload;
      });
    });
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function formatMoney(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return '$0.00';
    return '$' + (Math.round(n * 100) / 100).toFixed(2);
  }

  function formatDuration(minutes) {
    var mins = Math.round(Number(minutes) || 0);
    if (mins <= 0) return '—';
    var hours = Math.floor(mins / 60);
    var remainder = mins % 60;
    if (hours <= 0) return remainder + ' min';
    if (remainder === 0) return hours === 1 ? '1 hr' : hours + ' hrs';
    if (hours === 1) return '1 hr ' + remainder + ' min';
    return hours + ' hrs ' + remainder + ' min';
  }

  function formatDateLabel(dateIso) {
    if (!dateIso) return '—';
    try {
      var dt = new Date(dateIso + 'T12:00:00');
      return dt.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (err) {
      return dateIso;
    }
  }

  function paymentStatusLabel(status) {
    var map = {
      none: 'No online payment',
      unpaid: 'Deposit pending',
      deposit_paid: 'Deposit paid',
      paid: 'Paid in full',
    };
    return map[String(status || '').toLowerCase()] || status || '—';
  }

  function bookingStatusLabel(status) {
    var normalized = String(status || '').toLowerCase();
    if (normalized === 'pending_approval') return 'Pending approval';
    if (normalized === 'confirmed') return 'Confirmed';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelled';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'completed') return 'Completed';
    return status || '—';
  }

  function isPendingApproval(status) {
    return String(status || '').toLowerCase() === 'pending_approval';
  }

  function fillDl(id, rows) {
    var dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = '';
    rows.forEach(function (row) {
      if (!row || row.value == null || row.value === '') return;
      var dt = document.createElement('dt');
      dt.textContent = row.label;
      var dd = document.createElement('dd');
      dd.textContent = row.value;
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }

  function normalizeBookingResult(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.booking && typeof result.booking === 'object') return result.booking;
    return result.id ? result : null;
  }

  function applyHeroCopy(booking) {
    var pending = isPendingApproval(booking.booking_status);
    if (heroEyebrow) heroEyebrow.textContent = pending ? 'Request received' : 'Confirmation';
    if (heroTitle) {
      heroTitle.textContent = pending
        ? 'Your booking request is on file'
        : 'Your appointment is on the books';
    }
    if (heroLead) {
      heroLead.innerHTML = pending
        ? 'Keep your <strong>booking reference</strong> below. We\u2019ll email you when your request is approved or declined.'
        : 'Keep your <strong>booking reference</strong> below — you will need it for changes or lookup. Download a PNG copy for your records.';
    }
    document.title = pending ? 'Booking request | Details' : 'Booking details';
  }

  function applyStatusLine(booking) {
    if (!statusLine) return;
    var normalized = String(booking.booking_status || '').toLowerCase();
    var payment = String(booking.payment_status || '').toLowerCase();
    statusLine.hidden = false;
    statusLine.className = 'booking-details-status-pill';

    if (isPendingApproval(normalized)) {
      statusLine.textContent =
        'Your booking request was received and is awaiting approval. We\u2019ll email you when it\u2019s approved or declined.';
      statusLine.classList.add('is-pending-approval');
      return;
    }

    if (normalized === 'confirmed') {
      if (payment === 'deposit_paid' || payment === 'paid') {
        statusLine.textContent = 'Your appointment is confirmed and your deposit was received.';
        statusLine.classList.add('is-deposit-ok');
      } else {
        statusLine.textContent = 'Your appointment is confirmed.';
        statusLine.classList.add('is-deposit-ok');
      }
      return;
    }

    if (normalized === 'cancelled' || normalized === 'canceled') {
      statusLine.textContent = 'This appointment was cancelled.';
      statusLine.classList.add('is-deposit-pending');
      return;
    }

    statusLine.textContent = 'Booking status: ' + bookingStatusLabel(booking.booking_status);
    statusLine.classList.add('is-deposit-pending');
  }

  function renderBooking(booking) {
    if (!booking) return;
    applyHeroCopy(booking);
    applyStatusLine(booking);

    setText('receipt-booking-id', booking.id || bookingId);
    fillDl('receipt-dl-contact', [
      { label: 'Name', value: booking.full_name },
      { label: 'Email', value: booking.email },
      { label: 'Phone', value: booking.phone },
    ]);
    fillDl('receipt-dl-appointment', [
      { label: 'Date', value: formatDateLabel(booking.appointment_date) },
      { label: 'Time', value: booking.appointment_slot },
      { label: 'Duration', value: formatDuration(booking.duration_minutes) },
      {
        label: 'Status',
        value: bookingStatusLabel(booking.booking_status),
      },
    ]);
    fillDl('receipt-dl-service', [
      { label: 'Service', value: booking.style_name },
      { label: 'Notes', value: booking.notes },
    ]);
    fillDl('receipt-dl-payment', [
      { label: 'Estimated total', value: formatMoney(booking.estimated_total) },
      { label: 'Deposit', value: formatMoney(booking.deposit_amount) },
      { label: 'Payment', value: paymentStatusLabel(booking.payment_status) },
    ]);

    if (captureEl) captureEl.hidden = false;
  }

  function showError(message) {
    if (errorWrap) errorWrap.hidden = false;
    if (errorMsg) errorMsg.textContent = message;
    if (captureEl) captureEl.hidden = true;
  }

  function loadBooking() {
    var siteSubdomain = getSubdomain();
    if (!siteSubdomain) {
      showError('Site not found.');
      return;
    }
    if (!bookingId || !contact) {
      showError('Open this page from your confirmation email or use booking lookup with your full booking link.');
      return;
    }
    if (!isValidBookingUuid(bookingId)) {
      showError('This booking reference is invalid.');
      return;
    }

    rpc('styld_tenant_get_cancel_context', {
      p_subdomain: siteSubdomain,
      p_booking_id: bookingId.toLowerCase(),
      p_contact: contact,
    })
      .then(function (result) {
        var booking = normalizeBookingResult(result);
        if (!booking) {
          throw new Error('We could not find this booking. Check your booking ID and contact details.');
        }
        renderBooking(booking);
      })
      .catch(function (err) {
        showError(err && err.message ? err.message : 'Could not load booking details.');
      });
  }

  function bindDownload() {
    var btn = document.getElementById('btn-download-png');
    if (!btn || !captureEl || typeof html2canvas !== 'function') return;
    btn.addEventListener('click', function () {
      if (noticeEl) {
        noticeEl.hidden = false;
        noticeEl.textContent = 'Preparing image…';
      }
      html2canvas(captureEl, { scale: 2, backgroundColor: '#ffffff' })
        .then(function (canvas) {
          var link = document.createElement('a');
          link.download = 'booking-' + (bookingId || 'details') + '.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
          if (noticeEl) noticeEl.textContent = 'Download started.';
        })
        .catch(function () {
          if (noticeEl) noticeEl.textContent = 'Could not create image. Try a screenshot instead.';
        });
    });
  }

  function waitForTenant() {
    if (!window.StyldTenant || !window.StyldTenant.loadPublishedSite) {
      loadBooking();
      return;
    }
    window.StyldTenant.loadPublishedSite()
      .then(function (site) {
        if (window.StyldTenant.applyTenantBranding) {
          window.StyldTenant.applyTenantBranding(site);
        }
        var brandTitle = document.querySelector('.booking-details-receipt__title');
        if (brandTitle && site.content && site.content.brandName) {
          brandTitle.textContent = site.content.brandName;
        }
      })
      .catch(function () {
        /* still try to load booking */
      })
      .then(loadBooking);
  }

  bindDownload();
  waitForTenant();
})();
