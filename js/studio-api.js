/**
 * Styld Web Studio — Supabase helpers (Part 1 foundation).
 */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { settingValue } from './studio-access.js';
import {
  computeAccessPhase,
  fetchSubscriptionStatus,
  canUserPublish,
  syncSubscriptionSite,
  clearSubscriptionCache,
} from './studio-subscription.js';

const LEGACY_SESSION_KEY = 'styld_pro_session';

let clientPromise = null;

export function marketingCfg() {
  return window.__STYLD_MARKETING__ || {};
}

export async function getStudioClient() {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const cfg = marketingCfg();
    const url = String(cfg.supabaseUrl || '').replace(/\/$/, '');
    const key = cfg.supabaseAnonKey || '';
    if (!url || !key) throw new Error('not_configured');

    const client = createClient(url, key, {
      auth: {
        persistSession: true,
        storageKey: 'styld_studio_auth',
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    await bridgeLegacySession(client);
    syncLegacySessionFromSupabase(client);
    client.auth.onAuthStateChange(function (_event, session) {
      if (session) {
        persistLegacySession(session);
      } else {
        localStorage.removeItem(LEGACY_SESSION_KEY);
      }
    });

    return client;
  })();

  return clientPromise;
}

function persistLegacySession(session) {
  if (!session) return;
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + 3600,
    user: session.user,
  };
  localStorage.setItem(LEGACY_SESSION_KEY, JSON.stringify(payload));
}

async function bridgeLegacySession(client) {
  const { data: { session } } = await client.auth.getSession();
  if (session) return;

  try {
    const raw = localStorage.getItem(LEGACY_SESSION_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw);
    if (!legacy.access_token || !legacy.refresh_token) return;
    await client.auth.setSession({
      access_token: legacy.access_token,
      refresh_token: legacy.refresh_token,
    });
  } catch (_) {
    /* ignore corrupt legacy session */
  }
}

async function syncLegacySessionFromSupabase(client) {
  const { data: { session } } = await client.auth.getSession();
  if (session) persistLegacySession(session);
}

export async function getSession() {
  const client = await getStudioClient();
  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  return session;
}

export async function requireSession(loginPath) {
  loginPath = loginPath || '/login';
  const session = await getSession();
  if (session) return session;
  const next = window.location.pathname + window.location.search;
  window.location.href = loginPath + '?next=' + encodeURIComponent(next);
  throw new Error('redirecting');
}

export async function signInWithPassword(email, password) {
  const client = await getStudioClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: password || '',
  });
  if (error) throw error;
  persistLegacySession(data.session);
  return data.session;
}

export async function signUpWithPassword(email, password, metadata) {
  const client = await getStudioClient();
  const { data, error } = await client.auth.signUp({
    email: String(email || '').trim(),
    password: password || '',
    options: { data: metadata || {} },
  });
  if (error) throw error;
  if (data.session) persistLegacySession(data.session);
  return data;
}

export async function signInWithApple() {
  const client = await getStudioClient();
  const redirectTo = window.location.origin + '/studio/dashboard';
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const client = await getStudioClient();
  localStorage.removeItem(LEGACY_SESSION_KEY);
  await client.auth.signOut();
}

export async function requestPasswordReset(email) {
  const client = await getStudioClient();
  const redirectTo = window.location.origin + '/login';
  const { error } = await client.auth.resetPasswordForEmail(String(email || '').trim(), {
    redirectTo,
  });
  if (error) throw error;
}

export async function invokeFunction(name, body) {
  const { invokeEdgeFunction } = await import('./studio-http.js');
  return invokeEdgeFunction(name, body, { timeoutMs: 15000 });
}

export async function getProfile(userId) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('profiles')
    .select('id,email,full_name,business_name,avatar_url,created_at,updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSubdomainRow(userId) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_subdomains')
    .select('subdomain,published_at,user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadSiteSetting(userId, recordKey) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_records')
    .select('id,data,record_key,updated_at')
    .eq('user_id', userId)
    .eq('record_type', 'site_setting')
    .eq('record_key', recordKey)
    .maybeSingle();
  if (error) throw error;
  return settingValue(data);
}

export async function saveSiteSetting(userId, recordKey, value) {
  const client = await getStudioClient();
  const { data: existing, error: findError } = await client
    .from('styld_site_records')
    .select('id')
    .eq('user_id', userId)
    .eq('record_type', 'site_setting')
    .eq('record_key', recordKey)
    .maybeSingle();
  if (findError) throw findError;

  const row = {
    user_id: userId,
    record_type: 'site_setting',
    record_key: recordKey,
    data: { value: value },
  };

  if (existing && existing.id) {
    const { error } = await client.from('styld_site_records').update({ data: row.data }).eq('id', existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from('styld_site_records').insert(row);
  if (error) throw error;
}

export async function loadSiteSettings(userId, keys) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_records')
    .select('record_key,data')
    .eq('user_id', userId)
    .eq('record_type', 'site_setting')
    .in('record_key', keys);
  if (error) throw error;

  const out = {};
  (data || []).forEach(function (row) {
    out[row.record_key] = settingValue(row);
  });
  return out;
}

export async function getSubscriptionStatus(options) {
  return fetchSubscriptionStatus(options);
}

export { fetchSubscriptionStatus, canUserPublish, syncSubscriptionSite, isSubscribed, subscriptionLabel } from './studio-subscription.js';
export { computeAccessPhase } from './studio-subscription.js';

export async function bootstrapStudio() {
  const session = await getSession();
  if (!session || !session.user) throw new Error('not_authenticated');

  const userId = session.user.id;
  const cfg = marketingCfg();

  const [profile, subdomain, settings, subscription] = await Promise.all([
    getProfile(userId),
    getSubdomainRow(userId),
    loadSiteSettings(userId, ['onboarding_state', 'site_publish']),
    getSubscriptionStatus(),
  ]);

  const onboardingState = settings.onboarding_state || {};
  const sitePublish = settings.site_publish || {};
  const publishedAt = subdomain?.published_at || sitePublish.publishedAt || sitePublish.published_at || null;

  const accessPhase = computeAccessPhase({
    session,
    onboardingState,
    onboardingDone: !!onboardingState.completed,
    sitePublish,
    subdomain,
    subscription,
  });

  return {
    session,
    profile,
    subdomain: subdomain || null,
    onboardingState,
    sitePublish,
    publishedAt,
    subscription,
    accessPhase,
    rootDomain: cfg.rootDomain || 'styldd.com',
  };
}

export async function loadBookings(userId, limit) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_records')
    .select('id,data,created_at,updated_at')
    .eq('user_id', userId)
    .eq('record_type', 'booking')
    .order('created_at', { ascending: false })
    .limit(limit || 50);
  if (error) throw error;
  return data || [];
}

export function publicMediaUrl(storagePath) {
  const path = String(storagePath || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const cfg = marketingCfg();
  if (!cfg.supabaseUrl) return '';
  return cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + path.replace(/^\/+/, '');
}

export async function loadStyleCovers(userId) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_records')
    .select('record_key,data')
    .eq('user_id', userId)
    .eq('record_type', 'style_cover_image');
  if (error) throw error;
  const covers = {};
  (data || []).forEach(function (row) {
    const val = settingValue(row);
    const path =
      val && typeof val === 'object'
        ? val.storagePath || val.storage_path
        : typeof val === 'string'
          ? val
          : null;
    if (path && row.record_key) covers[row.record_key] = path;
  });
  return covers;
}

function buildCatalogCards(meta, prices, covers, logoImagePath) {
  const styleIds = {};
  Object.keys(meta || {}).forEach(function (id) {
    styleIds[id] = true;
  });
  Object.keys(prices || {}).forEach(function (id) {
    styleIds[id] = true;
  });
  Object.keys(covers || {}).forEach(function (id) {
    styleIds[id] = true;
  });

  const logoFallback = publicMediaUrl(logoImagePath);
  return Object.keys(styleIds).map(function (styleId) {
    const item = (meta || {})[styleId] || {};
    const base = typeof prices[styleId] === 'number' ? prices[styleId] : Number(prices[styleId]) || 0;
    const priceLabel = base > 0 ? '$' + Math.round(base) : 'Price TBD';
    return {
      id: styleId,
      title: item.title || styleId,
      priceLabel: priceLabel,
      imageUrl: publicMediaUrl(covers[styleId]) || logoFallback,
    };
  });
}

export async function ensureUserSiteSeeded(userId, profile) {
  const existing = await loadSiteSettings(userId, ['site_content', 'site_theme']);
  const { defaultSiteContent, defaultSiteTheme, normalizeSiteContent, normalizeSiteTheme } = await import(
    './site-normalize.js'
  );

  let content = existing.site_content ? normalizeSiteContent(existing.site_content) : null;
  let theme = existing.site_theme ? normalizeSiteTheme(existing.site_theme) : null;

  if (!content) {
    content = defaultSiteContent(profile);
    await saveSiteSetting(userId, 'site_content', content);
  }
  if (!theme) {
    theme = defaultSiteTheme();
    await saveSiteSetting(userId, 'site_theme', theme);
  }
  return { content, theme };
}

export async function loadSiteEditorState(userId) {
  const profile = await getProfile(userId);
  await ensureUserSiteSeeded(userId, profile);

  const settings = await loadSiteSettings(userId, [
    'site_content',
    'site_theme',
    'site_publish',
    'products_catalog',
    'style_catalog_meta',
    'style_price_overrides',
  ]);

  const { normalizeSiteContent, normalizeSiteTheme, normalizeSiteProducts } = await import('./site-normalize.js');

  const subdomain = await getSubdomainRow(userId);
  const covers = await loadStyleCovers(userId);
  const content = normalizeSiteContent(settings.site_content);
  const theme = normalizeSiteTheme(settings.site_theme);
  const products = normalizeSiteProducts(settings.products_catalog);
  const styles = buildCatalogCards(
    settings.style_catalog_meta || {},
    settings.style_price_overrides || {},
    covers,
    theme.logoImagePath,
  );

  return {
    profile,
    subdomain,
    sitePublish: settings.site_publish || {},
    content,
    theme,
    products,
    styles,
    covers,
    styleMeta: settings.style_catalog_meta || {},
    stylePrices: settings.style_price_overrides || {},
  };
}

export async function uploadToStyleCovers(userId, folder, file) {
  const client = await getStudioClient();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = userId + '/' + folder + '/' + Date.now() + '.' + ext;
  const { error } = await client.storage.from('style-covers').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (error) throw error;
  return path;
}

export async function verifySubscriptionForPublish() {
  await canUserPublish();
  return true;
}

export async function publishSiteSubdomain(userId, slug, businessName) {
  const cfg = marketingCfg();
  const rootDomain = cfg.rootDomain || 'styldd.com';
  const normalized = (await import('./subdomain-utils.js')).normalizeSubdomain(slug);
  const { checkSubdomainAvailability } = await import('./subdomain-utils.js');

  await verifySubscriptionForPublish();

  const existing = await getSubdomainRow(userId);
  if (normalized !== (existing?.subdomain || '')) {
    const check = await checkSubdomainAvailability(normalized, cfg, userId);
    if (check.state !== 'available' && check.state !== 'yours') {
      throw new Error(check.state === 'taken' ? 'subdomain_taken' : 'subdomain_invalid');
    }
  }

  const now = new Date().toISOString();
  const client = await getStudioClient();
  const publicUrl = 'https://' + normalized + '.' + rootDomain;

  if (existing) {
    const { error } = await client
      .from('styld_site_subdomains')
      .update({ subdomain: normalized, published_at: now })
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await client.from('styld_site_subdomains').insert({
      user_id: userId,
      subdomain: normalized,
      published_at: now,
    });
    if (error) throw error;
  }

  await saveSiteSetting(userId, 'site_publish', {
    subdomain: normalized,
    published: true,
    publishedAt: now,
    publicUrl: publicUrl,
  });

  try {
    await client.from('styld_user_sites').upsert({
      user_id: userId,
      subdomain: normalized,
      published_at: now,
    });
  } catch (_) {
    /* registry optional if RLS differs */
  }

  try {
    await invokeFunction('vercel-redeploy', { subdomain: normalized });
  } catch (_) {
    /* redeploy optional in dev */
  }

  try {
    await syncSubscriptionSite();
  } catch (_) {
    /* sync optional */
  }

  clearSubscriptionCache();

  return { subdomain: normalized, publishedAt: now, publicUrl: publicUrl };
}
