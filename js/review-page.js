(function () {
  var cfg = window.__STYLD_TENANT__ || {};
  var statusEl = document.getElementById('review-status');
  var formWrap = document.getElementById('review-form-wrap');
  var successEl = document.getElementById('review-success');
  var form = document.getElementById('review-form');
  var ratingInput = document.getElementById('review-rating');
  var starButtons = document.querySelectorAll('[data-review-star]');
  var context = null;

  function getSubdomain() {
    if (window.StyldTenant && window.StyldTenant.getSubdomain) {
      return window.StyldTenant.getSubdomain();
    }
    var rootDomain = (cfg.rootDomain || 'styldd.com').toLowerCase();
    var host = (window.location.hostname || '').toLowerCase();
    var fromQuery = new URLSearchParams(window.location.search).get('subdomain');
    if (fromQuery) return fromQuery.trim().toLowerCase();
    if (host.endsWith('.' + rootDomain) && host !== rootDomain && host !== 'www.' + rootDomain) {
      return host.slice(0, -(rootDomain.length + 1));
    }
    return '';
  }

  function showStatus(message, isError) {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.textContent = message;
    statusEl.className = 'review-status' + (isError ? ' review-status--error' : '');
  }

  function hideStatus() {
    if (statusEl) statusEl.hidden = true;
  }

  function rpc(name, params) {
    return fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          var msg = body && (body.message || body.error || body.hint) ? body.message || body.error || body.hint : 'Request failed';
          throw new Error(msg);
        }
        return body;
      });
    });
  }

  function setRating(value) {
    if (ratingInput) ratingInput.value = String(value);
    starButtons.forEach(function (btn) {
      var star = Number(btn.getAttribute('data-review-star'));
      btn.classList.toggle('is-active', star <= value);
      btn.setAttribute('aria-pressed', star <= value ? 'true' : 'false');
    });
  }

  starButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setRating(Number(btn.getAttribute('data-review-star')) || 5);
    });
  });

  function showAlreadySubmitted() {
    if (formWrap) formWrap.hidden = true;
    if (successEl) {
      successEl.hidden = false;
      successEl.textContent = 'You already left a review for this appointment. Thank you!';
    }
    hideStatus();
  }

  function showSuccess() {
    if (formWrap) formWrap.hidden = true;
    if (successEl) {
      successEl.hidden = false;
      successEl.textContent = 'Thank you! Your review has been submitted.';
    }
    hideStatus();
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!context) return;

      var subdomain = getSubdomain();
      var token = new URLSearchParams(window.location.search).get('token') || '';
      var rating = Number(ratingInput && ratingInput.value ? ratingInput.value : 0);
      var message = (document.getElementById('review-message') || {}).value || '';
      var clientName = (document.getElementById('review-name') || {}).value || '';

      showStatus('Submitting…', false);

      rpc('styld_tenant_submit_review', {
        p_subdomain: subdomain,
        p_token: token,
        p_rating: rating,
        p_message: message,
        p_client_name: clientName,
      })
        .then(function () {
          showSuccess();
        })
        .catch(function (err) {
          showStatus(err && err.message ? err.message : 'Could not submit review.', true);
        });
    });
  }

  function init() {
    var subdomain = getSubdomain();
    var token = new URLSearchParams(window.location.search).get('token') || '';

    if (!subdomain) {
      showStatus('Site not found.', true);
      return;
    }
    if (!token) {
      showStatus('This review link is missing a token.', true);
      return;
    }
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      showStatus('This site is not configured yet.', true);
      return;
    }

    showStatus('Loading…', false);

    rpc('styld_tenant_get_review_context', {
      p_subdomain: subdomain,
      p_token: token,
    })
      .then(function (data) {
        context = data || {};
        hideStatus();

        var title = document.getElementById('review-page-title');
        if (title && context.brand_name) {
          title.textContent = 'Review ' + context.brand_name;
        }
        document.title = (context.brand_name || 'Your stylist') + ' | Leave a review';

        if (context.already_submitted) {
          showAlreadySubmitted();
          return;
        }

        var nameInput = document.getElementById('review-name');
        if (nameInput && context.client_name) {
          nameInput.value = context.client_name;
        }

        var lead = document.getElementById('review-lead');
        if (lead && context.style_name) {
          lead.textContent = 'How was your ' + context.style_name + '?';
        }

        setRating(5);
        if (formWrap) formWrap.hidden = false;
      })
      .catch(function (err) {
        showStatus(err && err.message ? err.message : 'This review link is invalid or expired.', true);
        if (formWrap) formWrap.hidden = true;
      });
  }

  init();
})();
