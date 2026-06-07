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

  function loadBookingScripts() {
    var availability = document.createElement('script');
    availability.src = '/js/booking-availability.js?v=68';
    availability.onload = function () {
      var script = document.createElement('script');
      script.src = '/js/booking.js?v=68';
      script.defer = true;
      document.body.appendChild(script);
    };
    availability.onerror = function () {
      showError('Could not load booking availability.');
    };
    document.body.appendChild(availability);
  }

  function applyBrandToPage(theme, content) {
    theme = theme || {};
    content = content || {};
    var root = document.documentElement;
    var secondary = theme.secondaryColor || '#0a0a0a';
    root.style.setProperty('--ink', secondary);
    root.style.setProperty('--nav-text', secondary);

    var navBg = (theme.navbarColor || '').trim();
    if (navBg && /^#[0-9a-fA-F]{6}$/.test(navBg)) {
      root.style.setProperty('--nav-bg', navBg);
      root.style.setProperty('--nav-bg-solid', navBg);
    }

    var brandNameEl = document.getElementById('profile-brand-name');
    if (brandNameEl && content.brandName) {
      brandNameEl.textContent = content.brandName;
    }
  }

  window.StyldTenant.loadPublishedSite()
    .then(function (site) {
      window.__STYLD_BOOKING_PAYMENT__ = site.bookingPayment || {};
      window.__STYLD_BOOKING_HOURS__ = site.bookingHours || {};
      window.__STYLD_BOOKING_STYLES__ = site.bookingStyles || [];
      window.__STYLD_BOOKING_FORM__ = window.StyldTenant.applyBookingFormSettings(site.bookingPayment);
      window.__SALON_SITE_BOOKING__ = {
        subdomain: site.subdomain,
        timezone: (site.content && site.content.timezone) || 'America/New_York',
        bookingHours: site.bookingHours || {},
        strictNoOverlap: true,
      };
      window.__STYLD_TENANT_BOOKING__ = window.__SALON_SITE_BOOKING__;

      applyBrandToPage(site.theme, site.content);
      populateStyleSelect(site.bookingStyles);

      var stripePk = (window.__STYLD_TENANT__ && window.__STYLD_TENANT__.stripePk) || '';
      if (stripePk && window.Stripe) {
        window.__STYLD_STRIPE__ = window.Stripe(stripePk);
        window.__STYLD_STRIPE_READY__ = true;
      }

      if (statusEl) statusEl.hidden = true;
      loadBookingScripts();
    })
    .catch(function (err) {
      showError(err && err.message ? err.message : 'Could not load booking.');
    });
})();
