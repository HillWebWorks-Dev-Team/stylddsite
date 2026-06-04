(function () {
  document.querySelectorAll('[data-screenshot-explorer]').forEach(function (explorer) {
    var img = explorer.querySelector('.screenshot-explorer__img');
    var cards = explorer.querySelectorAll('.screenshot-explorer__card');
    var dotsWrap = explorer.querySelector('.screenshot-explorer__dots');
    var prev = explorer.querySelector('.screenshot-explorer__nav--prev');
    var next = explorer.querySelector('.screenshot-explorer__nav--next');
    if (!img || !cards.length || !dotsWrap) return;

    var currentIndex = 0;

    cards.forEach(function (card, index) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'screenshot-explorer__dot' + (index === 0 ? ' is-active' : '');
      dot.setAttribute('aria-label', 'Show screenshot ' + (index + 1));
      dot.addEventListener('click', function () {
        select(index);
      });
      dotsWrap.appendChild(dot);
    });

    var dots = dotsWrap.querySelectorAll('.screenshot-explorer__dot');

    function select(index) {
      if (index < 0 || index >= cards.length || index === currentIndex) return;

      var card = cards[index];
      currentIndex = index;

      cards.forEach(function (item, i) {
        var active = i === index;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      dots.forEach(function (dot, i) {
        dot.classList.toggle('is-active', i === index);
      });

      var nextSrc = card.getAttribute('data-src');
      var nextAlt = card.getAttribute('data-alt') || '';
      if (!nextSrc) return;

      img.classList.add('is-fading');
      window.setTimeout(function () {
        img.src = nextSrc;
        img.alt = nextAlt;
        img.classList.remove('is-fading');
      }, 140);

      if (window.matchMedia('(min-width: 961px)').matches) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }

    cards.forEach(function (card, index) {
      card.addEventListener('click', function () {
        select(index);
      });
    });

    if (prev) {
      prev.addEventListener('click', function () {
        select((currentIndex - 1 + cards.length) % cards.length);
      });
    }

    if (next) {
      next.addEventListener('click', function () {
        select((currentIndex + 1) % cards.length);
      });
    }
  });
})();
