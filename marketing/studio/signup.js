import { getSession, signUpWithPassword } from '/js/studio-api.js';

const form = document.getElementById('signup-form');
const nameInput = document.getElementById('signup-name');
const emailInput = document.getElementById('signup-email');
const passwordInput = document.getElementById('signup-password');
const errorEl = document.getElementById('signup-error');
const successEl = document.getElementById('signup-success');
const submitBtn = document.getElementById('signup-submit');

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
    submitBtn.textContent = loading ? 'Creating account…' : 'Create account';
  }
}

try {
  const session = await getSession();
  if (session) {
    window.location.replace('/onboarding');
  }
} catch (_) {
  /* not configured yet — form will surface error */
}

if (form) {
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');
    showSuccess('');
    setLoading(true);

    try {
      const result = await signUpWithPassword(emailInput.value, passwordInput.value, {
        full_name: String(nameInput.value || '').trim(),
      });

      if (result.session) {
        window.location.href = '/onboarding';
        return;
      }

      showSuccess('Check your email to confirm your account, then log in.');
    } catch (err) {
      let msg = err && err.message ? err.message : 'Sign up failed';
      if (msg === 'not_configured') {
        msg = 'Sign-up is not configured on this environment yet.';
      }
      showError(msg);
    } finally {
      setLoading(false);
    }
  });
}
