(function () {
  function initHeroEffects() {
    var hero = document.querySelector('.hero-section');
    var phone = document.querySelector('.hero-phone-wrap');
    var cards = Array.prototype.slice.call(document.querySelectorAll('.float-card'));
    var glow = document.querySelector('.hero-glow');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    console.log('Hero effects loaded');
    console.log('Phone found:', phone);
    console.log('Cards found:', cards.length);

    window.__heroEffectsDebug = {
      loaded: true,
      phoneFound: !!phone,
      cardsFound: cards.length
    };

    if (!hero) {
      console.warn('Missing hero-section');
      return;
    }

    if (!phone) {
      console.warn('Missing hero-phone');
    }

    if (!cards.length) {
      console.warn('Missing float-card');
    }

    if (reduceMotion) {
      return;
    }

    var spotlight = document.createElement('div');
    spotlight.className = 'cursor-spotlight';
    spotlight.setAttribute('aria-hidden', 'true');
    document.body.appendChild(spotlight);

    var targetX = window.innerWidth / 2;
    var targetY = window.innerHeight / 2;
    var currentX = targetX;
    var currentY = targetY;
    var hasPointer = false;
    var frameRequested = false;

    function setElementVar(element, name, value) {
      if (element) {
        element.style.setProperty(name, value);
      }
    }

    function updateEffects() {
      frameRequested = false;

      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;

      var width = window.innerWidth || 1;
      var height = window.innerHeight || 1;
      var mx = ((currentX / width) - 0.5) * 2;
      var my = ((currentY / height) - 0.5) * 2;

      hero.style.setProperty('--mx', mx.toFixed(4));
      hero.style.setProperty('--my', my.toFixed(4));

      setElementVar(phone, '--hero-phone-x', (mx * 8).toFixed(2) + 'px');
      setElementVar(phone, '--hero-phone-y', (my * 6).toFixed(2) + 'px');
      setElementVar(glow, '--hero-glow-x', (mx * 20).toFixed(2) + 'px');
      setElementVar(glow, '--hero-glow-y', (my * 20).toFixed(2) + 'px');

      cards.forEach(function (card, index) {
        var inner = card.querySelector('.float-card-inner');
        var depth = inner ? parseFloat(inner.dataset.depth) || 1 : 1;
        var amount = 10 + Math.min(depth * 6 + index, 10);

        card.style.setProperty('--card-parallax-x', (mx * amount).toFixed(2) + 'px');
        card.style.setProperty('--card-parallax-y', (my * amount * 0.72).toFixed(2) + 'px');
      });

      spotlight.style.transform = 'translate3d(' + (currentX - 300).toFixed(2) + 'px, ' + (currentY - 300).toFixed(2) + 'px, 0)';

      if (hasPointer) {
        requestFrame();
      }
    }

    function requestFrame() {
      if (!frameRequested) {
        frameRequested = true;
        window.requestAnimationFrame(updateEffects);
      }
    }

    window.addEventListener('pointermove', function (event) {
      targetX = event.clientX;
      targetY = event.clientY;
      hasPointer = true;
      spotlight.classList.add('is-visible');
      requestFrame();
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      hasPointer = false;
      spotlight.classList.remove('is-visible');
    }, { passive: true });

    cards.forEach(function (card) {
      var inner = card.querySelector('.float-card-inner');
      if (!inner) return;

      card.addEventListener('mousemove', function (event) {
        event.stopPropagation();

        var rect = card.getBoundingClientRect();
        var x = ((event.clientX - rect.left) / rect.width) - 0.5;
        var y = ((event.clientY - rect.top) / rect.height) - 0.5;
        var rotateY = x * 16;
        var rotateX = y * -16;

        inner.style.setProperty('--tilt-x', rotateX.toFixed(2) + 'deg');
        inner.style.setProperty('--tilt-y', rotateY.toFixed(2) + 'deg');
      });

      card.addEventListener('mouseleave', function () {
        inner.style.setProperty('--tilt-x', '0deg');
        inner.style.setProperty('--tilt-y', '0deg');
      });
    });

    requestFrame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHeroEffects);
  } else {
    initHeroEffects();
  }
})();
