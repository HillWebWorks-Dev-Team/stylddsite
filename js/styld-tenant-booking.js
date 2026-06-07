(function initStyldTenantBooking() {
  if (!window.StyldTenant || !window.StyldTenant.getSubdomain()) return;

  var statusEl = document.getElementById('tenant-status');
  if (statusEl) statusEl.hidden = false;

  function showError(message) {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = message;
    }
  }

  function populateStyleSelect(styles) {
    var select = document.getElementById('style-select');
    if (!select || !styles || !styles.length) return;

    while (select.options.length > 1) {
      select.remove(1);
    }

    styles.forEach(function (style) {
      var option = document.createElement('option');
      option.value = style.id;
      var label = style.name || style.id;
      if (typeof style.base === 'number' && style.base > 0) {
        label += ' — $' + Math.round(style.base);
      }
      option.textContent = label;
      select.appendChild(option);
    });

    var preselected = new URLSearchParams(window.location.search).get('style');
    if (preselected) select.value = preselected;
  }

  function loadBookingScript() {
    var script = document.createElement('script');
    script.src = 'js/booking.js?v=46';
    script.defer = true;
    document.body.appendChild(script);
  }

  window.StyldTenant.loadPublishedSite()
    .then(function (site) {
      window.__STYLD_BOOKING_PAYMENT__ = site.bookingPayment || {};
      window.__STYLD_BOOKING_HOURS__ = site.bookingHours || null;
      window.__STYLD_BOOKING_STYLES__ = site.bookingStyles || [];
      window.__STYLD_BOOKING_FORM__ = window.StyldTenant.applyBookingFormSettings(site.bookingPayment);

      populateStyleSelect(site.bookingStyles);

      if (statusEl) statusEl.hidden = true;
      loadBookingScript();
    })
    .catch(function (err) {
      showError(err && err.message ? err.message : 'Could not load booking.');
    });
})();
