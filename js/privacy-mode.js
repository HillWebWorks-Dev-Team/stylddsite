/**
 * Privacy mode — masks money amounts in Web Studio (mirrors mobile PrivacyContext).
 */
const STORAGE_KEY = '@styld/privacy_mode';

export function isPrivacyMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

export function setPrivacyMode(enabled) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {}
}

export function togglePrivacyMode() {
  const next = !isPrivacyMode();
  setPrivacyMode(next);
  return next;
}

export function maskMoney(value, privacyEnabled) {
  if (privacyEnabled !== false && (privacyEnabled === true || isPrivacyMode())) {
    return '••••';
  }
  if (value == null || value === '' || isNaN(Number(value))) return '$0';
  return (
    '$' +
    Number(value).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  );
}
