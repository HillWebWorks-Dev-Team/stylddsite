(function initManageBookingPage() {
  var cfg = window.__STYLD_TENANT__ || {};
  var params = new URLSearchParams(window.location.search);
  var bookingId = (params.get('booking_id') || '').trim();
  var contact = (params.get('contact') || '').trim();
  var clientName = (params.get('name') || '').trim();
  var booking = null;

  var errorEl = document.getElementById('manage-booking-error');
  var successEl = document.getElementById('manage-booking-success');
  var cardWrap = document.getElementById('manage-booking-card-wrap');
  var cancelBtn = document.getElementById('manage-cancel-btn');
  var rebookBtn = document.getElementById('manage-rebook-btn');
  var actionsEl = document.getElementById('manage-booking-actions');
  var statusEl = document.getElementById('manage-booking-status');

  function getSubdomain() {
    if (window.StyldTenant && window.StyldTenant.getSubdomain) {
      return window.StyldTenant.getSubdomain();
    }
    return (params.get('subdomain') || '').trim().toLowerCase();
  }

  function isValidBookingUuid(id) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(id || ''),
    );
  }

  function rpc(name, body) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      return Promise.reject(new Error('This site is not configured yet.'));
    }
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
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
            (payload && (payload.message || payload.error || payload.hint)) || 'Request failed';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        return payload;
      });
    });
  }

  function showError(message) {
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    }
    if (successEl) successEl.hidden = true;
    if (cardWrap) cardWrap.hidden = true;
  }

  function showSuccess(message) {
    if (successEl) {
      successEl.hidden = false;
      successEl.textContent = message;
    }
    if (errorEl) errorEl.hidden = true;
  }

  function hideMessages() {
    if (errorEl) errorEl.hidden = true;
    if (successEl) successEl.hidden = true;
  }

  function formatMoney(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return '—';
    return '$' + (Math.round(n * 100) / 100).toFixed(0);
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
    if (normalized === 'cancelled' || normalized === 'canceled') return 'Cancelled';
    if (normalized === 'confirmed') return 'Confirmed';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'completed') return 'Completed';
    return status || 'Scheduled';
  }

  function isCancelledStatus(status) {
    var normalized = String(status || '').toLowerCase();
    return normalized === 'cancelled' || normalized === 'canceled';
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function updatePageTitle() {
    var brand =
      (window.__STYLD_SITE_CONTENT__ && window.__STYLD_SITE_CONTENT__.brandName) ||
      getSubdomain() ||
      'Your appointment';
    document.title = brand + ' | Your appointment';
  }

  function renderBooking(data) {
    booking = data || {};
    hideMessages();
    if (cardWrap) cardWrap.hidden = false;

    var cancelled = isCancelledStatus(booking.booking_status);
    var displayName = booking.full_name || clientName || 'there';
    var greeting = cancelled
      ? 'Hi ' + displayName + ', this appointment has been cancelled.'
      : 'Hi ' + displayName + ', here are your appointment details.';

    setText('manage-booking-greeting', greeting);
    setText('manage-style', booking.style_name || '—');
    setText('manage-date', formatDateLabel(booking.appointment_date));
    setText('manage-time', booking.appointment_slot || '—');
    setText('manage-duration', formatDuration(booking.duration_minutes));
    setText('manage-total', formatMoney(booking.estimated_total));
    setText('manage-deposit', formatMoney(booking.deposit_amount));
    setText('manage-payment', paymentStatusLabel(booking.payment_status));
    setText('manage-booking-id', booking.id || bookingId);

    if (statusEl) {
      statusEl.textContent = bookingStatusLabel(booking.booking_status);
      statusEl.className =
        'lookup-status ' + (cancelled ? 'is-cancelled' : 'is-active');
    }

    var title = document.getElementById('manage-booking-title');
    if (title) {
      title.textContent = cancelled ? 'Appointment cancelled' : 'Appointment details';
    }

    var lead = document.getElementById('manage-booking-lead');
    if (lead) {
      lead.textContent = cancelled
        ? 'This appointment is no longer on the schedule.'
        : 'Review your booking below. You can cancel here if your plans change.';
    }

    if (cancelBtn) cancelBtn.hidden = cancelled;
    if (rebookBtn) rebookBtn.hidden = !cancelled;
    if (actionsEl && cancelled && rebookBtn) {
      actionsEl.classList.toggle('manage-booking-actions--cancelled', true);
    }
  }

  function lookupBooking(subdomain) {
    return rpc('styld_tenant_lookup_booking', {
      p_subdomain: subdomain,
      p_booking_id: bookingId.toLowerCase(),
      p_contact: contact,
    }).then(function (result) {
      if (!result || typeof result !== 'object') {
        throw new Error(
          'We could not find this appointment. Check that you opened the full link from your email.',
        );
      }
      return result;
    });
  }

  function cancelBooking(subdomain) {
    return rpc('styld_tenant_cancel_booking', {
      p_subdomain: subdomain,
      p_booking_id: bookingId.toLowerCase(),
      p_contact: contact,
    });
  }

  function waitForSiteReady() {
    return new Promise(function (resolve) {
      if (window.__STYLD_SITE_CONTENT__) {
        resolve();
        return;
      }
      var attempts = 0;
      var timer = setInterval(function () {
        attempts += 1;
        if (window.__STYLD_SITE_CONTENT__ || attempts > 80) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    });
  }

  function init() {
    var subdomain = getSubdomain();

    if (!subdomain) {
      showError('Site not found.');
      return;
    }
    if (!bookingId || !contact) {
      showError('This link is missing booking details. Open the full link from your confirmation email.');
      return;
    }
    if (!isValidBookingUuid(bookingId)) {
      showError('This appointment link is invalid. Open the latest link from your confirmation email.');
      return;
    }

    waitForSiteReady()
      .then(function () {
        updatePageTitle();
        return lookupBooking(subdomain);
      })
      .then(function (data) {
        renderBooking(data);
      })
      .catch(function (err) {
        showError(err && err.message ? err.message : 'Could not load this appointment.');
      });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (!booking || isCancelledStatus(booking.booking_status)) return;
        var confirmed = window.confirm(
          'Cancel this appointment? This cannot be undone from this page.',
        );
        if (!confirmed) return;

        cancelBtn.disabled = true;
        hideMessages();

        cancelBooking(getSubdomain())
          .then(function (updated) {
            var next = updated && typeof updated === 'object' ? updated : booking;
            next = Object.assign({}, next, { booking_status: 'cancelled' });
            renderBooking(next);
            showSuccess('Your appointment has been cancelled.');
          })
          .catch(function (err) {
            cancelBtn.disabled = false;
            showError(err && err.message ? err.message : 'Could not cancel this appointment.');
          });
      });
    }
  }

  init();
})();
