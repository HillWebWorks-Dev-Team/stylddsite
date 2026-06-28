(function () {
  var form = document.getElementById('login-form');
  var emailInput = document.getElementById('login-email');
  var passwordInput = document.getElementById('login-password');
  var errorEl = document.getElementById('login-error');
  var successEl = document.getElementById('login-success');
  var submitBtn = document.getElementById('login-submit');
  var forgotBtn = document.getElementById('forgot-password');

  function nextPath() {
    var params = new URLSearchParams(window.location.search);
    var next = params.get('next') || '/studio';
    if (!next.startsWith('/') || next.startsWith('//')) return '/studio';
    return next;
  }

  function showError(msg) {
    if (successEl) successEl.hidden = true;
    if (!errorEl) return;
    errorEl.textContent = msg || 'Something went wrong.';
    errorEl.hidden = !msg;
  }

  function showSuccess(msg) {
    if (errorEl) errorEl.hidden = true;
    if (!successEl) return;
    successEl.textContent = msg || '';
    successEl.hidden = !msg;
  }

  function setLoading(loading) {
    if (submitBtn) {
      submitBtn.disabled = loading;
      submitBtn.textContent = loading ? 'Signing in…' : 'Log in';
    }
  }

  if (window.StyldMarketingAuth && window.StyldMarketingAuth.getSession()) {
    window.location.replace(nextPath());
    return;
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showError('');
      showSuccess('');
      setLoading(true);

      window.StyldMarketingAuth.signInWithPassword(emailInput.value, passwordInput.value)
        .then(function () {
          window.location.href = nextPath();
        })
        .catch(function (err) {
          var msg = err && err.message ? err.message : 'Sign in failed';
          if (msg === 'not_configured') {
            msg = 'Sign-in is not configured on this environment yet.';
          }
          showError(msg);
        })
        .finally(function () {
          setLoading(false);
        });
    });
  }

  if (forgotBtn) {
    forgotBtn.addEventListener('click', function () {
      showError('');
      var email = String(emailInput && emailInput.value ? emailInput.value : '').trim();
      if (!email) {
        showError('Enter your email above, then tap Forgot password.');
        if (emailInput) emailInput.focus();
        return;
      }
      forgotBtn.disabled = true;
      window.StyldMarketingAuth.requestPasswordReset(email)
        .then(function () {
          showSuccess('Check your inbox for a password reset link.');
        })
        .catch(function (err) {
          showError((err && err.message) || 'Could not send reset email.');
        })
        .finally(function () {
          forgotBtn.disabled = false;
        });
    });
  }
})();
