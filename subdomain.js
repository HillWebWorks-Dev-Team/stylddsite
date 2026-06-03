(function () {
  var RESERVED = ['www', 'app', 'api', 'admin', 'mail', 'staging', 'dev', 'preview'];
  var ROOT_DOMAINS = ['styldd.com', 'stylddsite.vercel.app'];

  function getSubdomain(hostname) {
    var host = (hostname || window.location.hostname).toLowerCase();

    if (ROOT_DOMAINS.indexOf(host) !== -1) return null;

    if (host.endsWith('.vercel.app')) {
      var vercelParts = host.split('.');
      if (vercelParts.length > 3) return vercelParts[0];
      return null;
    }

    var parts = host.split('.');
    if (parts.length < 3) return null;

    var sub = parts[0];
    if (!sub || RESERVED.indexOf(sub) !== -1) return null;

    return sub;
  }

  function formatBusinessName(slug) {
    return slug
      .split(/[-_]+/)
      .filter(Boolean)
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function init() {
    var slug = getSubdomain();
    var marketing = document.getElementById('marketing-site');
    var tenant = document.getElementById('tenant-site');

    if (!marketing || !tenant) return;

    if (!slug) {
      marketing.hidden = false;
      tenant.hidden = true;
      return;
    }

    var name = formatBusinessName(slug);
    marketing.hidden = true;
    tenant.hidden = false;
    document.body.classList.add('tenant-mode');

    document.title = name + ' — Book on Styld';
    var meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.content = 'Book appointments with ' + name + '. Powered by Styld CRM.';
    }

    var els = {
      name: document.getElementById('tenant-name'),
      slug: document.getElementById('tenant-slug'),
      bookBtn: document.getElementById('tenant-book-btn'),
      url: document.getElementById('tenant-url')
    };

    if (els.name) els.name.textContent = name;
    if (els.slug) els.slug.textContent = slug + '.styldd.com';
    if (els.url) els.url.textContent = window.location.host;
    if (els.bookBtn) {
      els.bookBtn.addEventListener('click', function () {
        var form = document.getElementById('tenant-booking');
        if (form) form.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.StyldSubdomain = { getSubdomain: getSubdomain, formatBusinessName: formatBusinessName };
})();
