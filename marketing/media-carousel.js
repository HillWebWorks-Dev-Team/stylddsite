(function () {
  document.querySelectorAll('[data-media-carousel]').forEach(function (carousel) {
    var viewport = carousel.querySelector('.media-carousel__viewport');
    var track = viewport && viewport.querySelector('.media-carousel__track');
    var prev = carousel.querySelector('.media-carousel__btn--prev');
    var next = carousel.querySelector('.media-carousel__btn--next');
    if (!viewport || !track || !prev || !next) return;

    function slideWidth() {
      var item = track.children[0];
      if (!item) return 300;
      var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 16;
      return item.getBoundingClientRect().width + gap;
    }

    prev.addEventListener('click', function () {
      viewport.scrollBy({ left: -slideWidth(), behavior: 'smooth' });
    });

    next.addEventListener('click', function () {
      viewport.scrollBy({ left: slideWidth(), behavior: 'smooth' });
    });
  });
})();
