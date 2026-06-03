(function () {
  document.querySelectorAll('[data-reels-carousel]').forEach(function (carousel) {
    var viewport = carousel.querySelector('.reels-carousel__viewport');
    var track = carousel.querySelector('.reels-carousel__track');
    var prev = carousel.querySelector('.reels-carousel__btn--prev');
    var next = carousel.querySelector('.reels-carousel__btn--next');
    if (!viewport || !track || !prev || !next) return;

    function slideWidth() {
      var slide = track.querySelector('.reels-carousel__slide');
      return slide ? slide.getBoundingClientRect().width : 320;
    }

    prev.addEventListener('click', function () {
      viewport.scrollBy({ left: -slideWidth(), behavior: 'smooth' });
    });

    next.addEventListener('click', function () {
      viewport.scrollBy({ left: slideWidth(), behavior: 'smooth' });
    });
  });
})();
