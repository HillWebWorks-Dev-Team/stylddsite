/**
 * Account settings API helpers (Part 8).
 */
import { getStudioClient, loadSiteSetting, saveSiteSetting, uploadToStyleCovers, publicMediaUrl } from './studio-api.js';
import { settingValue } from './studio-access.js';

export async function updateProfileFields(userId, fields) {
  const client = await getStudioClient();
  const payload = { updated_at: new Date().toISOString() };
  if (fields.full_name != null) payload.full_name = String(fields.full_name).trim();
  if (fields.business_name != null) payload.business_name = String(fields.business_name).trim();
  const { error } = await client.from('profiles').update(payload).eq('id', userId);
  if (error) throw error;
  return payload;
}

export async function updateBrandNameInContent(userId, brandName) {
  const content = (await loadSiteSetting(userId, 'site_content')) || {};
  const next = { ...content, brandName: String(brandName || '').trim() };
  await saveSiteSetting(userId, 'site_content', next);
  return next;
}

export async function updateOnboardingSurvey(userId, patch) {
  const current = (await loadSiteSetting(userId, 'onboarding_state')) || {};
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await saveSiteSetting(userId, 'onboarding_state', next);
  return next;
}

export async function uploadLogoImage(userId, file) {
  const path = await uploadToStyleCovers(userId, 'logo', file);
  const theme = (await loadSiteSetting(userId, 'site_theme')) || {};
  const next = { ...theme, logoImagePath: path };
  await saveSiteSetting(userId, 'site_theme', next);
  return { path: path, url: publicMediaUrl(path) };
}

export async function loadAccountBundle(userId) {
  const client = await getStudioClient();
  const [profileRes, settingsRows] = await Promise.all([
    client
      .from('profiles')
      .select('id,email,full_name,business_name,avatar_url')
      .eq('id', userId)
      .maybeSingle(),
    client
      .from('styld_site_records')
      .select('record_key,data')
      .eq('user_id', userId)
      .eq('record_type', 'site_setting')
      .in('record_key', ['onboarding_state', 'site_theme', 'site_content']),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (settingsRows.error) throw settingsRows.error;

  const settings = {};
  (settingsRows.data || []).forEach(function (row) {
    settings[row.record_key] = settingValue(row);
  });

  const theme = settings.site_theme || {};
  return {
    profile: profileRes.data,
    onboarding: settings.onboarding_state || {},
    logoUrl: publicMediaUrl(theme.logoImagePath),
    logoPath: theme.logoImagePath || null,
  };
}

export async function changeUserEmail(newEmail) {
  const client = await getStudioClient();
  const { data, error } = await client.auth.updateUser({ email: String(newEmail || '').trim() });
  if (error) throw error;
  return data.user;
}

export async function changeUserPassword(password) {
  const client = await getStudioClient();
  const { data, error } = await client.auth.updateUser({ password: password || '' });
  if (error) throw error;
  return data.user;
}
