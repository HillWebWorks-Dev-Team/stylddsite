(function initProductOrderPage() {
  var cfg = window.__STYLD_TENANT__ || {};
  var params = new URLSearchParams(window.location.search);
  var productId = (params.get('product') || '').trim();

  function getSubdomain() {
    if (window.StyldTenant && window.StyldTenant.getSubdomain) {
      return window.StyldTenant.getSubdomain();
    }
    return (params.get('subdomain') || '').trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function productImageUrl(path) {
    if (window.StyldTenant && window.StyldTenant.resolveStyleCoverUrl) {
      return window.StyldTenant.resolveStyleCoverUrl(path) || '';
    }
    if (!path || !cfg.supabaseUrl) return '';
    var objectPath = String(path).replace(/^\/+/, '').replace(/^style-covers\//, '');
    return cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + objectPath;
  }

  function formatPrice(price) {
    var amount = typeof price === 'number' ? price : Number(price);
    if (!Number.isFinite(amount)) return '$0';
    if (Math.round(amount) === amount) return '$' + Math.round(amount);
    return '$' + amount.toFixed(2);
  }

  function getCatalog() {
    var data = window.__STYLD_SITE_PRODUCTS__ || {};
    return Array.isArray(data.catalog) ? data.catalog : [];
  }

  function getSettings() {
    var data = window.__STYLD_SITE_PRODUCTS__ || {};
    return data.settings && typeof data.settings === 'object' ? data.settings : {};
  }

  function standaloneOrdersAllowed(settings) {
    return !!(settings && settings.allowShipping === true);
  }

  function setFeedback(message, isError) {
    var el = document.getElementById('product-order-feedback');
    if (!el) return;
    var text = message ? String(message).trim() : '';
    el.hidden = !text;
    el.textContent = text;
    el.className =
      'product-order-feedback' + (text ? (isError ? ' product-order-feedback--error' : ' product-order-feedback--success') : '');
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
          var msg = (payload && (payload.error || payload.message)) || 'Request failed';
          throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
        return payload;
      });
    });
  }

  function renderFulfillmentOptions(settings) {
    var fieldset = document.getElementById('product-order-fulfillment');
    var noteEl = document.getElementById('product-order-fulfillment-note');
    if (!fieldset) return null;

    if (!standaloneOrdersAllowed(settings)) {
      fieldset.hidden = true;
      fieldset.innerHTML = '';
      if (noteEl) noteEl.hidden = true;
      return null;
    }

    fieldset.hidden = false;
    fieldset.innerHTML =
      '<label><input type="radio" name="fulfillment" value="shipping" checked />' +
      'Shipping' +
      (settings.shippingFlatRate
        ? ' (+ ' + formatPrice(Number(settings.shippingFlatRate)) + ')'
        : '') +
      '</label>';

    var notes = [];
    if (settings.shippingNote) notes.push(String(settings.shippingNote).trim());
    if (noteEl) {
      noteEl.hidden = !notes.length;
      noteEl.textContent = notes.join(' ');
    }

    return 'shipping';
  }

  function showStandaloneUnavailable(product) {
    var form = document.getElementById('product-order-form');
    var unavailable = document.getElementById('product-order-unavailable');
    var main = document.getElementById('product-order-main');
    if (main) main.hidden = false;
    if (form) form.hidden = true;
    if (unavailable) {
      unavailable.hidden = false;
      var bookingLink = unavailable.querySelector('[data-booking-product-link]');
      if (bookingLink) {
        bookingLink.href = '/booking?product=' + encodeURIComponent(product.id);
      }
    }
  }

  function syncShippingVisibility() {
    var wrap = document.getElementById('product-order-shipping-wrap');
    var input = document.getElementById('product-order-shipping');
    var selected = document.querySelector('input[name="fulfillment"]:checked');
    var isShipping = selected && selected.value === 'shipping';
    if (wrap) wrap.hidden = !isShipping;
    if (input) {
      if (isShipping) input.setAttribute('required', '');
      else input.removeAttribute('required');
    }
  }

  function renderProduct(product) {
    var main = document.getElementById('product-order-main');
    var summary = document.getElementById('product-order-summary');
    if (!summary || !main) return;

    var imagePath = product.storagePath || (product.imagePaths && product.imagePaths[0]) || '';
    var imageUrl = productImageUrl(imagePath);
    var brand = (window.__STYLD_SITE_CONTENT__ && window.__STYLD_SITE_CONTENT__.brandName) || 'Shop';

    document.title = 'Order · ' + (product.title || 'Product') + ' | ' + brand;

    summary.innerHTML =
      (imageUrl
        ? '<div class="product-order-summary__media"><img src="' +
          escapeHtml(imageUrl) +
          '" alt="" loading="lazy" decoding="async" /></div>'
        : '') +
      '<div class="product-order-summary__body">' +
      '<h2 class="product-order-summary__title">' +
      escapeHtml(product.title || 'Product') +
      '</h2>' +
      '<p class="product-order-summary__price">' +
      formatPrice(product.price) +
      '</p>' +
      '</div>';

    main.hidden = false;
  }

  function bindForm(product) {
    var form = document.getElementById('product-order-form');
    var submitBtn = document.getElementById('product-order-submit');
    if (!form) return;

    form.addEventListener('change', function (e) {
      if (e.target && e.target.name === 'fulfillment') syncShippingVisibility();
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;

      var subdomain = getSubdomain();
      if (!subdomain) {
        setFeedback('Site not found.', true);
        return;
      }

      var fulfillmentInput = document.querySelector('input[name="fulfillment"]:checked');
      var fulfillment = fulfillmentInput ? fulfillmentInput.value : '';
      var shippingAddress = (document.getElementById('product-order-shipping') || {}).value || '';
      var settings = getSettings();

      if (!standaloneOrdersAllowed(settings)) {
        setFeedback('Standalone pickup orders are not available. Add this product when you book.', true);
        return;
      }

      if (fulfillment !== 'shipping') {
        setFeedback('Shipping is required for standalone product orders.', true);
        return;
      }

      if (!String(shippingAddress).trim()) {
        setFeedback('Enter a shipping address.', true);
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      setFeedback('Submitting your order…', false);

      edgeFunction('submit-product-order', {
        subdomain: subdomain,
        productId: product.id,
        fullName: (document.getElementById('product-order-name') || {}).value || '',
        email: (document.getElementById('product-order-email') || {}).value || '',
        phone: (document.getElementById('product-order-phone') || {}).value || '',
        fulfillment: 'shipping',
        shippingAddress: String(shippingAddress).trim(),
      })
        .then(function () {
          setFeedback('Order received — we will be in touch shortly.', false);
          form.hidden = true;
        })
        .catch(function (err) {
          setFeedback(err && err.message ? err.message : 'Could not submit order.', true);
          if (submitBtn) submitBtn.disabled = false;
        });
    });
  }

  function boot() {
    if (!productId) {
      setFeedback('Choose a product from the shop to order.', true);
      return;
    }

    var product = getCatalog().find(function (item) {
      return item && item.id === productId;
    });
    if (!product) {
      setFeedback('This product is not available.', true);
      return;
    }

    var settings = getSettings();
    renderProduct(product);

    if (!standaloneOrdersAllowed(settings)) {
      showStandaloneUnavailable(product);
      return;
    }

    renderFulfillmentOptions(settings);
    syncShippingVisibility();
    bindForm(product);

    var footerBrand = document.getElementById('preview-footer-brand');
    var content = window.__STYLD_SITE_CONTENT__ || {};
    if (footerBrand && content.brandName) {
      footerBrand.textContent = '\u00A9 ' + content.brandName;
    }
  }

  function whenReady() {
    if (window.__STYLD_SITE_CONTENT__ && window.__STYLD_SITE_PRODUCTS__) {
      boot();
      return;
    }
    var tries = 0;
    var timer = setInterval(function () {
      if ((window.__STYLD_SITE_CONTENT__ && window.__STYLD_SITE_PRODUCTS__) || ++tries > 80) {
        clearInterval(timer);
        boot();
      }
    }, 100);
  }

  whenReady();
})();
