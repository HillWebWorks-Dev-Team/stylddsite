(function () {
  var orbit = document.getElementById('hero-orbit');
  if (!orbit) return;

  var scene = orbit.querySelector('.hero-scene');
  var layers = orbit.querySelectorAll('.parallax-layer');
  if (!scene || !layers.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.matchMedia('(min-width: 961px)').matches) return;

  var maxTilt = 11;

  function setTilt(x, y) {
    layers.forEach(function (layer) {
      var depth = parseFloat(layer.dataset.depth) || 1;
      var rotateY = x * maxTilt * depth;
      var rotateX = -y * maxTilt * depth * 0.75;
      layer.style.setProperty('--tilt-x', rotateX + 'deg');
      layer.style.setProperty('--tilt-y', rotateY + 'deg');
    });
  }

  function resetTilt() {
    layers.forEach(function (layer) {
      layer.style.setProperty('--tilt-x', '0deg');
      layer.style.setProperty('--tilt-y', '0deg');
    });
  }

  orbit.addEventListener('mousemove', function (e) {
    var rect = orbit.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width - 0.5;
    var y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt(x, y);
  });

  orbit.addEventListener('mouseleave', resetTilt);

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!window.matchMedia('(min-width: 961px)').matches) {
        resetTilt();
      }
    }, 150);
  });
})();
