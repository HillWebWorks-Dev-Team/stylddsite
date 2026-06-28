(function () {
  var params = new URLSearchParams(window.location.search);
  var paidDeposit = params.get('deposit') === '1';
  var pendingApproval = params.get('pending_approval') === '1';

  function applySuccessCopy() {
    var content = window.__STYLD_SITE_CONTENT__ || {};
    var brand = content.brandName ? String(content.brandName).trim() : '';
    var eyebrow = document.getElementById('success-eyebrow');
    var title = document.getElementById('success-title');
    var lead = document.getElementById('success-lead');
    var note = document.getElementById('success-note');

    if (pendingApproval) {
      if (eyebrow) eyebrow.textContent = 'Request received';
      if (title) title.textContent = 'Request received';
      if (lead) {
        lead.textContent =
          'Your booking request went through. We\u2019ll email you whether your request is approved or denied.';
      }
      if (note) {
        if (paidDeposit) {
          note.hidden = false;
          note.textContent =
            'If your deposit was collected, it will be handled according to the salon\u2019s cancellation policy if your request is declined.';
        } else {
          note.hidden = true;
          note.textContent = '';
        }
      }
      document.title = brand ? 'Request received | ' + brand : 'Request received';
      return;
    }

    if (eyebrow) {
      eyebrow.textContent = paidDeposit ? 'Payment received' : 'Booking confirmed';
    }
    if (title) {
      title.textContent = paidDeposit
        ? 'Thank you — your deposit went through'
        : 'Thank you — you\u2019re booked';
    }
    if (lead) {
      lead.textContent = paidDeposit
        ? 'Your appointment is on file and your payment was received. You should get a confirmation email shortly' +
          (brand ? ' from ' + brand : '') +
          '.'
        : 'We\u2019ve received your appointment request. You\u2019ll get a confirmation email shortly' +
          (brand ? ' from ' + brand : '') +
          '.';
    }
    if (note) {
      note.hidden = true;
      note.textContent = '';
    }

    document.title = brand ? 'Booking confirmed | ' + brand : 'Booking confirmed';
  }

  function whenTenantReady() {
    applySuccessCopy();
  }

  if (window.__STYLD_SITE_CONTENT__) {
    whenTenantReady();
  } else {
    var tries = 0;
    var timer = setInterval(function () {
      if (window.__STYLD_SITE_CONTENT__ || ++tries > 80) {
        clearInterval(timer);
        whenTenantReady();
      }
    }, 100);
  }
})();
