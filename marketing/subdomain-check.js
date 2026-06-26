(function () {
  var RESERVED = new Set([
    'www', 'api', 'app', 'admin', 'mail', 'staging', 'dev', 'test', 'support', 'help', 'blog', 'status',
  ]);

  var APP_STORE_URL =
    'https://apps.apple.com/us/app/styld-the-crm-for-hair-salons/id6777321677';

  function cfg() {
    return window.__STYLD_MARKETING__ || {};
  }

  function rootDomain() {
    return (cfg().rootDomain || 'styldd.com').toLowerCase();
  }

  function normalizeSubdomain(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32);
  }

  function isValidSubdomain(subdomain) {
    if (subdomain.length < 2 || subdomain.length > 32) return false;
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain);
  }

  function suggestAlternatives(slug) {
    var bases = [slug + '-studio', slug + '-2', slug + '-book', slug + '-pro'];
    var out = [];
    bases.forEach(function (base) {
      var s = normalizeSubdomain(base);
      if (isValidSubdomain(s) && !RESERVED.has(s) && out.indexOf(s) === -1) out.push(s);
    });
    return out.slice(0, 3);
  }

  function restHeaders() {
    var c = cfg();
    return {
      apikey: c.supabaseAnonKey,
      Authorization: 'Bearer ' + c.supabaseAnonKey,
    };
  }

  function querySubdomain(slug) {
    var c = cfg();
    if (!c.supabaseUrl || !c.supabaseAnonKey) {
      return Promise.reject(new Error('not_configured'));
    }
    var url =
      c.supabaseUrl.replace(/\/$/, '') +
      '/rest/v1/styld_site_subdomains?subdomain=eq.' +
      encodeURIComponent(slug) +
      '&select=subdomain,published_at';

    return fetch(url, { headers: restHeaders(), cache: 'no-store' }).then(function (res) {
      if (!res.ok) throw new Error('request_failed');
      return res.json();
    });
  }

  function runCheck(slug) {
    if (!slug) {
      return Promise.resolve({ state: 'empty' });
    }
    if (!isValidSubdomain(slug)) {
      return Promise.resolve({
        state: 'invalid',
        message: 'Use 2–32 letters, numbers, or hyphens only.',
      });
    }
    if (RESERVED.has(slug)) {
      return Promise.resolve({
        state: 'reserved',
        message: 'That name is reserved.',
      });
    }
    return querySubdomain(slug).then(function (rows) {
      if (!rows || !rows.length) {
        return { state: 'available', slug: slug };
      }
      var row = rows[0];
      return {
        state: 'taken',
        slug: slug,
        published: !!row.published_at,
      };
    });
  }

  function init() {
    var form = document.getElementById('domainCheckForm');
    var input = document.getElementById('domainCheckInput');
    var result = document.getElementById('domainCheckResult');
    if (!form || !input || !result) return;

    var debounceTimer = null;
    var requestId = 0;
    var domain = rootDomain();

    function hideResult() {
      result.hidden = true;
      result.innerHTML = '';
      result.className = 'domain-check__message';
    }

    function showChecking(slug) {
      result.hidden = false;
      result.className = 'domain-check__message domain-check__message--checking';
      result.innerHTML =
        '<span class="domain-check__checking-icon" aria-hidden="true">↻</span>' +
        'Checking <strong>' + slug + '.' + domain + '</strong>…';
    }

    function renderOutcome(outcome) {
      if (outcome.state === 'empty') {
        hideResult();
        return;
      }

      result.hidden = false;

      if (outcome.state === 'invalid' || outcome.state === 'reserved') {
        result.className = 'domain-check__message domain-check__message--invalid';
        result.innerHTML =
          '<strong>That name won\'t work.</strong>' +
          '<p>' + outcome.message + '</p>';
        return;
      }

      if (outcome.state === 'error') {
        result.className = 'domain-check__message domain-check__message--invalid';
        result.innerHTML =
          '<strong>Couldn\'t check right now.</strong>' +
          '<p>Try again in a moment.</p>';
        return;
      }

      if (outcome.state === 'available') {
        result.className = 'domain-check__message domain-check__message--available';
        result.innerHTML =
          '<strong>' + outcome.slug + '.' + domain + '</strong> is available!' +
          '<p>Claim it in the Styld app when you set up your booking site.</p>' +
          '<a class="domain-check__cta" href="' + APP_STORE_URL + '" target="_blank" rel="noopener noreferrer">Get the app ↗</a>';
        return;
      }

      if (outcome.state === 'taken') {
        var suggestions = suggestAlternatives(outcome.slug);
        var liveNote = outcome.published
          ? 'This site is already live.'
          : 'Someone already claimed this name.';
        var suggestHtml = '';
        if (suggestions.length) {
          suggestHtml =
            '<p class="domain-check__suggest-label">Try one of these:</p>' +
            '<div class="domain-check__suggest-list">' +
            suggestions
              .map(function (s) {
                return (
                  '<button type="button" class="domain-check__suggest" data-suggest="' +
                  s +
                  '">' +
                  s +
                  '.' +
                  domain +
                  '</button>'
                );
              })
              .join('') +
            '</div>';
        }
        result.className = 'domain-check__message domain-check__message--taken';
        result.innerHTML =
          '<strong>' + outcome.slug + '.' + domain + '</strong> is taken.' +
          '<p>' + liveNote + '</p>' +
          suggestHtml;

        result.querySelectorAll('[data-suggest]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            input.value = btn.getAttribute('data-suggest') || '';
            scheduleCheck(true);
          });
        });
      }
    }

    function scheduleCheck(immediate) {
      clearTimeout(debounceTimer);
      var slug = normalizeSubdomain(input.value);
      if (input.value !== slug) input.value = slug;

      if (!slug) {
        hideResult();
        return;
      }

      var id = ++requestId;

      if (!immediate) {
        debounceTimer = setTimeout(function () { performCheck(id, slug); }, 450);
        return;
      }

      performCheck(id, slug);
    }

    function performCheck(id, slug) {
      if (!isValidSubdomain(slug) || RESERVED.has(slug)) {
        runCheck(slug).then(function (outcome) {
          if (id !== requestId) return;
          renderOutcome(outcome);
        });
        return;
      }

      showChecking(slug);
      runCheck(slug)
        .then(function (outcome) {
          if (id !== requestId) return;
          renderOutcome(outcome);
        })
        .catch(function (err) {
          if (id !== requestId) return;
          if (err && err.message === 'not_configured') {
            renderOutcome({
              state: 'error',
            });
            return;
          }
          renderOutcome({ state: 'error' });
        });
    }

    input.addEventListener('input', function () {
      scheduleCheck(false);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      scheduleCheck(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
