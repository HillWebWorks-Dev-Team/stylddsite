(function initProductOrderPage() {
  var cfg = window.__STYLD_TENANT__ || {};
  var params = new URLSearchParams(window.location.search);
  var productId = (params.get('product') || '').trim();
  var orderQuantity = 1;

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

  function inventoryApi() {
    return window.StyldTenant || {};
  }

  function isProductOutOfStock(product) {
    var fn = inventoryApi().isProductOutOfStock;
    if (fn) return fn(product);
    return !!(product && product.trackInventory === true && (product.quantityInStock || 0) <= 0);
  }

  function getProductMaxOrderQuantity(product) {
    var fn = inventoryApi().getProductMaxOrderQuantity;
    if (fn) return fn(product);
    if (isProductOutOfStock(product)) return 0;
    if (!product || product.trackInventory !== true) return 99;
    return Math.min(99, Number(product.quantityInStock) || 0);
  }

  function formatProductStockLabel(product) {
    var fn = inventoryApi().formatProductStockLabel;
    if (fn) return fn(product);
    if (!product || product.trackInventory !== true) return '';
    var stock = Number(product.quantityInStock) || 0;
    return stock <= 0 ? 'Out of stock' : stock + ' in stock';
  }

  function normalizeOrderQuantity(value, product) {
    var qty = parseInt(value, 10);
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    var maxQty = product ? getProductMaxOrderQuantity(product) : 99;
    if (maxQty <= 0) return 0;
    return Math.min(maxQty, Math.min(99, qty));
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
    var raw = Array.isArray(data.catalog) ? data.catalog : [];
    if (window.StyldTenant && window.StyldTenant.normalizeSiteProducts) {
      return window.StyldTenant.normalizeSiteProducts(raw);
    }
    return raw;
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

  function showOrderBlocked(message) {
    var form = document.getElementById('product-order-form');
    var unavailable = document.getElementById('product-order-unavailable');
    var main = document.getElementById('product-order-main');
    var textEl = unavailable ? unavailable.querySelector('.product-order-unavailable__text') : null;
    if (main) main.hidden = false;
    if (form) form.hidden = true;
    if (unavailable) unavailable.hidden = false;
    if (textEl) textEl.textContent = message;
  }

  function syncOrderQuantityUi(product) {
    var wrap = document.getElementById('product-order-qty-wrap');
    if (!wrap) return;
    var maxQty = getProductMaxOrderQuantity(product);
    var minus = wrap.querySelector('[data-product-order-qty-minus]');
    var plus = wrap.querySelector('[data-product-order-qty-plus]');
    var input = wrap.querySelector('[data-product-order-qty-input]');
    if (input) input.value = String(orderQuantity);
    if (minus) minus.disabled = orderQuantity <= 1 || maxQty <= 0;
    if (plus) plus.disabled = orderQuantity >= maxQty || maxQty <= 0;
    if (input) input.max = String(maxQty);
    var totalEl = document.getElementById('product-order-line-total');
    if (totalEl) {
      totalEl.textContent =
        orderQuantity > 1 ? formatPrice(product.price * orderQuantity) + ' total' : '';
      totalEl.hidden = orderQuantity <= 1;
    }
  }

  function setupOrderQuantity(product) {
    var wrap = document.getElementById('product-order-qty-wrap');
    if (!wrap) return;
    var maxQty = getProductMaxOrderQuantity(product);
    if (maxQty <= 0) {
      wrap.hidden = true;
      return;
    }
    orderQuantity = Math.min(1, maxQty);
    wrap.hidden = false;
    wrap.innerHTML =
      '<label class="product-order-qty__label" for="product-order-qty-input">Quantity</label>' +
      '<div class="booking-product-qty product-order-qty">' +
      '<button type="button" class="booking-product-qty__btn" data-product-order-qty-minus aria-label="Decrease quantity">−</button>' +
      '<input id="product-order-qty-input" type="number" class="booking-product-qty__input" data-product-order-qty-input min="1" max="' +
      maxQty +
      '" step="1" inputmode="numeric" value="' +
      orderQuantity +
      '" aria-label="Quantity" />' +
      '<button type="button" class="booking-product-qty__btn" data-product-order-qty-plus aria-label="Increase quantity">+</button>' +
      '</div>' +
      '<p class="product-order-line-total" id="product-order-line-total" hidden></p>';

    wrap.addEventListener('click', function (e) {
      if (e.target.closest('[data-product-order-qty-minus]')) {
        e.preventDefault();
        orderQuantity = normalizeOrderQuantity(orderQuantity - 1, product);
        syncOrderQuantityUi(product);
        return;
      }
      if (e.target.closest('[data-product-order-qty-plus]')) {
        e.preventDefault();
        orderQuantity = normalizeOrderQuantity(orderQuantity + 1, product);
        syncOrderQuantityUi(product);
      }
    });

    wrap.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || !input.matches('[data-product-order-qty-input]')) return;
      orderQuantity = normalizeOrderQuantity(input.value, product);
      syncOrderQuantityUi(product);
    });

    syncOrderQuantityUi(product);
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
    var stockLabel = formatProductStockLabel(product);

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
      (stockLabel
        ? '<p class="product-order-summary__stock' +
          (isProductOutOfStock(product) ? ' product-order-summary__stock--out' : '') +
          '">' +
          escapeHtml(stockLabel) +
          '</p>'
        : '') +
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

      if (isProductOutOfStock(product)) {
        setFeedback('This product is out of stock.', true);
        return;
      }

      orderQuantity = normalizeOrderQuantity(orderQuantity, product);
      if (orderQuantity <= 0) {
        setFeedback('This product is out of stock.', true);
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
        quantity: orderQuantity,
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

    if (isProductOutOfStock(product)) {
      showOrderBlocked('This product is out of stock and cannot be ordered right now.');
      return;
    }

    if (!standaloneOrdersAllowed(settings)) {
      showOrderBlocked(
        'This shop is not set up for shipped orders. Pickup is available when you book an appointment — add this product during checkout.',
      );
      return;
    }

    renderFulfillmentOptions(settings);
    syncShippingVisibility();
    setupOrderQuantity(product);
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
