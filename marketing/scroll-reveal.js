(function () {
  var root = document.documentElement;

  function inViewport(el, offset) {
    var rect = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var margin = offset || 0;
    return rect.top < vh - margin && rect.bottom > margin;
  }

  function initScrollReveal() {
    var sections = document.querySelectorAll('.scroll-reveal');
    if (!sections.length) return;

    root.classList.add('scroll-reveal-ready');

    function reveal(el) {
      if (!el.classList.contains('is-visible')) {
        el.classList.add('is-visible');
      }
    }

    var pending = [];

    sections.forEach(function (section) {
      if (inViewport(section, 100)) {
        reveal(section);
      } else {
        pending.push(section);
      }
    });

    if (!pending.length) return;

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            reveal(entry.target);
            observer.unobserve(entry.target);
          });
        },
        {
          threshold: 0.08,
          rootMargin: '0px 0px -60px 0px',
        }
      );

      pending.forEach(function (section) {
        observer.observe(section);
      });
    } else {
      function onScroll() {
        pending = pending.filter(function (section) {
          if (inViewport(section, 100)) {
            reveal(section);
            return false;
          }
          return true;
        });

        if (!pending.length) {
          window.removeEventListener('scroll', onScroll);
          window.removeEventListener('resize', onScroll);
        }
      }

      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      onScroll();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollReveal);
  } else {
    initScrollReveal();
  }
})();
