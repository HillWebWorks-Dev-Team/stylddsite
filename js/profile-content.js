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

  function buildProfileServiceCardHtml(style) {
    var imgStyle = style.imageUrl
      ? ' style="background-image:url(\'' + String(style.imageUrl).replace(/'/g, '%27') + '\');"'
      : '';
    var bookHref = style.id ? '/booking?style=' + encodeURIComponent(style.id) : '/booking';
    var durationHtml = style.durationLabel
      ? '<span class="profile-service-card__duration">' + escapeHtml(style.durationLabel) + '</span>'
      : '';

    return (
      '<a class="profile-service-card" href="' +
      bookHref +
      '">' +
      '<div class="profile-service-card__img"' +
      imgStyle +
      '></div>' +
      '<div class="profile-service-card__body">' +
      '<div class="profile-service-card__name">' +
      escapeHtml(style.title || '') +
      '</div>' +
      '<div class="profile-service-card__price">' +
      escapeHtml(style.priceLabel || 'Price TBD') +
      '</div>' +
      durationHtml +
      '</div></a>'
    );
  }

  function buildLocationInfoHtml(content) {
    var fullAddress = formatSiteAddress(content).trim();
    var html = '';

    if (fullAddress) {
      var mapsUrl = buildGoogleMapsSearchUrl(fullAddress);
      html +=
        '<div class="profile-location-col">' +
        '<h3>Address</h3>' +
        '<p><a href="' +
        escapeHtml(mapsUrl) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(fullAddress) +
        '</a></p></div>';
    }

    if (content.phoneDisplay) {
      var phoneDigits = String(content.phoneDisplay).replace(/\D/g, '');
      html +=
        '<div class="profile-location-col">' +
        '<h3>Phone</h3>' +
        '<p><a href="tel:' +
        escapeHtml(phoneDigits) +
        '">' +
        escapeHtml(content.phoneDisplay) +
        '</a></p></div>';
    }

    if (content.email) {
      html +=
        '<div class="profile-location-col">' +
        '<h3>Email</h3>' +
        '<p><a href="mailto:' +
        escapeHtml(content.email) +
        '">' +
        escapeHtml(content.email) +
        '</a></p></div>';
    }

    var handle = content.instagramHandle ? String(content.instagramHandle).replace(/^@/, '').trim() : '';
    if (handle) {
      var igUrl = 'https://www.instagram.com/' + encodeURIComponent(handle) + '/';
      html +=
        '<div class="profile-location-col">' +
        '<h3>Instagram</h3>' +
        '<p><a href="' +
        escapeHtml(igUrl) +
        '" target="_blank" rel="noopener noreferrer">@' +
        escapeHtml(handle) +
        '</a></p></div>';
    }

    if (content.hoursDisplay) {
      html +=
        '<div class="profile-location-col">' +
        '<h3>Hours</h3>' +
        '<p>' +
        escapeHtml(content.hoursDisplay) +
        '</p></div>';
    }

    return html;
  }

  window.applyStyldPreviewContent = function applyStyldPreviewContent() {
    var content = window.__STYLD_SITE_CONTENT__;
    if (!content || typeof content !== 'object') return;

    function setText(id, value) {
      var el = document.getElementById(id);
      if (el && value != null) el.textContent = String(value);
    }

    setText('profile-brand-name', content.brandName || 'Your Brand');
    setText('profile-about-title', content.aboutTitle || 'About Me');

    var aboutEl = document.getElementById('profile-about-body');
    if (aboutEl) {
      aboutEl.textContent = content.heroDescription || '';
    }

    setText('profile-menu-title', content.menuTitle || 'Menu');
    setText('profile-menu-blurb', content.menuBlurb || 'Browse our services and book online.');
    setText('profile-visit-title', content.visitTitle || 'Location');

    var policyEl = document.getElementById('profile-policy-body');
    var policyBlock = document.getElementById('profile-policy-block');
    if (policyEl) {
      var policyText = (content.bookingPolicy || '').trim();
      var bullets = policyText
        ? policyText.split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
        : [];
      policyEl.innerHTML = '';
      bullets.forEach(function (bullet) {
        var li = document.createElement('li');
        li.textContent = bullet;
        policyEl.appendChild(li);
      });
      if (policyBlock) {
        policyBlock.hidden = bullets.length === 0;
      }
    }

    var theme = window.__STYLD_SITE_THEME__ || {};
    var heroPhoto = document.getElementById('profile-hero-photo');
    if (heroPhoto && theme.heroImageUrl) {
      heroPhoto.style.backgroundImage = "url('" + String(theme.heroImageUrl).replace(/'/g, '%27') + "')";
    }

    var logoWrap = document.getElementById('profile-logo-placeholder');
    if (logoWrap && theme.logoImageUrl) {
      logoWrap.innerHTML =
        '<img class="profile-brand__logo-img" src="' +
        escapeHtml(theme.logoImageUrl) +
        '" alt="" width="38" height="38" decoding="async" />';
      logoWrap.removeAttribute('aria-hidden');
    }

    var grid = document.getElementById('profile-service-grid');
    if (grid) {
      var styles = window.__STYLD_SITE_STYLES__ || [];
      if (!styles.length) {
        grid.innerHTML = buildProfileServiceCardHtml({
          title: 'Add services in Styld',
          priceLabel: '',
          durationLabel: '',
        });
      } else {
        grid.innerHTML = styles.slice(0, 12).map(buildProfileServiceCardHtml).join('');
      }
    }

    var locationInfo = document.getElementById('profile-location-info');
    if (locationInfo) {
      locationInfo.innerHTML = buildLocationInfoHtml(content);
    }

    var mapFrame = document.getElementById('profile-map');
    if (mapFrame) {
      var embedUrl = buildGoogleMapsEmbedUrl(content);
      if (embedUrl) {
        mapFrame.src = embedUrl;
        mapFrame.title = 'Map to ' + formatSiteAddress(content);
      } else {
        mapFrame.removeAttribute('src');
      }
    }

    if (window.StyldTenant && window.StyldTenant.applySiteFooter) {
      window.StyldTenant.applySiteFooter(content);
    } else {
      setText('preview-footer-brand', content.brandName ? '\u00A9 ' + content.brandName : '');
    }

    document.title = (content.brandName || 'Your site') + ' | Book online';

    var menuSection = document.getElementById('profile-menu-section');
    if (menuSection) menuSection.hidden = isSectionHidden(content, 'menu');
    var visitSection = document.getElementById('profile-location-section');
    if (visitSection) visitSection.hidden = isSectionHidden(content, 'visit');
  };

  if (window.__STYLD_SITE_CONTENT__) {
    window.applyStyldPreviewContent();
  }
})();
