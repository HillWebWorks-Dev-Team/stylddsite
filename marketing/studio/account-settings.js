/**
 * Account settings UI — Part 8 (used by settings module).
 */
import { deleteAccount } from '/js/delete-account.js';
import { isPrivacyMode, setPrivacyMode } from '/js/privacy-mode.js';
import { manageSubscriptionUrl } from '/js/paywall-content.js';
import { subscriptionLabel } from '/js/studio-subscription.js';
import {
  changeUserEmail,
  changeUserPassword,
  loadAccountBundle,
  updateBrandNameInContent,
  updateOnboardingSurvey,
  updateProfileFields,
  uploadLogoImage,
} from '/js/studio-account-api.js';
import { signOut } from '/js/studio-api.js';

const BUSINESS_TYPES = [
  { value: 'stylist', label: 'Hairstylist / braider' },
  { value: 'barber', label: 'Barber' },
  { value: 'makeup', label: 'Makeup artist' },
  { value: 'lash', label: 'Lash tech' },
  { value: 'nails', label: 'Nail tech' },
  { value: 'other', label: 'Other beauty pro' },
];

let saveTimer = null;
let saveHint = '';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initials(name) {
  const parts = String(name || 'S').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || 'S').toUpperCase();
}

export function renderConnectedAccountsView(ctx, stripe) {
  const status = stripe?.status || 'not_started';
  const ready = status === 'ready';
  return (
    '<section class="studio-settings-section"><h3>Connected accounts</h3>' +
    '<p style="color:var(--white-muted);font-size:0.88rem;margin:0 0 1rem">Stripe Connect powers online deposits and payouts through Styld Pay.</p>' +
    '<div class="studio-settings-row">' +
    '<span class="studio-settings-pill">Stripe Connect: <strong>' +
    esc(ready ? 'Connected' : status.replace(/_/g, ' ')) +
    '</strong></span></div>' +
    '<div class="studio-settings-row" style="margin-top:0.85rem">' +
    '<a class="studio-btn studio-btn--primary" href="/studio/settings/payments">Open payments settings</a>' +
    (ready ? '<a class="studio-btn studio-btn--ghost" href="/studio/analytics/earnings">View earnings</a>' : '') +
    '</div></section>'
  );
}

export function renderAccountSettingsView(ctx, account, stripe) {
  const profile = account.profile || {};
  const onboarding = account.onboarding || {};
  const privacy = isPrivacyMode();
  const sub = ctx.subscription || {};
  const subscribed = sub.entitled === true;
  const manageUrl = subscribed ? manageSubscriptionUrl(sub) : null;
  const subscribeHref = subscribed ? manageUrl || '/studio/subscribe' : '/studio/subscribe';

  const typeOptions = BUSINESS_TYPES.map(function (t) {
    return (
      '<option value="' +
      esc(t.value) +
      '"' +
      (onboarding.business_type === t.value ? ' selected' : '') +
      '>' +
      esc(t.label) +
      '</option>'
    );
  }).join('');

  return (
    backHub() +
    '<section class="studio-settings-section"><h3>Subscription</h3>' +
    '<div class="studio-settings-row">' +
    '<span class="studio-settings-pill">Plan: <strong>' +
    esc(subscriptionLabel(sub)) +
    '</strong></span></div>' +
    '<div class="studio-settings-row" style="margin-top:0.75rem">' +
    '<a class="studio-btn studio-btn--primary" href="' +
    esc(subscribeHref) +
    '"' +
    (manageUrl ? ' target="_blank" rel="noopener noreferrer"' : '') +
    '>' +
    (subscribed ? 'Manage subscription' : 'Subscribe to Styld Pro') +
    '</a></div></section>' +
    '<section class="studio-settings-section"><h3>Business photo</h3>' +
    '<div class="studio-account-photo">' +
    (account.logoUrl
      ? '<img src="' + esc(account.logoUrl) + '" alt="Business logo">'
      : '<div class="studio-account-photo__placeholder">' + esc(initials(profile.business_name)) + '</div>') +
    '<div><label class="studio-btn studio-btn--ghost" style="cursor:pointer">Upload logo<input type="file" id="acct-logo" accept="image/*" hidden></label>' +
    '<p style="margin:0.35rem 0 0;font-size:0.78rem;color:var(--white-dim)">Shown on your booking site.</p></div></div></section>' +
    '<section class="studio-settings-section"><h3>Profile</h3>' +
    '<div class="studio-settings-grid">' +
    '<label>Business name<input class="studio-field" id="acct-business" value="' +
    esc(profile.business_name || '') +
    '"></label>' +
    '<label>Your name<input class="studio-field" id="acct-fullname" value="' +
    esc(profile.full_name || '') +
    '"></label>' +
    '<label>Business type<select class="studio-field" id="acct-type">' +
    typeOptions +
    '</select></label></div>' +
    '<p class="studio-account-save-hint' +
    (saveHint === 'Saving…' ? ' is-saving' : saveHint === 'Saved' ? ' is-saved' : '') +
    '" id="acct-save-hint">' +
    esc(saveHint || 'Changes save automatically.') +
    '</p></section>' +
    '<section class="studio-settings-section"><h3>Email</h3>' +
    '<p style="color:var(--white-muted);font-size:0.85rem;margin:0 0 0.65rem">Current: <strong>' +
    esc(profile.email || ctx.session.user.email) +
    '</strong></p>' +
    '<div class="studio-settings-grid">' +
    '<label>New email<input class="studio-field" type="email" id="acct-new-email" placeholder="new@email.com"></label></div>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="acct-change-email" style="margin-top:0.65rem">Send confirmation email</button></section>' +
    '<section class="studio-settings-section"><h3>Password</h3>' +
    '<div class="studio-settings-grid">' +
    '<label>New password<input class="studio-field" type="password" id="acct-password" minlength="8" autocomplete="new-password"></label>' +
    '<label>Confirm password<input class="studio-field" type="password" id="acct-password2" minlength="8" autocomplete="new-password"></label></div>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="acct-change-password" style="margin-top:0.65rem">Update password</button></section>' +
    '<section class="studio-settings-section"><h3>Privacy</h3>' +
    '<label style="display:flex;align-items:center;gap:0.65rem;cursor:pointer">' +
    '<input type="checkbox" id="acct-privacy"' +
    (privacy ? ' checked' : '') +
    '> Hide dollar amounts in analytics and earnings</label></section>' +
    '<section class="studio-settings-section"><h3>Session</h3>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="acct-signout">Sign out</button></section>' +
    '<section class="studio-account-danger"><h3>Danger zone</h3>' +
    '<p>Permanently deletes your auth account, site data, and studio access. Cancel App Store or web billing separately before deleting.</p>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="acct-delete" style="border-color:rgba(239,68,68,0.5);color:#fca5a5">Delete account</button></section>'
  );
}

function backHub() {
  return '<a class="studio-back-link" href="/studio/settings">← Settings</a>';
}

function scheduleProfileSave(ctxRef, accountRef, getValues) {
  if (saveTimer) clearTimeout(saveTimer);
  saveHint = '';
  saveTimer = setTimeout(function () {
    saveHint = 'Saving…';
    const values = getValues();
    Promise.all([
      updateProfileFields(ctxRef.session.user.id, {
        business_name: values.businessName,
        full_name: values.fullName,
      }),
      updateBrandNameInContent(ctxRef.session.user.id, values.businessName),
      updateOnboardingSurvey(ctxRef.session.user.id, { business_type: values.businessType }),
    ])
      .then(function () {
        if (accountRef.profile) {
          accountRef.profile.business_name = values.businessName;
          accountRef.profile.full_name = values.fullName;
        }
        saveHint = 'Saved';
      })
      .catch(function () {
        saveHint = 'Save failed';
      })
      .finally(function () {
        const hint = document.getElementById('acct-save-hint');
        if (hint) {
          hint.textContent = saveHint;
          hint.className =
            'studio-account-save-hint' +
            (saveHint === 'Saving…' ? ' is-saving' : saveHint === 'Saved' ? ' is-saved' : '');
        }
      });
  }, 1200);
}

export function bindAccountSettingsEvents(ctxRef, accountRef, paintFn) {
  const getValues = function () {
    return {
      businessName: document.getElementById('acct-business')?.value || '',
      fullName: document.getElementById('acct-fullname')?.value || '',
      businessType: document.getElementById('acct-type')?.value || '',
    };
  };

  ['acct-business', 'acct-fullname', 'acct-type'].forEach(function (id) {
    document.getElementById(id)?.addEventListener('input', function () {
      scheduleProfileSave(ctxRef, accountRef, getValues);
    });
    document.getElementById(id)?.addEventListener('change', function () {
      scheduleProfileSave(ctxRef, accountRef, getValues);
    });
  });

  document.getElementById('acct-logo')?.addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    uploadLogoImage(ctxRef.session.user.id, file)
      .then(function (res) {
        accountRef.logoUrl = res.url;
        paintFn();
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Upload failed.');
      });
  });

  document.getElementById('acct-change-email')?.addEventListener('click', function () {
    const email = document.getElementById('acct-new-email')?.value || '';
    if (!email) {
      window.alert('Enter a new email address.');
      return;
    }
    changeUserEmail(email)
      .then(function () {
        window.alert('Check your inbox to confirm the new email address.');
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not update email.');
      });
  });

  document.getElementById('acct-change-password')?.addEventListener('click', function () {
    const p1 = document.getElementById('acct-password')?.value || '';
    const p2 = document.getElementById('acct-password2')?.value || '';
    if (p1.length < 8) {
      window.alert('Password must be at least 8 characters.');
      return;
    }
    if (p1 !== p2) {
      window.alert('Passwords do not match.');
      return;
    }
    changeUserPassword(p1)
      .then(function () {
        window.alert('Password updated.');
        document.getElementById('acct-password').value = '';
        document.getElementById('acct-password2').value = '';
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not update password.');
      });
  });

  document.getElementById('acct-privacy')?.addEventListener('change', function (e) {
    setPrivacyMode(!!e.target.checked);
  });

  document.getElementById('acct-signout')?.addEventListener('click', function () {
    signOut().finally(function () {
      window.location.href = '/login';
    });
  });

  document.getElementById('acct-delete')?.addEventListener('click', function () {
    const typed = window.prompt('Type DELETE to permanently remove your account.');
    if (typed !== 'DELETE') return;
    if (!window.confirm('This cannot be undone. Delete your account now?')) return;
    deleteAccount()
      .then(function () {
        window.location.href = '/login?deleted=1';
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Delete failed.');
      });
  });
}

export async function loadAccountSettingsData(userId) {
  return loadAccountBundle(userId);
}
