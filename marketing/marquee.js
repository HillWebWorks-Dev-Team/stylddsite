(function () {
  var track = document.querySelector('.marquee-track');
  if (!track) return;

  var SPEED = 72;
  var resizeTimer;

  function rebuild() {
    var seed = track.querySelector('.marquee-group');
    if (!seed) return;

    var fragment = document.createDocumentFragment();
    fragment.appendChild(seed.cloneNode(true));
    fragment.appendChild(seed.cloneNode(true));
    track.replaceChildren(fragment);

    var one = track.children[0];
    while (track.scrollWidth - one.offsetWidth < window.innerWidth) {
      track.appendChild(one.cloneNode(true));
    }

    var loop = one.offsetWidth;
    track.style.setProperty('--marquee-loop', loop + 'px');
    track.style.animationDuration = loop / SPEED + 's';
  }

  rebuild();

  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 150);
  });
})();
