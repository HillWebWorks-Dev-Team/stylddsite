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

    var showAddress = !isLocationPartHidden(content, 'address') && !!address;
    var showContact =
      !isLocationPartHidden(content, 'contact') &&
      !!(String(content.phoneDisplay || '').trim() || String(content.email || '').trim());
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
        (content.phoneDisplay ? '<p>' + escapeHtml(content.phoneDisplay) + '</p>' : '') +
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

  function layoutProfileInfo(profileInfo, heroGrid, siteMain, isCoverSplash, isSplit) {
    if (!profileInfo || !siteMain) return;
    if (isBookPage()) {
      var introWrap = document.getElementById('profile-book-intro') ||
        siteMain.querySelector('.profile-book-intro') ||
        siteMain.querySelector('.profile-main-intro') ||
        siteMain;
      if (profileInfo.parentElement !== introWrap) {
        introWrap.insertBefore(profileInfo, introWrap.firstChild);
      }
      profileInfo.hidden = false;
      profileInfo.style.display = '';
      return;
    }
    if (!heroGrid) return;
    var introWrap = siteMain.querySelector('.profile-main-intro') || siteMain;
    if (isCoverSplash) {
      if (profileInfo.parentElement !== introWrap) {
        introWrap.insertBefore(profileInfo, introWrap.firstChild);
      }
      profileInfo.hidden = true;
      profileInfo.style.display = 'none';
      return;
    }
    if (isSplit) {
      if (profileInfo.parentElement !== heroGrid) {
        heroGrid.appendChild(profileInfo);
      }
      profileInfo.hidden = false;
      profileInfo.style.display = '';
      return;
    }
    if (profileInfo.parentElement !== heroGrid) {
      heroGrid.appendChild(profileInfo);
    }
    profileInfo.hidden = true;
    profileInfo.style.display = 'none';
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

  function applyAboutPolicyVisibility(content, isSplit, isCoverSplash) {
    var aboutBlock = document.getElementById('profile-about-block');
    var policyBlock = document.getElementById('profile-policy-block');
    var policyEl = document.getElementById('profile-policy-body');
    var bookIntro = document.getElementById('profile-book-intro');
    var profileInfo = document.getElementById('profile-info-block');

    var policyText = (content.bookingPolicy || '').trim();
    var bullets = policyText
      ? policyText.split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
      : [];

    if (policyEl) {
      policyEl.innerHTML = '';
      bullets.forEach(function (bullet) {
        var li = document.createElement('li');
        li.textContent = bullet;
        policyEl.appendChild(li);
      });
    }

    var aboutHidden = isSectionHidden(content, 'aboutMe');
    var policiesHidden = isSectionHidden(content, 'policies') || bullets.length === 0;

    if (aboutBlock) aboutBlock.hidden = aboutHidden;
    if (policyBlock) policyBlock.hidden = policiesHidden;

    if (isBookPage() && bookIntro) {
      bookIntro.hidden = aboutHidden && policiesHidden;
    }

    if (profileInfo && isSplit && !isCoverSplash) {
      var anyVisible = !aboutHidden || !policiesHidden;
      profileInfo.hidden = !anyVisible;
      profileInfo.style.display = anyVisible ? '' : 'none';
    }
  }

  function applySectionVisibility(content) {
    document.querySelectorAll('[data-site-section]').forEach(function (el) {
      var sectionId = el.getAttribute('data-site-section');
      if (!sectionId) return;
      if (
        sectionId === 'visit' ||
        sectionId === 'aboutMe' ||
        sectionId === 'policies' ||
        sectionId === 'portfolio'
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

  function populatePortfolio(content, theme) {
    var section = document.getElementById('profile-portfolio-section');
    var grid = document.getElementById('profile-portfolio-grid');
    var titleEl = document.getElementById('profile-portfolio-title');
    var blurbEl = document.getElementById('profile-portfolio-blurb');
    var menuSection = document.getElementById('profile-menu-section');
    if (!section || !grid) return;

    var items = normalizePortfolioItems(theme);
    if (isSectionHidden(content, 'portfolio') || !items.length) {
      section.hidden = true;
      grid.innerHTML = '';
      return;
    }

    if (menuSection && menuSection.parentNode) {
      var parent = menuSection.parentNode;
      var placement = String(content.portfolioPlacement || 'above_menu').trim();
      if (placement === 'below_menu') {
        parent.insertBefore(section, menuSection.nextSibling);
      } else {
        parent.insertBefore(section, menuSection);
      }
    }

    if (titleEl) {
      titleEl.textContent = String(content.reelsTitle || 'Previous work').trim() || 'Previous work';
    }
    if (blurbEl) {
      var blurb = String(content.reelsBlurb || '').trim();
      blurbEl.textContent = blurb;
      blurbEl.hidden = !blurb;
    }

    grid.innerHTML = items
      .map(function (item, index) {
        var url = resolvePortfolioMediaUrl(item.storagePath);
        if (!url) return '';
        if (item.mediaType === 'video') {
          return (
            '<div class="profile-portfolio-item">' +
            '<video controls playsinline preload="metadata" src="' +
            escapeHtml(url) +
            '" aria-label="Portfolio video ' +
            (index + 1) +
            '"></video>' +
            '</div>'
          );
        }
        return (
          '<div class="profile-portfolio-item">' +
          '<img src="' +
          escapeHtml(url) +
          '" alt="" loading="lazy" decoding="async" />' +
          '</div>'
        );
      })
      .join('');

    section.hidden = false;
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
    var photoWrap = document.getElementById('profile-photo-wrap');
    var heroGrid = document.querySelector('.profile-hero__grid');
    var profileInfo = document.getElementById('profile-info-block');
    var siteMain = document.getElementById('site-main-content');
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

    layoutProfileInfo(profileInfo, heroGrid, siteMain, isCoverSplash, isSplit);

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
    } else if (!isStack && !isMinimal && heroPhoto && theme.heroImageUrl) {
      heroPhoto.style.backgroundImage = "url('" + String(theme.heroImageUrl).replace(/'/g, '%27') + "')";
      heroPhoto.style.backgroundPosition = heroBackgroundPosition(theme);
      applyHeroCoverBlur(heroPhoto, theme);
    }

    var aboutEl = document.getElementById('profile-about-body');
    if (aboutEl) aboutEl.textContent = content.heroDescription || '';

    applyAboutPolicyVisibility(content, isSplit, isCoverSplash);

    // Menu
    var menuTitleEl = document.getElementById('profile-menu-title');
    if (menuTitleEl) menuTitleEl.textContent = content.menuTitle || 'Menu';
    var menuBlurbEl = document.getElementById('profile-menu-blurb');
    if (menuBlurbEl) menuBlurbEl.textContent = content.menuBlurb || '';

    var serviceGrid = document.getElementById('profile-service-grid');
    if (serviceGrid) {
      serviceGrid.innerHTML = buildProfileServiceCards(styles, theme);
      setupMenuFilters(styles, serviceGrid);
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
