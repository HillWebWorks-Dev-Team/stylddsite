(function () {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function truncateMessage(message, maxLen) {
    var text = String(message || '').trim();
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1).trim() + '\u2026';
  }

  function starsHtml(rating) {
    var n = Math.max(1, Math.min(5, Math.round(Number(rating) || 0)));
    var html = '<span class="site-review-stars" aria-label="' + n + ' out of 5 stars">';
    for (var i = 1; i <= 5; i++) {
      html += '<span class="site-review-star' + (i <= n ? ' is-filled' : '') + '" aria-hidden="true">\u2605</span>';
    }
    html += '</span>';
    return html;
  }

  function buildReviewCard(review) {
    return (
      '<button type="button" class="site-review-card" data-review-id="' +
      escapeHtml(review.id || '') +
      '">' +
      '<span class="site-review-card__name">' +
      escapeHtml(review.clientName || 'Client') +
      '</span>' +
      starsHtml(review.rating) +
      '<span class="site-review-card__message">' +
      escapeHtml(truncateMessage(review.message, 72)) +
      '</span>' +
      '</button>'
    );
  }

  function ensureModal() {
    var existing = document.getElementById('site-review-modal');
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = 'site-review-modal';
    modal.className = 'site-review-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'site-review-modal-title');
    modal.innerHTML =
      '<div class="site-review-modal__backdrop" data-review-modal-close></div>' +
      '<div class="site-review-modal__panel">' +
      '<button type="button" class="site-review-modal__close" data-review-modal-close aria-label="Close review">&times;</button>' +
      '<h3 id="site-review-modal-title" class="site-review-modal__name"></h3>' +
      '<div class="site-review-modal__stars"></div>' +
      '<p class="site-review-modal__message"></p>' +
      '</div>';
    document.body.appendChild(modal);
    return modal;
  }

  function openReviewModal(review) {
    var modal = ensureModal();
    modal.querySelector('.site-review-modal__name').textContent = review.clientName || 'Client';
    modal.querySelector('.site-review-modal__stars').innerHTML = starsHtml(review.rating);
    modal.querySelector('.site-review-modal__message').textContent = review.message || '';
    modal.hidden = false;
    document.body.classList.add('site-review-modal-open');
  }

  function closeReviewModal() {
    var modal = document.getElementById('site-review-modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('site-review-modal-open');
  }

  function setupMarquee(track) {
    var SPEED = 42;
    var resizeTimer;

    function rebuild() {
      var cards = Array.prototype.slice.call(track.querySelectorAll('.site-review-card'));
      if (!cards.length) return;

      var seedHtml = cards.map(function (card) {
        return card.outerHTML;
      }).join('');
      track.innerHTML = seedHtml + seedHtml;

      var halfWidth = track.scrollWidth / 2;
      track.style.setProperty('--site-reviews-loop', halfWidth + 'px');
      track.style.animationDuration = halfWidth / SPEED + 's';
    }

    rebuild();
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rebuild, 150);
    });
  }

  window.initStyldSiteReviews = function initStyldSiteReviews() {
    var section = document.getElementById('profile-reviews-section');
    var track = document.getElementById('site-reviews-track');
    if (!section || !track) return;

    var settings = window.__STYLD_REVIEWS_SETTINGS__ || { enabled: true };
    var reviews = window.__STYLD_SITE_REVIEWS__ || [];
    var published = reviews.filter(function (r) {
      return r && r.message;
    });

    if (settings.enabled === false || !published.length) {
      section.hidden = true;
      return;
    }

    track.innerHTML = published.map(buildReviewCard).join('');
    section.hidden = false;
    setupMarquee(track);

    if (!track.dataset.bound) {
      track.dataset.bound = '1';
      track.addEventListener('click', function (e) {
        var card = e.target && e.target.closest ? e.target.closest('.site-review-card') : null;
        if (!card) return;
        var id = card.getAttribute('data-review-id');
        var review = published.find(function (r) {
          return String(r.id) === String(id);
        });
        if (review) openReviewModal(review);
      });
    }

    if (!document.body.dataset.reviewModalBound) {
      document.body.dataset.reviewModalBound = '1';
      document.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('[data-review-modal-close]')) {
          closeReviewModal();
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeReviewModal();
      });
    }
  };

  if (window.__STYLD_SITE_REVIEWS__) {
    window.initStyldSiteReviews();
  }
})();
