(function () {
  var params = new URLSearchParams(window.location.search);
  var paidDeposit = params.get('deposit') === '1';

  function applySuccessCopy() {
    var content = window.__STYLD_SITE_CONTENT__ || {};
    var brand = content.brandName ? String(content.brandName).trim() : '';
    var eyebrow = document.getElementById('success-eyebrow');
    var title = document.getElementById('success-title');
    var lead = document.getElementById('success-lead');

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

    if (brand) {
      document.title = 'Booking confirmed | ' + brand;
    }
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
