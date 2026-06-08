(function initManageBookingPage() {
  var cfg = window.__STYLD_TENANT__ || {};
  var params = new URLSearchParams(window.location.search);
  var bookingId = (params.get('booking_id') || '').trim();
  var contact = (params.get('contact') || '').trim();
  var clientName = (params.get('name') || '').trim();
  var booking = null;
  var cancelContext = null;

  var errorEl = document.getElementById('manage-booking-error');
  var successEl = document.getElementById('manage-booking-success');
  var contentWrap = document.getElementById('manage-booking-content');
  var cancelBtn = document.getElementById('manage-cancel-btn');
  var rebookBtn = document.getElementById('manage-rebook-btn');
  var actionsEl = document.getElementById('manage-booking-actions');
  var statusEl = document.getElementById('manage-booking-status');
  var policyEl = document.getElementById('manage-booking-policy');
  var refundHintEl = document.getElementById('manage-booking-refund-hint');

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

  function edgeFunction(name, body) {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      return Promise.reject(new Error('This site is not configured yet.'));
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
            (payload && (payload.error || payload.message)) || 'Request failed';
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
    if (contentWrap) contentWrap.hidden = true;
    if (statusEl) statusEl.hidden = true;
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

  function normalizeCancelContext(result) {
    if (!result || typeof result !== 'object') return null;

    var ctx = {
      can_cancel:
        result.can_cancel != null
          ? !!result.can_cancel
          : result.canCancel != null
            ? !!result.canCancel
            : true,
      qualifies_for_refund:
        result.qualifies_for_refund != null
          ? !!result.qualifies_for_refund
          : result.qualifiesForRefund != null
            ? !!result.qualifiesForRefund
            : false,
      policy_summary: result.policy_summary || result.policySummary || '',
      cancel_blocked_reason: result.cancel_blocked_reason || result.cancelBlockedReason || '',
    };

    var bookingData;
    if (result.booking && typeof result.booking === 'object') {
      bookingData = result.booking;
    } else {
      bookingData = Object.assign({}, result);
      [
        'can_cancel',
        'canCancel',
        'qualifies_for_refund',
        'qualifiesForRefund',
        'policy_summary',
        'policySummary',
        'cancel_blocked_reason',
        'cancelBlockedReason',
        'booking',
      ].forEach(function (key) {
        delete bookingData[key];
      });
    }

    if (!bookingData || typeof bookingData !== 'object' || !bookingData.id) {
      return null;
    }

    ctx.booking = bookingData;
    return ctx;
  }

  function renderBooking(data, context) {
    cancelContext = context || cancelContext;
    booking = data || {};
    hideMessages();
    if (contentWrap) contentWrap.hidden = false;

    var cancelled = isCancelledStatus(booking.booking_status);
    var canCancel = cancelContext && cancelContext.can_cancel === true && !cancelled;
    var qualifiesForRefund = cancelContext && cancelContext.qualifies_for_refund === true;
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
      statusEl.hidden = false;
      statusEl.textContent = bookingStatusLabel(booking.booking_status);
      statusEl.className =
        'manage-booking-status ' + (cancelled ? 'is-cancelled' : 'is-active');
    }

    var title = document.getElementById('manage-booking-title');
    if (title) {
      title.textContent = cancelled ? 'Appointment cancelled' : 'Appointment details';
    }

    var lead = document.getElementById('manage-booking-lead');
    if (lead) {
      if (cancelled) {
        lead.textContent = 'This appointment is no longer on the schedule.';
      } else if (canCancel) {
        lead.textContent = 'You can cancel online anytime before your appointment. Refunds depend on the policy below.';
      } else if (cancelContext && cancelContext.cancel_blocked_reason) {
        lead.textContent = cancelContext.cancel_blocked_reason;
      } else {
        lead.textContent = 'This appointment can no longer be changed online.';
      }
    }

    var policySummary =
      (cancelContext && (cancelContext.policy_summary || cancelContext.policySummary)) ||
      (window.__STYLD_CANCELLATION_POLICY_SUMMARY__ && String(window.__STYLD_CANCELLATION_POLICY_SUMMARY__).trim()) ||
      (window.StyldTenant && window.StyldTenant.resolveCancellationPolicySummary
        ? window.StyldTenant.resolveCancellationPolicySummary(
            window.__STYLD_CANCELLATION_POLICY__ || {},
            window.__STYLD_SITE_CONTENT__ || {},
          )
        : '') ||
      '';
    if (policyEl) {
      if (policySummary && !cancelled) {
        policyEl.hidden = false;
        policyEl.textContent = policySummary;
      } else {
        policyEl.hidden = true;
        policyEl.textContent = '';
      }
    }

    if (refundHintEl) {
      if (canCancel && !qualifiesForRefund) {
        refundHintEl.hidden = false;
        refundHintEl.textContent =
          'You can still cancel, but no refund applies under the current cancellation policy.';
      } else {
        refundHintEl.hidden = true;
        refundHintEl.textContent = '';
      }
    }

    if (cancelBtn) {
      cancelBtn.hidden = !canCancel;
      cancelBtn.disabled = false;
    }
    if (rebookBtn) rebookBtn.hidden = !cancelled;
    if (actionsEl) {
      actionsEl.classList.toggle('manage-booking-actions--cancelled', cancelled);
    }
  }

  function loadCancelContext(subdomain) {
    return rpc('styld_tenant_get_cancel_context', {
      p_subdomain: subdomain,
      p_booking_id: bookingId.toLowerCase(),
      p_contact: contact,
    }).then(function (result) {
      var context = normalizeCancelContext(result);
      if (!context) {
        throw new Error(
          'We could not find this appointment. Check that you opened the full link from your email.',
        );
      }
      return context;
    });
  }

  function cancelBooking(subdomain) {
    return edgeFunction('booking-cancel', {
      bookingId: bookingId.toLowerCase(),
      subdomain: subdomain,
      contact: contact,
      cancelledBy: 'client',
    });
  }

  function buildConfirmMessage() {
    var qualifiesForRefund = cancelContext && cancelContext.qualifies_for_refund === true;
    if (qualifiesForRefund) {
      return 'Cancel this appointment? Your payment will be refunded according to the cancellation policy.';
    }
    return 'Cancel this appointment? No refund applies under the current cancellation policy.';
  }

  function buildSuccessMessage(payload) {
    var refunded =
      payload &&
      (payload.refunded === true ||
        payload.refund_issued === true ||
        payload.refundIssued === true ||
        payload.qualifies_for_refund === true ||
        payload.qualifiesForRefund === true);
    if (refunded || (cancelContext && cancelContext.qualifies_for_refund)) {
      return 'Your appointment has been cancelled. A refund will be processed if one applies.';
    }
    return 'Your appointment has been cancelled. No refund applies under the cancellation policy.';
  }

  function waitForSiteReady() {
    if (!window.StyldTenant || !window.StyldTenant.loadPublishedSite) {
      return Promise.resolve();
    }
    return window.StyldTenant.loadPublishedSite()
      .then(function (site) {
        if (window.StyldTenant.applyTenantBranding) {
          window.StyldTenant.applyTenantBranding(site);
        }
        var loadingEl = document.getElementById('tenant-status');
        if (loadingEl) loadingEl.hidden = true;
        updatePageTitle();
      })
      .catch(function (err) {
        var loadingEl = document.getElementById('tenant-status');
        if (loadingEl) {
          loadingEl.hidden = false;
          loadingEl.textContent = err && err.message ? err.message : 'Could not load site.';
        }
        throw err;
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
        return loadCancelContext(subdomain);
      })
      .then(function (context) {
        renderBooking(context.booking, context);
      })
      .catch(function (err) {
        showError(err && err.message ? err.message : 'Could not load this appointment.');
      });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        if (!booking || !cancelContext || cancelContext.can_cancel !== true) return;
        if (isCancelledStatus(booking.booking_status)) return;

        var confirmed = window.confirm(buildConfirmMessage());
        if (!confirmed) return;

        cancelBtn.disabled = true;
        hideMessages();

        cancelBooking(getSubdomain())
          .then(function (payload) {
            var nextBooking =
              (payload && payload.booking) ||
              (payload && typeof payload === 'object' ? payload : booking);
            nextBooking = Object.assign({}, booking, nextBooking, { booking_status: 'cancelled' });
            cancelContext = Object.assign({}, cancelContext, {
              can_cancel: false,
              qualifies_for_refund: false,
            });
            renderBooking(nextBooking, cancelContext);
            showSuccess(buildSuccessMessage(payload));
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
