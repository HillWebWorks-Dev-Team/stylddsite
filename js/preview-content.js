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

  function applyLocationAddress(content) {
    var fullAddress = formatSiteAddress(content).trim();
    var addressPart = document.querySelector('[data-location-part="address"]');
    if (!addressPart) return;

    if (!fullAddress) {
      addressPart.innerHTML = '';
      return;
    }

    var mapsUrl = buildGoogleMapsSearchUrl(fullAddress);
    var line2 = [content.addressLine2, content.city, content.state, content.zip]
      .filter(Boolean)
      .join(', ');
    var html =
      '<a class="location-address-link" href="' +
      escapeHtml(mapsUrl) +
      '" target="_blank" rel="noopener noreferrer">';
    if (content.addressLine1) {
      html += '<p><strong>' + escapeHtml(content.addressLine1) + '</strong></p>';
    }
    if (line2) {
      html += '<p>' + escapeHtml(line2) + '</p>';
    }
    if (!content.addressLine1 && !line2) {
      html += '<p><strong>' + escapeHtml(fullAddress) + '</strong></p>';
    }
    html += '</a>';
    addressPart.innerHTML = html;
  }

  function heroImageStyle(url) {
    if (!url) return '';
    return (
      " style=\"background-image:url('" +
      String(url).replace(/'/g, '%27') +
      "');background-size:cover;background-position:center;\""
    );
  }

  function buildHeroCtasHtml() {
    return (
      '<div class="hero-ctas hero-ctas--landing hero-ctas--scale">' +
      '<a class="hero-btn hero-btn--outline-light hero-btn--lg" href="#preview-menu-section">Browse menu &amp; prices</a>' +
      '<a class="hero-btn hero-btn--gold hero-btn--lg" href="/booking">Book now</a>' +
      '</div>'
    );
  }

  function buildHeroInnerHtml(content, theme) {
    var brand = escapeHtml(content.brandName || 'Your brand name');
    var left = escapeHtml(content.taglineLeft || 'Put your');
    var r1 = escapeHtml(content.taglineRightLine1 || 'style');
    var r2 = escapeHtml(content.taglineRightLine2 || 'here');
    var layout = (theme && theme.heroLayout) || 'split';
    var heroUrl = theme && theme.heroImageUrl ? theme.heroImageUrl : null;
    var photoClass = heroUrl ? ' hero-scale-visual--photo' : '';
    var photoStyle = heroImageStyle(heroUrl);
    var ctas = buildHeroCtasHtml();
    var placeholderImg =
      '<img class="hero-scale-visual__img" src="/assets/placeholders/hero.svg" alt="" width="560" height="840" decoding="async" />';

    if (layout === 'minimal') {
      return (
        '<div class="hero-scale-layout hero-layout--minimal">' +
        '<h1 class="hero-scale-title"><span class="hero-scale-title__grid">' +
        '<span class="hero-scale-col hero-scale-col--center">' +
        '<span class="hero-scale-kicker" id="preview-kicker">' +
        brand +
        '</span>' +
        '<span class="hero-scale-display hero-scale-display--ink" id="preview-tagline-left">' +
        left +
        '</span>' +
        '<span class="hero-scale-display hero-scale-display--brand">' +
        '<span class="hero-scale-display__line" id="preview-tagline-right-1">' +
        r1 +
        '</span>' +
        '<span class="hero-scale-display__line" id="preview-tagline-right-2">' +
        r2 +
        '</span>' +
        '</span></span></span></h1>' +
        ctas +
        '</div>'
      );
    }

    if (layout === 'image-below') {
      return (
        '<div class="hero-scale-layout hero-layout--image-below">' +
        '<span class="hero-scale-visual' +
        photoClass +
        '"' +
        photoStyle +
        '>' +
        (heroUrl ? '' : placeholderImg) +
        '</span>' +
        '<h1 class="hero-scale-title">' +
        '<span class="hero-scale-col hero-scale-col--center">' +
        '<span class="hero-scale-kicker" id="preview-kicker">' +
        brand +
        '</span>' +
        '<span class="hero-scale-display hero-scale-display--ink" id="preview-tagline-left">' +
        left +
        '</span>' +
        '<span class="hero-scale-display hero-scale-display--brand">' +
        '<span class="hero-scale-display__line" id="preview-tagline-right-1">' +
        r1 +
        '</span>' +
        '<span class="hero-scale-display__line" id="preview-tagline-right-2">' +
        r2 +
        '</span>' +
        '</span></span></h1>' +
        ctas +
        '</div>'
      );
    }

    return (
      '<div class="hero-scale-layout hero-layout--split">' +
      '<h1 class="hero-scale-title">' +
      '<span class="hero-scale-title__grid">' +
      '<span class="hero-scale-col hero-scale-col--left">' +
      '<span class="hero-scale-kicker" id="preview-kicker">' +
      brand +
      '</span>' +
      '<span class="hero-scale-display hero-scale-display--ink" id="preview-tagline-left">' +
      left +
      '</span>' +
      '</span>' +
      '<span class="hero-scale-visual' +
      photoClass +
      '"' +
      photoStyle +
      '>' +
      (heroUrl ? '' : placeholderImg) +
      '</span>' +
      '<span class="hero-scale-col hero-scale-col--right">' +
      '<span class="hero-scale-display hero-scale-display--brand">' +
      '<span class="hero-scale-display__line" id="preview-tagline-right-1">' +
      r1 +
      '</span>' +
      '<span class="hero-scale-display__line" id="preview-tagline-right-2">' +
      r2 +
      '</span>' +
      '</span></span></span></h1>' +
      ctas +
      '</div>'
    );
  }

  var VALID_SECTIONS = ['menu', 'about', 'visit'];
  var VALID_LOCATION_PARTS = ['address', 'map', 'contact'];

  function isSectionHidden(content, section) {
    if (!content || !Array.isArray(content.hiddenSections)) return false;
    return content.hiddenSections.indexOf(section) !== -1;
  }

  function isLocationPartHidden(content, part) {
    if (!content || !Array.isArray(content.hiddenLocationParts)) return false;
    return content.hiddenLocationParts.indexOf(part) !== -1;
  }

  function applyPageVisibility(content) {
    document.querySelectorAll('[data-site-section]').forEach(function (el) {
      var sectionId = el.getAttribute('data-site-section');
      if (!sectionId || VALID_SECTIONS.indexOf(sectionId) === -1) return;
      el.hidden = isSectionHidden(content, sectionId);
    });

    document.querySelectorAll('[data-location-part]').forEach(function (el) {
      var partId = el.getAttribute('data-location-part');
      if (!partId || VALID_LOCATION_PARTS.indexOf(partId) === -1) return;
      el.hidden = isLocationPartHidden(content, partId);
    });

    var menuNav = document.querySelector('.hero-nav__links a[href="#preview-menu-section"]');
    if (menuNav) menuNav.hidden = isSectionHidden(content, 'menu');
    var visitNav = document.querySelector('.hero-nav__links a[href="#preview-visit-section"]');
    if (visitNav) visitNav.hidden = isSectionHidden(content, 'visit');

    var menuCta = document.querySelector('a[href="#preview-menu-section"].hero-btn--outline-light');
    if (menuCta) menuCta.hidden = isSectionHidden(content, 'menu');
    var bookCta = document.querySelector('a[href="#preview-visit-section"].hero-btn--gold');
    if (bookCta) bookCta.hidden = isSectionHidden(content, 'visit');
  }

  function buildCatalogServiceCardHtml(style) {
    var mediaClass = style.imageUrl
      ? 'catalog-service-card__media catalog-service-card__media--photo'
      : 'catalog-service-card__media';
    var media = style.imageUrl
      ? ' style="background-image:url(\'' +
        String(style.imageUrl).replace(/'/g, '%27') +
        '\');"'
      : '';
    var sizeHtml = style.sizeLabel
      ? '<span class="catalog-service-card__size">' + escapeHtml(style.sizeLabel) + '</span>'
      : '';
    var durationHtml = style.durationLabel
      ? '<span class="catalog-service-card__duration">' + escapeHtml(style.durationLabel) + '</span>'
      : '';
    var priceHtml = style.priceLabel
      ? '<span class="catalog-service-card__price">' + escapeHtml(style.priceLabel) + '</span>'
      : '';
    var midHtml =
      sizeHtml || durationHtml || priceHtml
        ? '<div class="catalog-service-card__mid">' + sizeHtml + durationHtml + priceHtml + '</div>'
        : '';

    var bookHref = style.id ? '/booking?style=' + encodeURIComponent(style.id) : '/booking';
    return (
      '<a class="catalog-service-card" href="' + bookHref + '">' +
      '<div class="' +
      mediaClass +
      '" aria-hidden="true"' +
      media +
      '></div>' +
      '<div class="catalog-service-card__body">' +
      '<span class="catalog-service-card__title">' +
      escapeHtml(style.title || '') +
      '</span>' +
      midHtml +
      '</div></a>'
    );
  }

  function buildMenuCatalogCardsHtml(styles) {
    if (!styles || !styles.length) {
      return (
        '<div class="catalog-service-cards catalog-service-cards--popular">' +
        buildCatalogServiceCardHtml({
          title: 'Add styles',
          description: '',
          priceLabel: '',
          sizeLabel: 'Your menu',
        }) +
        '</div>'
      );
    }

    return (
      '<div class="catalog-service-cards catalog-service-cards--popular">' +
      styles
        .slice(0, 12)
        .map(buildCatalogServiceCardHtml)
        .join('') +
      '</div>'
    );
  }

  function buildMenuStylePillsHtml(styles) {
    if (!styles || !styles.length) {
      return (
        '<a class="style-pill" href="#">' +
        '<div class="style-pill__img"></div>' +
        '<div class="style-pill__body"><div class="style-pill__name">Add styles</div>' +
        '<div class="style-pill__desc">Your services appear here</div></div></a>'
      );
    }
    return styles
      .slice(0, 20)
      .map(function (style) {
        var imgHtml = style.imageUrl
          ? '<div class="style-pill__img--bg" style="background-image:url(\'' +
            String(style.imageUrl).replace(/'/g, '%27') +
            '\')"></div>'
          : '<div class="style-pill__img"></div>';
        var desc = style.description
          ? '<div class="style-pill__desc">' + escapeHtml(style.description) + '</div>'
          : '';
        var price = style.priceLabel
          ? '<span class="style-pill__price">' + escapeHtml(style.priceLabel) + '</span>'
          : '';
        return (
          '<a class="style-pill" href="#">' +
          imgHtml +
          '<div class="style-pill__body">' +
          '<div class="style-pill__name">' + escapeHtml(style.title || '') + '</div>' +
          desc +
          '</div>' +
          price +
          '</a>'
        );
      })
      .join('');
  }

  window.applyStyldPreviewContent = function applyStyldPreviewContent() {
    var content = window.__STYLD_SITE_CONTENT__;
    if (!content || typeof content !== 'object') return;

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el && value != null) el.textContent = String(value);
    }

    setText('preview-brand', content.brandName);
    setText('preview-menu-title', content.menuTitle || 'Menu');
    setText('preview-menu-blurb', content.menuBlurb || 'Browse our services & prices — book online.');
    setText('preview-about-title', content.aboutTitle);
    setText('preview-about-body', content.aboutBody);
    setText('preview-visit-title', content.visitTitle);
    setText('preview-visit-body', content.visitBody);
    applyLocationAddress(content);
    setText('preview-phone', content.phoneDisplay);
    setText('preview-email', content.email || 'hello@yoursite.com');
    if (window.StyldTenant && window.StyldTenant.applySiteFooter) {
      window.StyldTenant.applySiteFooter(content);
    } else {
      setText('preview-footer-brand', content.brandName);
      var styldLink = document.getElementById('preview-footer-styld-link');
      if (styldLink) {
        var marketingUrl =
          (window.__STYLD_TENANT__ && window.__STYLD_TENANT__.marketingUrl) || 'https://styldd.com';
        styldLink.href = marketingUrl;
      }
    }

    var handle = (content.instagramHandle || 'yourhandle').replace(/^@/, '').trim();
    var igUrl = 'https://www.instagram.com/' + encodeURIComponent(handle) + '/';

    var igEl = document.getElementById('preview-instagram');
    if (igEl) {
      igEl.innerHTML =
        '<a href="' +
        escapeHtml(igUrl) +
        '" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;text-underline-offset:3px;">@' +
        escapeHtml(handle) +
        '</a>';
    }

    var mapFrame = document.getElementById('preview-map');
    if (mapFrame) {
      var embedUrl = buildGoogleMapsEmbedUrl(content);
      if (embedUrl) {
        mapFrame.src = embedUrl;
        mapFrame.title = 'Map to ' + formatSiteAddress(content);
      } else {
        mapFrame.removeAttribute('src');
      }
    }

    document.title = (content.brandName || 'Your site') + ' | Book online';

    var theme = window.__STYLD_SITE_THEME__ || { heroLayout: 'split', heroImageUrl: null, logoImageUrl: null };
    var heroInner = document.getElementById('preview-hero-inner');
    if (heroInner) {
      if (window.__STYLD_HERO_HTML__) {
        heroInner.innerHTML = window.__STYLD_HERO_HTML__;
      } else {
        heroInner.innerHTML = buildHeroInnerHtml(content, theme);
      }
    }

    var logo = document.querySelector('.hero-brand__logo');
    if (logo && theme.logoImageUrl) {
      logo.src = theme.logoImageUrl;
    }

    var grid = document.getElementById('preview-style-grid');
    if (grid) {
      var styleCardLayout =
        (window.__STYLD_SITE_THEME__ && window.__STYLD_SITE_THEME__.styleCardLayout) || 'card';
      if (styleCardLayout === 'pill') {
        grid.className = 'style-pill-list';
        grid.innerHTML = buildMenuStylePillsHtml(window.__STYLD_SITE_STYLES__ || []);
      } else {
        grid.className = '';
        grid.innerHTML = buildMenuCatalogCardsHtml(window.__STYLD_SITE_STYLES__ || []);
      }
    }

    applyPageVisibility(content);
  };

  if (window.__STYLD_SITE_CONTENT__) {
    window.applyStyldPreviewContent();
  }
})();
