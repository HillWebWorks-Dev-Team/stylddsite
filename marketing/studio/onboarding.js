import {
  bootstrapStudio,
  getSession,
  requireSession,
  saveSiteSetting,
} from '/js/studio-api.js';

const form = document.getElementById('onboarding-form');
const businessInput = document.getElementById('onboarding-business');
const typeInput = document.getElementById('onboarding-type');
const errorEl = document.getElementById('onboarding-error');
const submitBtn = document.getElementById('onboarding-submit');

function showError(msg) {
  if (!errorEl) return;
  errorEl.textContent = msg || 'Something went wrong.';
  errorEl.hidden = !msg;
}

function setLoading(loading) {
  if (submitBtn) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Saving…' : 'Continue to studio';
  }
}

async function guardRoute() {
  await requireSession('/login?next=/onboarding');
  try {
    const ctx = await bootstrapStudio();
    if (ctx.accessPhase !== 'account_onboarding') {
      window.location.replace('/studio/dashboard');
    }
    if (ctx.profile?.business_name && businessInput) {
      businessInput.value = ctx.profile.business_name;
    }
  } catch (err) {
    if (String(err && err.message) === 'redirecting') return;
    showError(err && err.message ? err.message : 'Could not load onboarding.');
  }
}

await guardRoute();

if (form) {
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    showError('');
    setLoading(true);

    try {
      const session = await getSession();
      if (!session) throw new Error('not_authenticated');
      const userId = session.user.id;
      const businessName = String(businessInput.value || '').trim();
      const businessType = String(typeInput.value || '').trim();

      if (!businessName || !businessType) {
        showError('Please fill in all fields.');
        return;
      }

      await saveSiteSetting(userId, 'onboarding_state', {
        completed: true,
        completed_at: new Date().toISOString(),
        source: 'web_studio',
      });

      await saveSiteSetting(userId, 'onboarding_responses', {
        business_name: businessName,
        business_type: businessType,
        completed_at: new Date().toISOString(),
      });

      window.location.href = '/studio/website/edit';
    } catch (err) {
      showError(err && err.message ? err.message : 'Could not save onboarding.');
    } finally {
      setLoading(false);
    }
  });
}
