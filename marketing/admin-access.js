(function () {
  var overlay = document.getElementById('admin-pin-overlay');
  var form = document.getElementById('admin-pin-form');
  var input = document.getElementById('admin-pin-input');
  var errorEl = document.getElementById('admin-pin-error');
  var openBtn = document.getElementById('footer-admin-btn');
  var cancelBtn = document.getElementById('admin-pin-cancel');

  if (!overlay || !openBtn) return;

  function openModal() {
    overlay.hidden = false;
    overlay.classList.remove('is-shake');
    if (errorEl) errorEl.textContent = '';
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function closeModal() {
    overlay.hidden = true;
  }

  function shake(msg) {
    overlay.classList.remove('is-shake');
    void overlay.offsetWidth;
    overlay.classList.add('is-shake');
    if (errorEl) errorEl.textContent = msg || 'Incorrect PIN';
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  openBtn.addEventListener('click', openModal);

  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = (input && input.value) || '';
      if (pin !== '0000') {
        shake('Incorrect PIN');
        return;
      }
      if (window.StyldAdmin && window.StyldAdmin.savePin) {
        window.StyldAdmin.savePin(pin);
      } else {
        try {
          sessionStorage.setItem('styld_admin_pin', pin);
        } catch (err) {}
      }
      window.location.href = '/marketing/admin.html';
    });
  }

  var params = new URLSearchParams(window.location.search);
  if (params.get('admin') === 'denied') {
    openModal();
    shake('Session expired — enter PIN again');
  } else if (params.get('admin') === 'required') {
    openModal();
  }
})();
