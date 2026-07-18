(function () {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatSiteAddress(content) {
    if (!content) return '';
    return [content.addressLine1, content.addressLine2, content.city, content.state, content.zip]
      .filter(Boolean)
      .join(', ');
  }

  function buildGoogleMapsSearchUrl(address) {
    var query = String(address || '').trim();
    if (!query) return 'https://www.google.com/maps';
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
  }

  function buildGoogleMapsEmbedUrl(content) {
    if (!content) return null;
    var custom = content.mapEmbedUrl ? String(content.mapEmbedUrl).trim() : '';
    if (custom) return custom;
    var address = formatSiteAddress(content).trim();
    if (!address) return null;
    return 'https://www.google.com/maps?q=' + encodeURIComponent(address) + '&output=embed';
  }

  function resolveAboutTitle(content) {
    content = content && typeof content === 'object' ? content : {};
    return String(content.aboutTitle || 'About Me').trim() || 'About Me';
  }

  function resolveAboutBody(content) {
    content = content && typeof content === 'object' ? content : {};
    return String(content.aboutBody || content.heroDescription || '').trim();
  }

  function isSectionHidden(content, section) {
    if (!content || !Array.isArray(content.hiddenSections)) return false;
    var target = String(section || '').trim();
    var targetLower = target.toLowerCase();
    for (var i = 0; i < content.hiddenSections.length; i++) {
      var hidden = String(content.hiddenSections[i] || '').trim();
      if (!hidden) continue;
      if (hidden === target || hidden.toLowerCase() === targetLower) return true;
    }
    if (target === 'aboutMe') {
      return (
        content.hiddenSections.indexOf('about') !== -1 ||
        content.hiddenSections.indexOf('about_me') !== -1
      );
    }
    return false;
  }

  function isLocationPartHidden(content, part) {
    if (!content || !Array.isArray(content.hiddenLocationParts)) return false;
    return content.hiddenLocationParts.indexOf(part) !== -1;
  }

  function formatMenuMoney(amount) {
    return '$' + (Math.round(Number(amount) || 0)).toFixed(0);
  }

  function siteStyleById(styleId) {
    return (window.__STYLD_SITE_STYLES__ || []).find(function (style) {
      return style.id === styleId;
    }) || null;
  }

  function siteStyleVariantChoices(style) {
    if (window.StyldTenant && window.StyldTenant.getStyleVariantChoices) {
      return window.StyldTenant.getStyleVariantChoices(style);
    }
    return [];
  }

  function ensureProfileVariantModal() {
    if (document.getElementById('profile-style-variant-modal')) return;

    var backdrop = document.createElement('div');
    backdrop.id = 'profile-style-variant-modal-backdrop';
    backdrop.className = 'booking-variant-modal__backdrop';
    backdrop.hidden = true;
    backdrop.setAttribute('aria-hidden', 'true');

    var modal = document.createElement('div');
    modal.id = 'profile-style-variant-modal';
    modal.className = 'booking-variant-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'profile-style-variant-modal-title');
    modal.innerHTML =
      '<div class="booking-variant-modal__card">' +
      '<h2 id="profile-style-variant-modal-title" class="booking-variant-modal__title">Choose your option</h2>' +
      '<p class="booking-variant-modal__lead">Pick the version that fits your appointment.</p>' +
      '<div id="profile-style-variant-modal-list" class="booking-addon-options booking-variant-modal__options" role="radiogroup"></div>' +
      '<button type="button" id="profile-style-variant-modal-continue" class="btn btn-primary booking-variant-modal__continue">Continue to booking</button>' +
      '</div>';

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  }

  function closeProfileVariantModal() {
    var modal = document.getElementById('profile-style-variant-modal');
    var backdrop = document.getElementById('profile-style-variant-modal-backdrop');
    if (modal) modal.hidden = true;
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('booking-variant-modal-open');
  }

  function showProfileVariantModal(style, onContinue) {
    ensureProfileVariantModal();
    var modal = document.getElementById('profile-style-variant-modal');
    var backdrop = document.getElementById('profile-style-variant-modal-backdrop');
    var list = document.getElementById('profile-style-variant-modal-list');
    var title = document.getElementById('profile-style-variant-modal-title');
    var continueBtn = document.getElementById('profile-style-variant-modal-continue');
    if (!modal || !list || !continueBtn) return;

    var variants = siteStyleVariantChoices(style);
    if (!variants.length) {
      if (typeof onContinue === 'function') onContinue('default');
      return;
    }

    if (title) title.textContent = 'Choose your option \u2014 ' + (style.title || style.id || 'Service');

    var html = '';
    variants.forEach(function (variant, index) {
      html +=
        '<label class="booking-addon-option style-variant-option">' +
        '<input type="radio" name="profile-style-variant" value="' +
        escapeHtml(variant.id) +
        '"' +
        (index === 0 ? ' checked' : '') +
        ' required />' +
        '<span class="booking-addon-option__label">' +
        escapeHtml(variant.label) +
        ' (' +
        formatMenuMoney(variant.price) +
        ')</span>' +
        '</label>';
    });
    list.innerHTML = html;

    continueBtn.onclick = function () {
      var checked = list.querySelector('input[name="profile-style-variant"]:checked');
      var variantId = checked ? checked.value : '';
      if (!variantId) return;
      closeProfileVariantModal();
      if (typeof onContinue === 'function') onContinue(variantId);
    };

    modal.hidden = false;
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.add('booking-variant-modal-open');
  }

  function setupServiceCardBookingLinks(grid) {
    if (!grid || grid.dataset.bookingLinksBound === '1') return;
    grid.dataset.bookingLinksBound = '1';
    grid.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.profile-service-card__expand-btn')) return;

      var card =
        e.target && e.target.closest
          ? e.target.closest('a.profile-service-card[href*="/booking?style="]')
          : null;
      if (!card) return;

      var href = card.getAttribute('href') || '';
      var match = href.match(/[?&]style=([^&]+)/);
      if (!match) return;

      var styleId = decodeURIComponent(match[1]);
      var style = siteStyleById(styleId);
      if (!style || !style.variants || !style.variants.length) return;

      e.preventDefault();
      showProfileVariantModal(style, function (variantId) {
        window.location.href =
          '/booking?style=' +
          encodeURIComponent(styleId) +
          '&variant=' +
          encodeURIComponent(variantId);
      });
    });
  }

  function buildServiceCardWithCategory(style, cardClass, logoFallback) {
    var cat = (style.category || '').trim();
    var desc = (style.description || '').trim();
    var imageUrl = (style.imageUrl || logoFallback || '').trim();
    var imgStyle = imageUrl
      ? ' style="background-image:url(\'' + String(imageUrl).replace(/'/g, '%27') + '\');background-size:cover;background-position:center;"'
      : '';
    var bookHref = style.id ? '/booking?style=' + encodeURIComponent(style.id) : '/booking';

    var cardHtml =
      '<a class="' + cardClass + '" href="' + escapeHtml(bookHref) + '">' +
      '<div class="profile-service-card__img" aria-hidden="true"' + imgStyle + '></div>' +
      '<div class="profile-service-card__body">' +
      '<div class="profile-service-card__name">' + escapeHtml(style.title || '') + '</div>' +
      (style.priceLabel ? '<div class="profile-service-card__price">' + escapeHtml(style.priceLabel) + '</div>' : '') +
      (style.durationLabel ? '<div class="profile-service-card__duration">' + escapeHtml(style.durationLabel) + '</div>' : '') +
      '</div></a>';

    var expandHtml = desc
      ? '<button class="profile-service-card__expand-btn" type="button" aria-expanded="false">' +
        '<span class="profile-service-card__expand-label">About this service</span>' +
        '<svg class="profile-service-card__expand-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="profile-service-card__desc" hidden>' + escapeHtml(desc) + '</div>'
      : '';

    return '<div class="profile-service-card-wrap"' +
      (cat ? ' data-category="' + escapeHtml(cat) + '"' : '') +
      '>' + cardHtml + expandHtml + '</div>';
  }

  function buildProfileServiceCards(styles, theme) {
    var layout = (theme && theme.styleCardLayout) || 'card';
    var cardClass =
      layout === 'outlined'
        ? 'profile-service-card profile-service-card--outlined'
        : 'profile-service-card';
    var logoFallback = theme && theme.logoImageUrl ? theme.logoImageUrl : '';

    if (!styles || !styles.length) {
      return (
        '<a class="profile-service-card profile-service-card--outlined" href="/booking">' +
        '<div class="profile-service-card__img"></div>' +
        '<div class="profile-service-card__body">' +
        '<div class="profile-service-card__name">Add your services</div>' +
        '<div class="profile-service-card__price">in the Styld app</div>' +
        '</div></a>'
      );
    }

    return styles.slice(0, 24)
      .map(function (s) { return buildServiceCardWithCategory(s, cardClass, logoFallback); })
      .join('');
  }

  function setupMenuFilters(styles, grid) {
    var filtersEl = document.getElementById('profile-menu-filters');
    if (!filtersEl || !grid) return;

    var categories = [];
    (styles || []).slice(0, 24).forEach(function (style) {
      var cat = (style.category || '').trim();
      if (cat && categories.indexOf(cat) === -1) {
        categories.push(cat);
      }
    });

    if (!categories.length) {
      filtersEl.hidden = true;
      filtersEl.innerHTML = '';
      filtersEl.onclick = null;
      return;
    }

    var tabsHtml =
      '<button type="button" class="profile-menu-filter profile-menu-filter--active" data-filter="__all__">All</button>';
    categories.forEach(function (cat) {
      tabsHtml +=
        '<button type="button" class="profile-menu-filter" data-filter="' +
        escapeHtml(cat) +
        '">' +
        escapeHtml(cat) +
        '</button>';
    });
    filtersEl.innerHTML = tabsHtml;
    filtersEl.hidden = false;

    function applyFilter(filter) {
      grid.querySelectorAll('.profile-service-card-wrap').forEach(function (wrap) {
        if (filter === '__all__') {
          wrap.hidden = false;
        } else {
          wrap.hidden = (wrap.dataset.category || '') !== filter;
        }
      });
    }

    filtersEl.onclick = function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.profile-menu-filter') : null;
      if (!btn || !filtersEl.contains(btn)) return;
      var filter = btn.getAttribute('data-filter');
      if (!filter) return;

      filtersEl.querySelectorAll('.profile-menu-filter').forEach(function (b) {
        b.classList.toggle('profile-menu-filter--active', b === btn);
      });
      applyFilter(filter);
    };
  }

  function populateLocationInfo(content) {
    var infoEl = document.getElementById('profile-location-info');
    var visitTitleEl = document.getElementById('profile-visit-title');
    var visitSection = document.getElementById('profile-location-section');
    if (!infoEl) return;

    var html = '';
    var address = formatSiteAddress(content).trim();
    var handle = (content.instagramHandle || '').replace(/^@/, '').trim();
    var igUrl = handle ? 'https://www.instagram.com/' + encodeURIComponent(handle) + '/' : '';
    var sitePhone =
      window.StyldTenant && window.StyldTenant.resolveSitePhone
        ? window.StyldTenant.resolveSitePhone(content)
        : {
            display: String(content.phoneDisplay || content.phone || '').trim(),
            tel: String(content.phoneTel || content.phoneDisplay || content.phone || '').replace(/[^\d+]/g, ''),
          };

    var showAddress = !isLocationPartHidden(content, 'address') && !!address;
    var showContact =
      !isLocationPartHidden(content, 'contact') &&
      !!(sitePhone.display || String(content.email || '').trim());
    var showSocial = !isLocationPartHidden(content, 'social') && !!handle;
    var showMap = !isLocationPartHidden(content, 'map') && !!buildGoogleMapsEmbedUrl(content);

    var showVisitPart = showAddress || showMap;
    var showConnectPart = showContact || showSocial;

    if (visitTitleEl) {
      var title = '';
      if (showVisitPart && showConnectPart) title = 'Visit & Connect';
      else if (showVisitPart) title = 'Visit';
      else if (showConnectPart) title = 'Connect';
      visitTitleEl.textContent = title;
      var titleWrap = visitTitleEl.closest('.profile-location-head');
      if (titleWrap) titleWrap.hidden = !title;
    }

    if (showAddress) {
      var mapsUrl = buildGoogleMapsSearchUrl(address);
      html +=
        '<div class="profile-location-col"><h3>Address</h3>' +
        '<p><a href="' + escapeHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(address) + '</a></p></div>';
    }

    if (showContact) {
      var contactHtml =
        (sitePhone.display
          ? sitePhone.tel
            ? '<p><a href="tel:' +
              escapeHtml(sitePhone.tel) +
              '">' +
              escapeHtml(sitePhone.display) +
              '</a></p>'
            : '<p>' + escapeHtml(sitePhone.display) + '</p>'
          : '') +
        (content.email
          ? '<p><a href="mailto:' + escapeHtml(content.email) + '">' + escapeHtml(content.email) + '</a></p>'
          : '');
      if (contactHtml) {
        html += '<div class="profile-location-col"><h3>Contact</h3>' + contactHtml + '</div>';
      }
    }

    if (showSocial) {
      var igIcon =
        '<svg class="profile-ig-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>' +
        '<path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>' +
        '<line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
      html +=
        '<div class="profile-location-col"><h3>Social</h3>' +
        '<p class="profile-ig-link"><a href="' + escapeHtml(igUrl) + '" target="_blank" rel="noopener noreferrer">' +
        igIcon + '@' + escapeHtml(handle) + '</a></p></div>';
    }

    infoEl.innerHTML = html;

    if (visitSection) {
      visitSection.hidden = isSectionHidden(content, 'visit') || (!showVisitPart && !showConnectPart);
    }
  }

  function heroBackgroundPosition(theme) {
    var pos = (theme.heroImagePosition || '').trim();
    if (pos) return pos;
    var fx = theme.heroImageFocusX != null ? Number(theme.heroImageFocusX) : 50;
    var fy = theme.heroImageFocusY != null ? Number(theme.heroImageFocusY) : 50;
    if (isNaN(fx)) fx = 50;
    if (isNaN(fy)) fy = 50;
    return fx + '% ' + fy + '%';
  }

  function stackImageObjectPosition(focus) {
    var fx = 50;
    var fy = 50;
    if (focus && typeof focus === 'object' && !Array.isArray(focus)) {
      if (focus.focusX != null) fx = Number(focus.focusX);
      else if (focus.x != null) fx = Number(focus.x);
      if (focus.focusY != null) fy = Number(focus.focusY);
      else if (focus.y != null) fy = Number(focus.y);
    } else if (Array.isArray(focus) && focus.length >= 2) {
      fx = Number(focus[0]);
      fy = Number(focus[1]);
    }
    if (isNaN(fx)) fx = 50;
    if (isNaN(fy)) fy = 50;
    return fx + '% ' + fy + '%';
  }

  function buildHeroHeadlineHtml(content) {
    var brand = escapeHtml(content.brandName || '');
    var left = escapeHtml(content.taglineLeft || 'Put your');
    var r1 = escapeHtml(content.taglineRightLine1 || 'style');
    var r2 = escapeHtml(content.taglineRightLine2 || 'here');
    return (
      '<div class="profile-hero-headline" id="profile-hero-headline">' +
      '<p class="profile-hero-headline__brand">' +
      brand +
      '</p>' +
      '<h1 class="profile-hero-headline__title">' +
      '<span class="profile-hero-headline__left">' +
      left +
      '</span>' +
      '<span class="profile-hero-headline__right">' +
      '<span>' +
      r1 +
      '</span><span>' +
      r2 +
      '</span>' +
      '</span></h1></div>'
    );
  }

  function resetHeroLayout(heroSection, heroPhoto, photoWrap) {
    if (heroSection) {
      heroSection.classList.remove(
        'profile-hero--stack',
        'profile-hero--minimal',
        'profile-hero--image-below',
      );
      heroSection.querySelectorAll('.profile-hero-stack').forEach(function (el) {
        el.remove();
      });
    }
    var headline = document.getElementById('profile-hero-headline');
    if (headline) headline.remove();
    if (heroPhoto) {
      heroPhoto.style.display = '';
      heroPhoto.style.backgroundImage = '';
    }
    if (photoWrap) photoWrap.style.display = '';
  }

  function isBookPage() {
    return document.body.classList.contains('page-book');
  }

  function isPortfolioPage() {
    return document.body.classList.contains('page-portfolio');
  }

  function isCertificationsPage() {
    return document.body.classList.contains('page-certifications');
  }

  function isProductsCatalogPage() {
    return document.body.classList.contains('page-products');
  }

  function isProductsPage() {
    return (
      isProductsCatalogPage() ||
      document.body.classList.contains('page-products-order')
    );
  }

  function getSiteProductsCatalog() {
    var data = window.__STYLD_SITE_PRODUCTS__ || {};
    var raw = Array.isArray(data.catalog) ? data.catalog : [];
    if (window.StyldTenant && window.StyldTenant.normalizeSiteProducts) {
      return window.StyldTenant.normalizeSiteProducts(raw);
    }
    return raw;
  }

  function getSiteProductsSettings() {
    var data = window.__STYLD_SITE_PRODUCTS__ || {};
    return data.settings && typeof data.settings === 'object' ? data.settings : {};
  }

  function standaloneProductOrdersAllowed() {
    return getSiteProductsSettings().allowShipping === true;
  }

  function productInventoryApi() {
    return window.StyldTenant || {};
  }

  function isProductOutOfStock(product) {
    var fn = productInventoryApi().isProductOutOfStock;
    if (fn) return fn(product);
    return !!(product && product.trackInventory === true && (product.quantityInStock || 0) <= 0);
  }

  function formatProductStockLabel(product) {
    var fn = productInventoryApi().formatProductStockLabel;
    if (fn) return fn(product);
    if (!product || product.trackInventory !== true) return '';
    var stock = Number(product.quantityInStock) || 0;
    return stock <= 0 ? 'Out of stock' : stock + ' in stock';
  }

  function buildProductStockHtml(product) {
    var label = formatProductStockLabel(product);
    if (!label) return '';
    var isOut = isProductOutOfStock(product);
    return (
      '<p class="profile-product-card__stock' +
      (isOut ? ' profile-product-card__stock--out' : '') +
      '">' +
      escapeHtml(label) +
      '</p>'
    );
  }

  function buildProductOrderActionsHtml(product) {
    if (isProductOutOfStock(product)) {
      return '';
    }
    if (!standaloneProductOrdersAllowed()) {
      return '';
    }
    return (
      '<div class="profile-product-card__actions">' +
      '<a class="profile-product-card__btn profile-product-card__btn--primary" href="/products/order?product=' +
      encodeURIComponent(product.id) +
      '">Order now</a>' +
      '</div>'
    );
  }

  function configureNavLinkPair(desktopId, drawerId, hidden, label, isActive) {
    var desktop = document.getElementById(desktopId);
    var drawer = document.getElementById(drawerId);
    [desktop, drawer].forEach(function (el) {
      if (!el) return;
      el.textContent = label;
      el.hidden = hidden;
      el.classList.toggle('is-active', !hidden && isActive);
    });
  }

  function populateSiteNav(content) {
    var theme = window.__STYLD_SITE_THEME__ || {};
    var productsCatalog = getSiteProductsCatalog();
    var certsHidden =
      isSectionHidden(content, 'certifications') || !normalizeCertificationItems(theme).length;
    var productsHidden = isSectionHidden(content, 'products') || !productsCatalog.length;
    var anyVisible = !certsHidden || !productsHidden;

    var certsLabel = String(content.certificationsTitle || 'Certifications').trim() || 'Certifications';
    var productsLabel = String(content.productsTitle || 'Shop').trim() || 'Shop';

    var linksWrap = document.getElementById('profile-nav-links');
    var tabsWrap = document.getElementById('profile-nav-tabs');
    var drawerTabs = document.getElementById('profile-nav-drawer-tabs');
    var menuBtn = document.getElementById('profile-nav-menu-btn');
    var drawer = document.getElementById('profile-nav-drawer');

    if (linksWrap) linksWrap.hidden = !anyVisible;
    if (tabsWrap) tabsWrap.hidden = !anyVisible;
    if (drawerTabs) drawerTabs.hidden = !anyVisible;
    if (menuBtn) menuBtn.hidden = !anyVisible;

    configureNavLinkPair(
      'profile-nav-link-certifications',
      'profile-nav-drawer-certifications',
      certsHidden,
      certsLabel,
      isCertificationsPage(),
    );
    configureNavLinkPair(
      'profile-nav-link-products',
      'profile-nav-drawer-products',
      productsHidden,
      productsLabel,
      isProductsPage(),
    );

    if (!anyVisible && drawer) {
      drawer.hidden = true;
      if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('profile-nav-drawer-open');
    }
  }

  function bindSiteNavMenu() {
    if (document.body.dataset.siteNavMenuBound) return;
    document.body.dataset.siteNavMenuBound = '1';

    var menuBtn = document.getElementById('profile-nav-menu-btn');
    var drawer = document.getElementById('profile-nav-drawer');
    if (!menuBtn || !drawer) return;

    menuBtn.addEventListener('click', function () {
      if (menuBtn.hidden) return;
      var opening = drawer.hidden;
      drawer.hidden = !opening;
      menuBtn.setAttribute('aria-expanded', opening ? 'true' : 'false');
      document.body.classList.toggle('profile-nav-drawer-open', opening);
    });

    drawer.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        drawer.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('profile-nav-drawer-open');
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer && !drawer.hidden) {
        drawer.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('profile-nav-drawer-open');
      }
    });
  }

  function isSplashPage() {
    return document.body.classList.contains('page-home') && !isBookPage();
  }

  function updateNavBookLink(href) {
    var nav = document.getElementById('profile-nav');
    if (!nav) return;
    var btn = nav.querySelector('.profile-book-btn');
    if (btn) btn.setAttribute('href', href);
  }

  function setSplashContentHidden(hidden) {
    var belowHero = document.getElementById('profile-below-hero');
    if (belowHero) belowHero.hidden = hidden;
    var siteMain = document.getElementById('site-main-content');
    if (siteMain) siteMain.hidden = hidden;
    document.querySelectorAll('.site-footer').forEach(function (footer) {
      footer.hidden = hidden;
    });
  }

  function applyHeroCoverBlur(heroPhoto, theme) {
    if (!heroPhoto) return;
    heroPhoto.classList.toggle('profile-photo__bg--blurred', !!(theme && theme.heroCoverBlur));
  }

  function removeLegacyAboutPolicyDom() {
    var composite = document.getElementById('profile-header-main-section');
    if (composite) composite.remove();
    var bookIntro = document.getElementById('profile-book-intro');
    if (bookIntro) bookIntro.remove();
    document.querySelectorAll('[data-ordered-section-wrap]').forEach(function (el) {
      el.remove();
    });
  }

  function resolvePolicyBullets(content) {
    content = content && typeof content === 'object' ? content : {};
    var policyText = (content.bookingPolicy || '').trim();
    if (!policyText) return [];
    return policyText.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
  }

  function populateAboutMe(content) {
    var section = document.getElementById('profile-about-section');
    var titleEl = document.getElementById('profile-about-title');
    var bodyEl = document.getElementById('profile-about-body');
    if (!section) return false;

    var text = resolveAboutBody(content);
    var hidden = isSectionHidden(content, 'aboutMe') || !text;
    if (titleEl) titleEl.textContent = resolveAboutTitle(content);
    if (bodyEl) bodyEl.textContent = text;
    section.hidden = hidden;
    return !hidden;
  }

  function populatePolicies(content) {
    var section = document.getElementById('profile-policies-section');
    var titleEl = document.getElementById('profile-policies-title');
    var listEl = document.getElementById('profile-policy-body');
    if (!section || !listEl) return false;

    var bullets = resolvePolicyBullets(content);
    var hidden = isSectionHidden(content, 'policies') || !bullets.length;
    if (titleEl) {
      titleEl.textContent = String(content.policiesTitle || 'Policies').trim() || 'Policies';
    }
    listEl.innerHTML = '';
    bullets.forEach(function (bullet) {
      var li = document.createElement('li');
      li.textContent = bullet;
      listEl.appendChild(li);
    });
    section.hidden = hidden;
    return !hidden;
  }

  function setupCoverLayout(content, theme, heroSection, heroPhoto) {
    if (!heroSection) return;
    heroSection.classList.add('profile-hero--cover');
    document.body.classList.add('page-home--cover', 'page-splash', 'page-cover-splash');
    document.documentElement.classList.add('page-splash', 'page-cover-splash');
    setSplashContentHidden(true);
    updateNavBookLink('/book');

    var nav = document.getElementById('profile-nav');
    if (nav) nav.classList.add('profile-nav--cover-splash');

    var overlay = document.getElementById('profile-cover-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'profile-cover-overlay';
      overlay.id = 'profile-cover-overlay';
      overlay.innerHTML =
        '<div class="profile-cover-overlay__scrim" aria-hidden="true"></div>' +
        '<div class="profile-cover-overlay__inner"></div>';
      heroSection.appendChild(overlay);
    }
    overlay.hidden = false;

    var inner = overlay.querySelector('.profile-cover-overlay__inner');
    if (inner) {
      inner.innerHTML =
        '<h1 class="profile-cover-overlay__brand">' +
        escapeHtml(content.brandName || '') +
        '</h1>' +
        '<a class="profile-book-btn profile-book-btn--cover-splash profile-cover-overlay__cta" href="/book">Book Now</a>';
    }

    if (heroPhoto && theme.heroImageUrl) {
      heroPhoto.style.backgroundImage =
        "url('" + String(theme.heroImageUrl).replace(/'/g, '%27') + "')";
      heroPhoto.style.backgroundPosition = heroBackgroundPosition(theme);
    }
    applyHeroCoverBlur(heroPhoto, theme);
  }

  function teardownCoverLayout(heroSection, heroPhoto) {
    if (heroSection) heroSection.classList.remove('profile-hero--cover');
    document.body.classList.remove('page-home--cover', 'page-splash', 'page-cover-splash');
    document.documentElement.classList.remove('page-splash', 'page-cover-splash');
    setSplashContentHidden(false);
    updateNavBookLink('/booking');
    var nav = document.getElementById('profile-nav');
    if (nav) nav.classList.remove('profile-nav--cover-splash');
    if (heroPhoto) heroPhoto.classList.remove('profile-photo__bg--blurred');
    var overlay = document.getElementById('profile-cover-overlay');
    if (overlay) overlay.hidden = true;
  }

  function applySectionVisibility(content) {
    document.querySelectorAll('[data-site-section]').forEach(function (el) {
      var sectionId = el.getAttribute('data-site-section');
      if (!sectionId) return;
      if (
        sectionId === 'visit' ||
        sectionId === 'aboutMe' ||
        sectionId === 'policies' ||
        sectionId === 'portfolio' ||
        sectionId === 'faq' ||
        sectionId === 'reviews'
      ) {
        return;
      }
      el.hidden = isSectionHidden(content, sectionId);
    });
  }

  function resolvePortfolioMediaUrl(storagePath) {
    if (window.StyldTenant && typeof window.StyldTenant.resolveStyleCoverUrl === 'function') {
      return window.StyldTenant.resolveStyleCoverUrl(storagePath);
    }
    var cfg = window.__STYLD_TENANT__ || {};
    if (!storagePath || !cfg.supabaseUrl) return null;
    var path = String(storagePath).trim();
    if (!path) return null;
    if (path.indexOf('http://') === 0 || path.indexOf('https://') === 0) return path;
    var objectPath = path.replace(/^\/+/, '').replace(/^style-covers\//, '');
    return cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + objectPath;
  }

  function normalizePortfolioItems(theme) {
    theme = theme && typeof theme === 'object' ? theme : {};
    if (Array.isArray(theme.portfolioItems) && theme.portfolioItems.length) {
      return theme.portfolioItems
        .slice(0, 24)
        .map(function (item) {
          if (!item || typeof item !== 'object') return null;
          var path = item.storagePath || item.storage_path || '';
          path = String(path || '').trim();
          if (!path) return null;
          return {
            storagePath: path,
            mediaType: item.mediaType === 'video' ? 'video' : 'image',
          };
        })
        .filter(Boolean);
    }
    if (Array.isArray(theme.galleryImagePaths) && theme.galleryImagePaths.length) {
      return theme.galleryImagePaths
        .slice(0, 24)
        .map(function (path) {
          path = String(path || '').trim();
          if (!path) return null;
          return { storagePath: path, mediaType: 'image' };
        })
        .filter(Boolean);
    }
    return [];
  }

  function normalizeCertificationItems(theme) {
    theme = theme && typeof theme === 'object' ? theme : {};
    if (!Array.isArray(theme.certificationItems)) return [];
    return theme.certificationItems
      .slice(0, 24)
      .map(function (item) {
        if (!item || typeof item !== 'object') return null;
        var path = item.storagePath || item.storage_path || '';
        path = String(path || '').trim();
        if (!path) return null;
        return {
          storagePath: path,
          mediaType: 'image',
          caption: String(item.caption || '').trim(),
        };
      })
      .filter(Boolean);
  }

  function buildPortfolioItemHtml(item, index) {
    var url = resolvePortfolioMediaUrl(item.storagePath);
    if (!url) return '';
    var mediaType = item.mediaType === 'video' ? 'video' : 'image';
    var inner;
    if (mediaType === 'video') {
      inner =
        '<video autoplay muted loop playsinline preload="metadata" src="' +
        escapeHtml(url) +
        '" tabindex="-1" aria-hidden="true"></video>';
    } else {
      inner =
        '<img src="' +
        escapeHtml(url) +
        '" alt="" loading="lazy" decoding="async" />';
    }
    return (
      '<button type="button" class="profile-portfolio-item profile-portfolio-item-btn profile-portfolio-item--' +
      mediaType +
      '" data-portfolio-url="' +
      escapeHtml(url) +
      '" data-portfolio-type="' +
      mediaType +
      '" aria-label="View portfolio item ' +
      (index + 1) +
      '">' +
      inner +
      '</button>'
    );
  }

  function buildCertificationItemHtml(item, index) {
    var url = resolvePortfolioMediaUrl(item.storagePath);
    if (!url) return '';
    var caption = String(item.caption || '').trim();
    var label = caption || 'View certification ' + (index + 1);
    return (
      '<article class="profile-certification-item">' +
      '<button type="button" class="profile-certification-item__media profile-portfolio-item-btn" data-portfolio-url="' +
      escapeHtml(url) +
      '" data-portfolio-type="image" aria-label="' +
      escapeHtml(label) +
      '">' +
      '<img src="' +
      escapeHtml(url) +
      '" alt="" loading="lazy" decoding="async" />' +
      '</button>' +
      (caption
        ? '<p class="profile-certification-item__caption">' + escapeHtml(caption) + '</p>'
        : '') +
      '</article>'
    );
  }

  function startPortfolioVideos(root) {
    if (!root) return;
    root.querySelectorAll('.profile-portfolio-item-btn video').forEach(function (video) {
      video.muted = true;
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    });
  }

  function openPortfolioLightbox(url, mediaType) {
    var lightbox = document.getElementById('profile-portfolio-lightbox');
    var stage = document.getElementById('profile-portfolio-lightbox-stage');
    if (!lightbox || !stage || !url) return;

    stage.innerHTML = '';
    if (mediaType === 'video') {
      var video = document.createElement('video');
      video.className = 'profile-portfolio-lightbox__media';
      video.src = url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      stage.appendChild(video);
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () {});
      }
    } else {
      var img = document.createElement('img');
      img.className = 'profile-portfolio-lightbox__media';
      img.src = url;
      img.alt = '';
      stage.appendChild(img);
    }

    lightbox.hidden = false;
    document.body.classList.add('profile-portfolio-lightbox-open');
  }

  function closePortfolioLightbox() {
    var lightbox = document.getElementById('profile-portfolio-lightbox');
    var stage = document.getElementById('profile-portfolio-lightbox-stage');
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.classList.remove('profile-portfolio-lightbox-open');
    if (stage) {
      stage.querySelectorAll('video').forEach(function (video) {
        video.pause();
      });
      stage.innerHTML = '';
    }
  }

  function setupPortfolioLightbox() {
    if (document.body.dataset.portfolioLightboxBound) return;
    document.body.dataset.portfolioLightboxBound = '1';

    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.profile-portfolio-item-btn') : null;
      if (btn) {
        openPortfolioLightbox(btn.getAttribute('data-portfolio-url'), btn.getAttribute('data-portfolio-type'));
        return;
      }
      if (e.target && e.target.closest && e.target.closest('[data-portfolio-lightbox-close]')) {
        closePortfolioLightbox();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closePortfolioLightbox();
    });
  }

  var DEFAULT_MAIN_SECTION_ORDER = [
    'aboutMe',
    'policies',
    'reviews',
    'portfolio',
    'menu',
    'faq',
    'visit',
  ];
  function resolveMainSectionOrder(content) {
    if (window.StyldTenant && window.StyldTenant.resolveMainSectionOrder) {
      return window.StyldTenant.resolveMainSectionOrder(content);
    }
    content = content && typeof content === 'object' ? content : {};
    var order = Array.isArray(content.mainSectionOrder) ? content.mainSectionOrder.slice() : null;
    var valid = [];

    if (order && order.length) {
      var seen = {};
      order.forEach(function (id) {
        id = String(id || '').trim();
        if (!id || DEFAULT_MAIN_SECTION_ORDER.indexOf(id) === -1 || seen[id]) return;
        seen[id] = true;
        valid.push(id);
      });
    } else {
      valid = DEFAULT_MAIN_SECTION_ORDER.slice();
      var placement = String(content.portfolioPlacement || 'above_menu').trim();
      if (placement === 'below_menu') {
        valid = valid.filter(function (id) {
          return id !== 'portfolio';
        });
        var menuIndex = valid.indexOf('menu');
        if (menuIndex === -1) menuIndex = valid.length - 1;
        valid.splice(menuIndex + 1, 0, 'portfolio');
      }
    }

    var seenAll = {};
    valid.forEach(function (id) {
      seenAll[id] = true;
    });
    DEFAULT_MAIN_SECTION_ORDER.forEach(function (id) {
      if (!seenAll[id]) valid.push(id);
    });

    if (valid.length !== DEFAULT_MAIN_SECTION_ORDER.length) {
      return DEFAULT_MAIN_SECTION_ORDER.slice();
    }

    return valid;
  }

  function themeFlagEnabled(theme, camelKey, defaultValue) {
    theme = theme && typeof theme === 'object' ? theme : {};
    if (theme[camelKey] === false) return false;
    if (theme[camelKey] === true) return true;
    var snake = camelKey.replace(/[A-Z]/g, function (ch) {
      return '_' + ch.toLowerCase();
    });
    if (theme[snake] === false) return false;
    if (theme[snake] === true) return true;
    return defaultValue;
  }

  function isCoverLayout(theme) {
    return String((theme && theme.heroLayout) || 'split').trim() === 'cover';
  }

  function isHeroAboutBesidePhotoEnabled(theme) {
    return themeFlagEnabled(theme, 'heroAboutBesidePhoto', true);
  }

  function shouldPlaceAboutBesidePhoto(content, theme, order) {
    content = content && typeof content === 'object' ? content : {};
    theme = theme && typeof theme === 'object' ? theme : {};
    order = Array.isArray(order) ? order : [];
    if (isBookPage() || isCoverLayout(theme) || isSplashPage()) return false;
    if (String(theme.heroLayout || 'split').trim() !== 'split') return false;
    if (!isHeroAboutBesidePhotoEnabled(theme)) return false;
    if (!themeFlagEnabled(theme, 'heroPhotoEnabled', true)) return false;
    if (order.indexOf('aboutMe') !== 0) return false;
    if (isSectionHidden(content, 'aboutMe') || !resolveAboutBody(content)) return false;
    return true;
  }

  function getMainSectionNode(sectionId) {
    if (sectionId === 'aboutMe') return document.getElementById('profile-about-section');
    if (sectionId === 'policies') return document.getElementById('profile-policies-section');
    if (sectionId === 'reviews') return document.getElementById('profile-reviews-section');
    if (sectionId === 'portfolio') return document.getElementById('profile-portfolio-section');
    if (sectionId === 'menu') return document.getElementById('profile-menu-section');
    if (sectionId === 'faq') return document.getElementById('profile-faq-section');
    if (sectionId === 'visit') return document.getElementById('profile-location-section');
    return null;
  }

  function reorderMainSections(content, theme) {
    if (
      isCertificationsPage() ||
      isProductsCatalogPage() ||
      isPortfolioPage() ||
      document.body.classList.contains('page-products-order')
    ) {
      return;
    }

    var main = document.querySelector('#site-main-content main') || document.querySelector('main');
    if (!main) return;

    theme = theme && typeof theme === 'object' ? theme : {};
    content = content && typeof content === 'object' ? content : {};
    var order = resolveMainSectionOrder(content);

    removeLegacyAboutPolicyDom();

    var aboutVisible = populateAboutMe(content);
    populatePolicies(content);

    var aboutBeside = shouldPlaceAboutBesidePhoto(content, theme, order);
    var aboutSection = getMainSectionNode('aboutMe');
    var aboutSlot = document.getElementById('profile-hero-about-slot');
    var heroGrid = document.querySelector('.profile-hero__grid');
    var isSplitHome = theme.heroLayout === 'split' && !isBookPage() && !isSplashPage();

    order.forEach(function (sectionId) {
      if (sectionId === 'aboutMe' && aboutBeside) return;
      var node = getMainSectionNode(sectionId);
      if (node) main.appendChild(node);
    });

    if (aboutSlot) {
      if (aboutBeside && aboutSection && aboutVisible) {
        aboutSlot.appendChild(aboutSection);
        aboutSlot.hidden = false;
      } else {
        aboutSlot.hidden = true;
      }
    }

    if (heroGrid && isSplitHome) {
      heroGrid.classList.toggle('profile-hero__grid--photo-only', !aboutBeside || !aboutVisible);
      heroGrid.classList.toggle('profile-hero__grid--with-about', aboutBeside && aboutVisible);
    }
  }

  function populateReviews(content) {
    content = content && typeof content === 'object' ? content : {};
    var section = document.getElementById('profile-reviews-section');
    if (section && isSectionHidden(content, 'reviews')) {
      section.hidden = true;
      return;
    }
    if (window.initStyldSiteReviews) {
      window.initStyldSiteReviews();
    }
  }

  function populatePortfolio(content, theme) {
    var section = document.getElementById('profile-portfolio-section');
    var track = document.getElementById('profile-portfolio-carousel-track');
    var titleEl = document.getElementById('profile-portfolio-title');
    var blurbEl = document.getElementById('profile-portfolio-blurb');
    var viewMoreEl = document.getElementById('profile-portfolio-view-more');
    if (!section || !track) return;

    var items = normalizePortfolioItems(theme);
    if (isSectionHidden(content, 'portfolio') || !items.length) {
      section.hidden = true;
      track.innerHTML = '';
      if (viewMoreEl) viewMoreEl.hidden = true;
      return;
    }

    if (titleEl) {
      titleEl.textContent = String(content.reelsTitle || 'Previous work').trim() || 'Previous work';
    }
    if (blurbEl) {
      var blurb = String(content.reelsBlurb || '').trim();
      blurbEl.textContent = blurb;
      blurbEl.hidden = !blurb;
    }

    var hasMore = items.length > 5;
    if (viewMoreEl) viewMoreEl.hidden = !hasMore;

    var slidesHtml = items
      .slice(0, 5)
      .map(function (item, index) {
        var itemHtml = buildPortfolioItemHtml(item, index);
        if (!itemHtml) return '';
        return '<div class="profile-portfolio-carousel__slide">' + itemHtml + '</div>';
      })
      .join('');

    if (hasMore) {
      slidesHtml +=
        '<div class="profile-portfolio-carousel__slide">' +
        '<a class="profile-portfolio-view-more-slide" href="/portfolio">' +
        '<span>View more</span>' +
        '</a>' +
        '</div>';
    }

    track.innerHTML = slidesHtml;

    startPortfolioVideos(track);
    syncPortfolioCarouselLayout(track);
    section.hidden = false;
  }

  function normalizeFaqItems(content) {
    content = content && typeof content === 'object' ? content : {};
    if (!Array.isArray(content.faqItems)) return [];
    return content.faqItems
      .map(function (item) {
        if (!item || typeof item !== 'object') return null;
        var question = String(item.question || '').trim();
        var answer = String(item.answer || '').trim();
        if (!question || !answer) return null;
        return { question: question, answer: answer };
      })
      .filter(Boolean);
  }

  function formatFaqAnswer(text) {
    var str = String(text || '');
    var result = '';
    var regex = /\*\*([^*]+)\*\*/g;
    var lastIndex = 0;
    var match;
    while ((match = regex.exec(str)) !== null) {
      result += escapeHtml(str.slice(lastIndex, match.index));
      result += '<strong>' + escapeHtml(match[1]) + '</strong>';
      lastIndex = regex.lastIndex;
    }
    result += escapeHtml(str.slice(lastIndex));
    return result;
  }

  function setupFaqAccordion() {
    if (document.documentElement.dataset.faqAccordionBound) return;
    document.documentElement.dataset.faqAccordionBound = '1';
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.profile-faq-item__question') : null;
      if (!btn) return;
      e.preventDefault();
      var item = btn.closest('.profile-faq-item');
      if (!item) return;
      var answerEl = item.querySelector('.profile-faq-item__answer');
      if (!answerEl) return;
      var opening = answerEl.hidden;
      answerEl.hidden = !opening;
      btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
      item.classList.toggle('is-open', opening);
    });
  }

  function populateFaq(content) {
    var section = document.getElementById('profile-faq-section');
    var titleEl = document.getElementById('profile-faq-title');
    var blurbEl = document.getElementById('profile-faq-blurb');
    var listEl = document.getElementById('profile-faq-list');
    if (!section || !listEl) return;

    var items = normalizeFaqItems(content);
    if (isSectionHidden(content, 'faq') || !items.length) {
      section.hidden = true;
      listEl.innerHTML = '';
      return;
    }

    if (titleEl) {
      titleEl.textContent = String(content.faqTitle || 'FAQ').trim() || 'FAQ';
    }
    if (blurbEl) {
      var blurb = String(content.faqBlurb || '').trim();
      blurbEl.textContent = blurb;
      blurbEl.hidden = !blurb;
    }

    listEl.innerHTML = items
      .map(function (item) {
        return (
          '<div class="profile-faq-item">' +
          '<button type="button" class="profile-faq-item__question" aria-expanded="false">' +
          '<span class="profile-faq-item__question-text">' +
          escapeHtml(item.question) +
          '</span>' +
          '<span class="profile-faq-item__toggle" aria-hidden="true">+</span>' +
          '</button>' +
          '<div class="profile-faq-item__answer" hidden>' +
          formatFaqAnswer(item.answer) +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    section.hidden = false;
  }

  function syncPortfolioCarouselLayout(track) {
    var carousel = document.getElementById('profile-portfolio-carousel');
    if (!carousel || !track) return;

    function apply() {
      var fits = track.scrollWidth <= carousel.clientWidth + 2;
      carousel.classList.toggle('profile-portfolio-carousel--centered', fits);
    }

    requestAnimationFrame(apply);

    if (!carousel.dataset.centeringBound) {
      carousel.dataset.centeringBound = '1';
      window.addEventListener('resize', function () {
        clearTimeout(carousel._portfolioResizeTimer);
        carousel._portfolioResizeTimer = setTimeout(apply, 120);
      });
    }
  }

  function populatePortfolioCatalog(content, theme) {
    var main = document.getElementById('portfolio-catalog-main');
    var titleEl = document.getElementById('portfolio-catalog-title');
    var blurbEl = document.getElementById('portfolio-catalog-blurb');
    var grid = document.getElementById('portfolio-catalog-grid');
    if (!grid) return;

    var items = normalizePortfolioItems(theme);
    var title = String(content.reelsTitle || 'Previous work').trim() || 'Previous work';
    var brand = content.brandName || 'Your Brand';
    document.title = title + ' | ' + brand;

    if (isSectionHidden(content, 'portfolio') || !items.length) {
      if (main) main.hidden = true;
      grid.innerHTML = '';
      return;
    }

    if (main) main.hidden = false;
    if (titleEl) titleEl.textContent = title;
    if (blurbEl) {
      var blurb = String(content.reelsBlurb || '').trim();
      blurbEl.textContent = blurb;
      blurbEl.hidden = !blurb;
    }

    grid.innerHTML = items
      .map(function (item, index) {
        return buildPortfolioItemHtml(item, index);
      })
      .join('');

    startPortfolioVideos(grid);
  }

  function formatProductPrice(price) {
    var amount = typeof price === 'number' ? price : Number(price);
    if (!Number.isFinite(amount)) return '$0';
    if (Math.round(amount) === amount) return '$' + Math.round(amount);
    return '$' + amount.toFixed(2);
  }

  function getProductImageUrls(product) {
    if (!product || typeof product !== 'object') return [];
    var paths = [];
    if (Array.isArray(product.imagePaths) && product.imagePaths.length) {
      paths = product.imagePaths.slice();
    } else if (product.storagePath) {
      paths = [product.storagePath];
    }
    return paths
      .map(function (path) {
        return resolvePortfolioMediaUrl(path);
      })
      .filter(Boolean);
  }

  var productModalState = { product: null, imageIndex: 0 };

  function buildProductCardHtml(product) {
    var urls = getProductImageUrls(product);
    var desc = String(product.description || '').trim();
    if (desc.length > 160) desc = desc.slice(0, 157) + '…';
    var title = String(product.title || 'Product').trim() || 'Product';

    var mediaHtml;
    if (urls.length) {
      var slides = urls
        .map(function (url, index) {
          return (
            '<img class="profile-product-card__slide' +
            (index === 0 ? ' is-active' : '') +
            '" src="' +
            escapeHtml(url) +
            '" alt="" loading="lazy" decoding="async" />'
          );
        })
        .join('');
      var dots =
        urls.length > 1
          ? '<span class="profile-product-card__carousel-dots" aria-hidden="true">' +
            urls
              .map(function (_, index) {
                return (
                  '<span class="' + (index === 0 ? 'is-active' : '') + '"></span>'
                );
              })
              .join('') +
            '</span>'
          : '';
      mediaHtml =
        '<button type="button" class="profile-product-card__media profile-product-card__media-btn" data-product-id="' +
        escapeHtml(product.id) +
        '" aria-label="View ' +
        escapeHtml(title) +
        '">' +
        '<span class="profile-product-card__carousel" data-carousel-interval="4000">' +
        slides +
        '</span>' +
        dots +
        '</button>';
    } else {
      mediaHtml = '<div class="profile-product-card__media profile-product-card__media--empty" aria-hidden="true"></div>';
    }

    return (
      '<article class="profile-product-card">' +
      mediaHtml +
      '<div class="profile-product-card__body">' +
      '<button type="button" class="profile-product-card__title-btn" data-product-id="' +
      escapeHtml(product.id) +
      '">' +
      '<h2 class="profile-product-card__title">' +
      escapeHtml(title) +
      '</h2>' +
      '</button>' +
      (desc ? '<p class="profile-product-card__desc">' + escapeHtml(desc) + '</p>' : '') +
      '<p class="profile-product-card__price">' +
      formatProductPrice(product.price) +
      '</p>' +
      buildProductStockHtml(product) +
      buildProductOrderActionsHtml(product) +
      '</div>' +
      '</article>'
    );
  }

  function stopProductCardCarousels(container) {
    if (!container) return;
    container.querySelectorAll('.profile-product-card__carousel').forEach(function (carousel) {
      if (carousel._carouselTimer) {
        clearInterval(carousel._carouselTimer);
        carousel._carouselTimer = null;
      }
    });
  }

  function startProductCardCarousels(container) {
    if (!container) return;
    container.querySelectorAll('.profile-product-card__carousel').forEach(function (carousel) {
      var slides = carousel.querySelectorAll('.profile-product-card__slide');
      if (slides.length <= 1) return;

      var mediaBtn = carousel.closest('.profile-product-card__media-btn');
      var dots = mediaBtn ? mediaBtn.querySelectorAll('.profile-product-card__carousel-dots span') : [];
      var index = 0;
      var intervalMs = Number(carousel.getAttribute('data-carousel-interval')) || 4000;

      function showSlide(nextIndex) {
        slides[index].classList.remove('is-active');
        if (dots[index]) dots[index].classList.remove('is-active');
        index = nextIndex;
        slides[index].classList.add('is-active');
        if (dots[index]) dots[index].classList.add('is-active');
      }

      carousel._carouselTimer = setInterval(function () {
        showSlide((index + 1) % slides.length);
      }, intervalMs);

      if (mediaBtn) {
        mediaBtn.addEventListener('mouseenter', function () {
          if (carousel._carouselTimer) {
            clearInterval(carousel._carouselTimer);
            carousel._carouselTimer = null;
          }
        });
        mediaBtn.addEventListener('mouseleave', function () {
          if (carousel._carouselTimer) return;
          carousel._carouselTimer = setInterval(function () {
            showSlide((index + 1) % slides.length);
          }, intervalMs);
        });
      }
    });
  }

  function renderProductModal() {
    var product = productModalState.product;
    if (!product) return;

    var urls = getProductImageUrls(product);
    var index = productModalState.imageIndex;
    if (index >= urls.length) index = 0;
    if (index < 0) index = urls.length - 1;
    productModalState.imageIndex = index;

    var titleEl = document.getElementById('profile-product-modal-title');
    var priceEl = document.getElementById('profile-product-modal-price');
    var descEl = document.getElementById('profile-product-modal-desc');
    var imageEl = document.getElementById('profile-product-modal-image');
    var counterEl = document.getElementById('profile-product-modal-counter');
    var actionsEl = document.getElementById('profile-product-modal-actions');
    var prevBtn = document.querySelector('[data-product-modal-prev]');
    var nextBtn = document.querySelector('[data-product-modal-next]');
    var showNav = urls.length > 1;

    if (titleEl) titleEl.textContent = product.title || 'Product';
    if (priceEl) priceEl.textContent = formatProductPrice(product.price);
    if (descEl) {
      var fullDesc = String(product.description || '').trim();
      descEl.textContent = fullDesc;
      descEl.hidden = !fullDesc;
    }
    if (imageEl) {
      imageEl.src = urls[index] || '';
      imageEl.hidden = !urls.length;
    }
    if (counterEl) {
      counterEl.hidden = !showNav;
      counterEl.textContent = showNav ? index + 1 + ' / ' + urls.length : '';
    }
    if (prevBtn) prevBtn.hidden = !showNav;
    if (nextBtn) nextBtn.hidden = !showNav;
    if (actionsEl) {
      var stockHtml = buildProductStockHtml(product);
      if (isProductOutOfStock(product)) {
        actionsEl.innerHTML = stockHtml;
      } else if (standaloneProductOrdersAllowed()) {
        actionsEl.innerHTML =
          stockHtml +
          '<a class="profile-product-card__btn profile-product-card__btn--primary" href="/products/order?product=' +
          encodeURIComponent(product.id) +
          '">Order now</a>';
      } else {
        actionsEl.innerHTML =
          stockHtml +
          '<a class="profile-product-card__btn profile-product-card__btn--primary" href="/">Book appointment</a>';
      }
    }
  }

  function openProductModal(productId) {
    var product = getSiteProductsCatalog().find(function (item) {
      return item && item.id === productId;
    });
    if (!product) return;

    productModalState.product = product;
    productModalState.imageIndex = 0;
    renderProductModal();

    var modal = document.getElementById('profile-product-modal');
    if (!modal) return;
    modal.hidden = false;
    document.body.classList.add('profile-product-modal-open');
  }

  function closeProductModal() {
    var modal = document.getElementById('profile-product-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('profile-product-modal-open');
    productModalState.product = null;
    productModalState.imageIndex = 0;
  }

  function stepProductModal(delta) {
    if (!productModalState.product) return;
    var urls = getProductImageUrls(productModalState.product);
    if (urls.length <= 1) return;
    productModalState.imageIndex = (productModalState.imageIndex + delta + urls.length) % urls.length;
    renderProductModal();
  }

  function setupProductDetailModal() {
    if (document.body.dataset.productModalBound) return;
    document.body.dataset.productModalBound = '1';

    document.addEventListener('click', function (e) {
      var openBtn = e.target.closest
        ? e.target.closest('.profile-product-card__media-btn, .profile-product-card__title-btn')
        : null;
      if (openBtn) {
        e.preventDefault();
        var productId = openBtn.getAttribute('data-product-id');
        if (productId) openProductModal(productId);
        return;
      }
      if (e.target.closest && e.target.closest('[data-product-modal-close]')) {
        closeProductModal();
        return;
      }
      if (e.target.closest && e.target.closest('[data-product-modal-prev]')) {
        stepProductModal(-1);
        return;
      }
      if (e.target.closest && e.target.closest('[data-product-modal-next]')) {
        stepProductModal(1);
      }
    });

    document.addEventListener('keydown', function (e) {
      var modal = document.getElementById('profile-product-modal');
      if (!modal || modal.hidden) return;
      if (e.key === 'Escape') closeProductModal();
      if (e.key === 'ArrowLeft') stepProductModal(-1);
      if (e.key === 'ArrowRight') stepProductModal(1);
    });
  }

  function populateProductsCatalog(content) {
    var main = document.getElementById('products-catalog-main');
    var titleEl = document.getElementById('products-catalog-title');
    var blurbEl = document.getElementById('products-catalog-blurb');
    var grid = document.getElementById('products-catalog-grid');
    var emptyEl = document.getElementById('products-catalog-empty');
    if (!grid) return;

    var items = getSiteProductsCatalog();
    var title = String(content.productsTitle || 'Shop').trim() || 'Shop';
    var brand = content.brandName || 'Your Brand';
    document.title = title + ' | ' + brand;

    if (isSectionHidden(content, 'products') || !items.length) {
      if (main) main.hidden = true;
      stopProductCardCarousels(grid);
      grid.innerHTML = '';
      if (emptyEl) emptyEl.hidden = true;
      return;
    }

    if (main) main.hidden = false;
    if (titleEl) titleEl.textContent = title;
    if (blurbEl) {
      var blurb = String(content.productsBlurb || '').trim();
      blurbEl.textContent = blurb;
      blurbEl.hidden = !blurb;
    }

    stopProductCardCarousels(grid);
    grid.innerHTML = items.map(buildProductCardHtml).join('');
    startProductCardCarousels(grid);
    if (emptyEl) emptyEl.hidden = true;
  }

  function populateCertificationsCatalog(content, theme) {
    var main = document.getElementById('certifications-catalog-main');
    var titleEl = document.getElementById('certifications-catalog-title');
    var blurbEl = document.getElementById('certifications-catalog-blurb');
    var grid = document.getElementById('certifications-catalog-grid');
    if (!grid) return;

    var items = normalizeCertificationItems(theme);
    var title = String(content.certificationsTitle || 'Certifications').trim() || 'Certifications';
    var brand = content.brandName || 'Your Brand';
    document.title = title + ' | ' + brand;

    if (isSectionHidden(content, 'certifications') || !items.length) {
      if (main) main.hidden = true;
      grid.innerHTML = '';
      return;
    }

    if (main) main.hidden = false;
    if (titleEl) titleEl.textContent = title;
    if (blurbEl) {
      var blurb = String(content.certificationsBlurb || '').trim();
      blurbEl.textContent = blurb;
      blurbEl.hidden = !blurb;
    }

    grid.innerHTML = items
      .map(function (item, index) {
        return buildCertificationItemHtml(item, index);
      })
      .join('');
  }

  window.applyStyldPreviewContent = function applyStyldPreviewContent() {
    var content = window.__STYLD_SITE_CONTENT__;
    if (!content || typeof content !== 'object') return;

    var theme = window.__STYLD_SITE_THEME__ || {};
    var styles = window.__STYLD_SITE_STYLES__ || [];

    // Brand name
    var brandNameEl = document.getElementById('profile-brand-name');
    if (brandNameEl) brandNameEl.textContent = content.brandName || '';
    document.title = (content.brandName || 'Your Brand') + ' | Book online';

    // Logo
    if (theme.logoImageUrl) {
      var logoPlaceholder = document.getElementById('profile-logo-placeholder');
      if (logoPlaceholder) {
        var logoImg = document.createElement('img');
        logoImg.className = 'profile-brand__logo-img';
        logoImg.src = theme.logoImageUrl;
        logoImg.alt = '';
        logoImg.width = 38;
        logoImg.height = 38;
        logoImg.decoding = 'async';
        logoPlaceholder.replaceWith(logoImg);
      }
    }

    if (isCertificationsPage()) {
      populateSiteNav(content);
      updateNavBookLink('/booking');
      if (theme.hideBookNowButton) {
        document.querySelectorAll('.profile-nav .profile-book-btn').forEach(function (btn) {
          btn.style.display = 'none';
        });
      }
      populateCertificationsCatalog(content, theme);
      if (window.StyldTenant && window.StyldTenant.applySiteFooter) {
        window.StyldTenant.applySiteFooter(content);
      } else {
        var certFooterBrand = document.getElementById('preview-footer-brand');
        if (certFooterBrand && content.brandName) {
          certFooterBrand.textContent = '\u00A9 ' + content.brandName;
        }
      }
      return;
    }

    if (isProductsCatalogPage()) {
      populateSiteNav(content);
      updateNavBookLink('/booking');
      if (theme.hideBookNowButton) {
        document.querySelectorAll('.profile-nav .profile-book-btn').forEach(function (btn) {
          btn.style.display = 'none';
        });
      }
      populateProductsCatalog(content);
      if (window.StyldTenant && window.StyldTenant.applySiteFooter) {
        window.StyldTenant.applySiteFooter(content);
      } else {
        var productsFooterBrand = document.getElementById('preview-footer-brand');
        if (productsFooterBrand && content.brandName) {
          productsFooterBrand.textContent = '\u00A9 ' + content.brandName;
        }
      }
      return;
    }

    if (document.body.classList.contains('page-products-order')) {
      populateSiteNav(content);
      updateNavBookLink('/booking');
      if (theme.hideBookNowButton) {
        document.querySelectorAll('.profile-nav .profile-book-btn').forEach(function (btn) {
          btn.style.display = 'none';
        });
      }
      if (window.StyldTenant && window.StyldTenant.applySiteFooter) {
        window.StyldTenant.applySiteFooter(content);
      } else {
        var orderFooterBrand = document.getElementById('preview-footer-brand');
        if (orderFooterBrand && content.brandName) {
          orderFooterBrand.textContent = '\u00A9 ' + content.brandName;
        }
      }
      return;
    }

    if (isPortfolioPage()) {
      populateSiteNav(content);
      updateNavBookLink('/booking');
      if (theme.hideBookNowButton) {
        document.querySelectorAll('.profile-nav .profile-book-btn').forEach(function (btn) {
          btn.style.display = 'none';
        });
      }
      populatePortfolioCatalog(content, theme);
      if (window.StyldTenant && window.StyldTenant.applySiteFooter) {
        window.StyldTenant.applySiteFooter(content);
      } else {
        var catalogFooterBrand = document.getElementById('preview-footer-brand');
        if (catalogFooterBrand && content.brandName) {
          catalogFooterBrand.textContent = '\u00A9 ' + content.brandName;
        }
      }
      return;
    }

    // Hero layout
    var heroSection = document.querySelector('.profile-hero');
    var heroPhoto = document.getElementById('profile-hero-photo');
    var photoWrap = document.getElementById('profile-photo-wrap');
    var heroGrid = document.querySelector('.profile-hero__grid');
    var isCoverTheme = theme.heroLayout === 'cover';
    var isCoverSplash = isCoverTheme && isSplashPage();
    var isStack = theme.heroLayout === 'stack';
    var isSplit = theme.heroLayout === 'split';
    var isMinimal = theme.heroLayout === 'minimal';
    var isImageBelow = theme.heroLayout === 'image-below';

    teardownCoverLayout(heroSection, heroPhoto);
    resetHeroLayout(heroSection, heroPhoto, photoWrap);

    if (isBookPage()) {
      if (heroSection) heroSection.hidden = true;
      updateNavBookLink('/booking');
    } else if (heroSection) {
      heroSection.hidden = false;
    }

    if (isCoverSplash) {
      setupCoverLayout(content, theme, heroSection, heroPhoto);
    } else if (isMinimal && heroSection && heroGrid) {
      heroSection.classList.add('profile-hero--minimal');
      heroGrid.insertAdjacentHTML('beforeend', buildHeroHeadlineHtml(content));
      if (photoWrap) photoWrap.style.display = 'none';
    } else if (isImageBelow && heroSection && heroGrid) {
      heroSection.classList.add('profile-hero--image-below');
      heroGrid.insertAdjacentHTML('beforeend', buildHeroHeadlineHtml(content));
    } else if (isStack && heroSection) {
      heroSection.classList.add('profile-hero--stack');
      var stackUrls = Array.isArray(theme.heroStackImageUrls) ? theme.heroStackImageUrls : [];
      var stackFocus = Array.isArray(theme.heroStackImageFocus) ? theme.heroStackImageFocus : [];
      var stackFormat = theme.heroStackImageFormat === 'tall' ? 'tall' : 'wide';
      if (stackUrls.length > 0) {
        var stackEl = document.createElement('div');
        stackEl.className = 'profile-hero-stack profile-hero-stack--' + stackFormat;
        stackUrls.forEach(function (url, index) {
          if (!url) return;
          var img = document.createElement('img');
          img.src = url;
          img.className = 'profile-hero-stack__img';
          img.alt = '';
          img.loading = 'lazy';
          img.style.objectPosition = stackImageObjectPosition(stackFocus[index]);
          stackEl.appendChild(img);
        });
        var stackGrid = heroSection.querySelector('.profile-hero__grid');
        if (stackGrid) {
          heroSection.insertBefore(stackEl, stackGrid);
        } else {
          heroSection.prepend(stackEl);
        }
        if (heroPhoto) heroPhoto.style.display = 'none';
        if (photoWrap) photoWrap.style.display = 'none';
      }
    }

    if (isCoverSplash) {
      /* cover hero image applied in setupCoverLayout */
    } else if (!isStack && !isMinimal) {
      var photoEnabled = themeFlagEnabled(theme, 'heroPhotoEnabled', true);
      if (heroGrid) {
        heroGrid.classList.toggle('profile-hero__grid--no-photo', !photoEnabled);
      }
      if (photoWrap) {
        photoWrap.style.display = photoEnabled ? '' : 'none';
      }
      if (photoEnabled && heroPhoto && theme.heroImageUrl) {
        heroPhoto.style.backgroundImage = "url('" + String(theme.heroImageUrl).replace(/'/g, '%27') + "')";
        heroPhoto.style.backgroundPosition = heroBackgroundPosition(theme);
        applyHeroCoverBlur(heroPhoto, theme);
      } else if (heroPhoto) {
        heroPhoto.style.backgroundImage = '';
      }
    }

    // Menu
    var menuTitleEl = document.getElementById('profile-menu-title');
    if (menuTitleEl) menuTitleEl.textContent = content.menuTitle || 'Menu';
    var menuBlurbEl = document.getElementById('profile-menu-blurb');
    if (menuBlurbEl) menuBlurbEl.textContent = content.menuBlurb || '';

    var serviceGrid = document.getElementById('profile-service-grid');
    if (serviceGrid) {
      serviceGrid.innerHTML = buildProfileServiceCards(styles, theme);
      setupMenuFilters(styles, serviceGrid);
      setupServiceCardBookingLinks(serviceGrid);
      if (!serviceGrid.dataset.expandBound) {
        serviceGrid.dataset.expandBound = '1';
        serviceGrid.addEventListener('click', function (e) {
          var btn = e.target && e.target.closest ? e.target.closest('.profile-service-card__expand-btn') : null;
          if (!btn) return;
          e.preventDefault();
          e.stopPropagation();
          var wrap = btn.closest('.profile-service-card-wrap');
          if (!wrap) return;
          var descEl = wrap.querySelector('.profile-service-card__desc');
          if (!descEl) return;
          var opening = descEl.hidden;
          descEl.hidden = !opening;
          btn.setAttribute('aria-expanded', opening ? 'true' : 'false');
          btn.classList.toggle('is-open', opening);
        });
      }
    }

    // Location
    populateLocationInfo(content);

    var mapFrame = document.getElementById('profile-map');
    if (mapFrame) {
      var embedUrl = buildGoogleMapsEmbedUrl(content);
      if (embedUrl && !isLocationPartHidden(content, 'map')) {
        mapFrame.src = embedUrl;
        mapFrame.title = 'Map to ' + formatSiteAddress(content);
        mapFrame.style.display = '';
      } else {
        mapFrame.style.display = 'none';
      }
    }

    applySectionVisibility(content);
    populatePortfolio(content, theme);
    populateFaq(content);
    populateReviews(content);
    reorderMainSections(content, theme);
    populateSiteNav(content);

    // Footer
    if (window.StyldTenant && window.StyldTenant.applySiteFooter) {
      window.StyldTenant.applySiteFooter(content);
    } else {
      var footerBrand = document.getElementById('preview-footer-brand');
      if (footerBrand && content.brandName) {
        footerBrand.textContent = '\u00A9 ' + content.brandName;
      }
    }
  };

  if (window.__STYLD_SITE_CONTENT__) {
    setupPortfolioLightbox();
    setupProductDetailModal();
    setupFaqAccordion();
    bindSiteNavMenu();
    window.applyStyldPreviewContent();
  } else {
    setupPortfolioLightbox();
    setupProductDetailModal();
    setupFaqAccordion();
    bindSiteNavMenu();
  }
})();
