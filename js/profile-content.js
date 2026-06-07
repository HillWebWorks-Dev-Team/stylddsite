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

  function isSectionHidden(content, section) {
    if (!content || !Array.isArray(content.hiddenSections)) return false;
    return content.hiddenSections.indexOf(section) !== -1;
  }

  function isLocationPartHidden(content, part) {
    if (!content || !Array.isArray(content.hiddenLocationParts)) return false;
    return content.hiddenLocationParts.indexOf(part) !== -1;
  }

  function buildServiceCardWithCategory(style, cardClass) {
    var cat = (style.category || '').trim();
    var imgStyle = style.imageUrl
      ? ' style="background-image:url(\'' + String(style.imageUrl).replace(/'/g, '%27') + '\');background-size:cover;background-position:center;"'
      : '';
    var bookHref = style.id ? '/booking?style=' + encodeURIComponent(style.id) : '/booking';
    return (
      '<a class="' + cardClass + '" href="' + escapeHtml(bookHref) + '"' +
      (cat ? ' data-category="' + escapeHtml(cat) + '"' : '') +
      '>' +
      '<div class="profile-service-card__img" aria-hidden="true"' + imgStyle + '></div>' +
      '<div class="profile-service-card__body">' +
      '<div class="profile-service-card__name">' + escapeHtml(style.title || '') + '</div>' +
      (style.priceLabel ? '<div class="profile-service-card__price">' + escapeHtml(style.priceLabel) + '</div>' : '') +
      (style.durationLabel ? '<div class="profile-service-card__duration">' + escapeHtml(style.durationLabel) + '</div>' : '') +
      '</div></a>'
    );
  }

  function buildProfileServiceCards(styles, theme) {
    var layout = theme && theme.styleCardLayout;
    var cardClass = layout === 'outlined'
      ? 'profile-service-card profile-service-card--outlined'
      : 'profile-service-card';

    if (!styles || !styles.length) {
      return (
        '<a class="' + cardClass + '" href="/booking">' +
        '<div class="profile-service-card__img"></div>' +
        '<div class="profile-service-card__body">' +
        '<div class="profile-service-card__name">Add your services</div>' +
        '<div class="profile-service-card__price">in the Styld app</div>' +
        '</div></a>'
      );
    }

    return styles.slice(0, 24)
      .map(function (s) { return buildServiceCardWithCategory(s, cardClass); })
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
      grid.querySelectorAll('.profile-service-card').forEach(function (card) {
        var cat = card.getAttribute('data-category') || '';
        var hide = filter !== '__all__' && cat !== filter;
        card.hidden = hide;
        card.classList.toggle('profile-service-card--filtered', hide);
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
    if (!infoEl) return;

    var html = '';
    var address = formatSiteAddress(content).trim();

    if (!isLocationPartHidden(content, 'address') && address) {
      var mapsUrl = buildGoogleMapsSearchUrl(address);
      html +=
        '<div class="profile-location-col"><h3>Address</h3>' +
        '<p><a href="' + escapeHtml(mapsUrl) + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(address) + '</a></p></div>';
    }

    if (!isLocationPartHidden(content, 'contact')) {
      var handle = (content.instagramHandle || '').replace(/^@/, '').trim();
      var igUrl = handle ? 'https://www.instagram.com/' + encodeURIComponent(handle) + '/' : '';
      var contactHtml =
        (content.phoneDisplay ? '<p>' + escapeHtml(content.phoneDisplay) + '</p>' : '') +
        (content.email ? '<p><a href="mailto:' + escapeHtml(content.email) + '">' + escapeHtml(content.email) + '</a></p>' : '') +
        (handle ? '<p><a href="' + escapeHtml(igUrl) + '" target="_blank" rel="noopener noreferrer">@' + escapeHtml(handle) + '</a></p>' : '');
      if (contactHtml) {
        html += '<div class="profile-location-col"><h3>Contact</h3>' + contactHtml + '</div>';
      }
    }

    infoEl.innerHTML = html;
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

    // Hero layout
    var heroSection = document.querySelector('.profile-hero');
    var heroPhoto = document.getElementById('profile-hero-photo');
    var isStack = theme.heroLayout === 'stack';
    var isSplit = theme.heroLayout === 'split';

    if (isStack && heroSection) {
      heroSection.classList.add('profile-hero--stack');
      var stackUrls = Array.isArray(theme.heroStackImageUrls) ? theme.heroStackImageUrls : [];
      if (stackUrls.length > 0) {
        var stackEl = document.createElement('div');
        stackEl.className = 'profile-hero-stack';
        stackUrls.forEach(function(url) {
          var img = document.createElement('img');
          img.src = url;
          img.className = 'profile-hero-stack__img';
          img.alt = '';
          img.loading = 'lazy';
          stackEl.appendChild(img);
        });
        var heroGrid = heroSection.querySelector('.profile-hero__grid');
        if (heroGrid) {
          heroSection.insertBefore(stackEl, heroGrid);
        } else {
          heroSection.prepend(stackEl);
        }
        if (heroPhoto) heroPhoto.style.display = 'none';
      }
    }

    if (!isStack && heroPhoto && theme.heroImageUrl) {
      heroPhoto.style.backgroundImage = "url('" + String(theme.heroImageUrl).replace(/'/g, '%27') + "')";
    }

    // About & policy — only visible for "split" layout
    var profileInfo = document.querySelector('.profile-info');
    if (profileInfo) profileInfo.style.display = isSplit ? '' : 'none';

    var aboutEl = document.getElementById('profile-about-body');
    if (aboutEl) aboutEl.textContent = content.heroDescription || '';

    var policyEl = document.getElementById('profile-policy-body');
    var policyBlock = document.getElementById('profile-policy-block');
    if (policyEl) {
      var policyText = (content.bookingPolicy || '').trim();
      var bullets = policyText
        ? policyText.split('\n').map(function(l){ return l.trim(); }).filter(Boolean)
        : [];
      policyEl.innerHTML = '';
      bullets.forEach(function(bullet) {
        var li = document.createElement('li');
        li.textContent = bullet;
        policyEl.appendChild(li);
      });
      if (policyBlock) policyBlock.hidden = !isSplit || bullets.length === 0;
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
    }

    // Location
    var visitTitleEl = document.getElementById('profile-visit-title');
    if (visitTitleEl) visitTitleEl.textContent = content.visitTitle || 'Location';
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

    // Section visibility
    document.querySelectorAll('[data-site-section]').forEach(function (el) {
      var sectionId = el.getAttribute('data-site-section');
      if (sectionId) el.hidden = isSectionHidden(content, sectionId);
    });

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
    window.applyStyldPreviewContent();
  }
})();
