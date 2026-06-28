/** Business settings data models — Part 6. */
import { loadSiteSetting, loadSiteSettings, saveSiteSetting, getStudioClient, loadStyleCovers, uploadToStyleCovers } from './studio-api.js';
import { DEFAULT_BOOKING_HOURS, normalizeBookingHours } from './booking-hours.js';
import { buildSiteServices } from './service-catalog.js';
import { normalizeSiteContent, normalizeSiteTheme, normalizeSiteProducts } from './site-normalize.js';

export const DEFAULT_BOOKING_PAYMENT = {
  mode: 'in_person',
  depositKind: 'percent',
  depositValue: 50,
  depositIncludedInPrice: true,
  requireCurrentHairPhoto: true,
  requireReferencePhoto: false,
  onlinePaymentsEnabled: false,
  requireBookingApproval: false,
};

export const CANCELLATION_PRESETS = {
  '7_days': { fullRefundNoticeHours: 168, refundAppliesTo: 'deposit', label: '7 days notice' },
  '24_hours': { fullRefundNoticeHours: 24, refundAppliesTo: 'deposit', label: '24 hours notice' },
  custom: { fullRefundNoticeHours: 48, refundAppliesTo: 'deposit', label: 'Custom' },
};

export const DEFAULT_PRODUCTS_SETTINGS = {
  allowPickup: true,
  allowShipping: false,
  shippingFlatRate: 0,
  pickupInstructions: '',
  shippingNote: '',
  defaultFulfillment: 'pickup',
};

export function normalizeBookingPayment(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const mode = ['full', 'deposit', 'in_person'].indexOf(raw.mode) !== -1 ? raw.mode : 'in_person';
  return {
    mode: mode,
    depositKind: raw.depositKind === 'fixed' || raw.deposit_kind === 'fixed' ? 'fixed' : 'percent',
    depositValue:
      raw.depositValue != null
        ? Number(raw.depositValue)
        : raw.deposit_value != null
          ? Number(raw.deposit_value)
          : 50,
    depositIncludedInPrice: raw.depositIncludedInPrice !== false && raw.deposit_included_in_price !== false,
    requireCurrentHairPhoto:
      raw.requireCurrentHairPhoto != null
        ? !!raw.requireCurrentHairPhoto
        : raw.require_current_hair_photo != null
          ? !!raw.require_current_hair_photo
          : true,
    requireReferencePhoto: !!(raw.requireReferencePhoto || raw.require_reference_photo),
    onlinePaymentsEnabled: !!(raw.onlinePaymentsEnabled || raw.online_payments_enabled),
    requireBookingApproval: !!(raw.requireBookingApproval || raw.require_booking_approval),
  };
}

export function bookingPaymentToSave(payment) {
  const p = normalizeBookingPayment(payment);
  const online = p.mode === 'deposit' || p.mode === 'full';
  return Object.assign({}, p, { onlinePaymentsEnabled: online });
}

export function normalizeCancellationPolicy(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const preset = ['7_days', '24_hours', 'custom'].indexOf(raw.preset) !== -1 ? raw.preset : '24_hours';
  const base = CANCELLATION_PRESETS[preset] || CANCELLATION_PRESETS['24_hours'];
  const hours =
    raw.fullRefundNoticeHours != null
      ? Number(raw.fullRefundNoticeHours)
      : raw.full_refund_notice_hours != null
        ? Number(raw.full_refund_notice_hours)
        : base.fullRefundNoticeHours;
  const applies = raw.refundAppliesTo || raw.refund_applies_to || base.refundAppliesTo;
  const policy = {
    preset: preset,
    fullRefundNoticeHours: hours,
    refundAppliesTo: ['deposit', 'full', 'both', 'none'].indexOf(applies) !== -1 ? applies : 'deposit',
    policySummary: String(raw.policySummary || raw.policy_summary || '').trim(),
  };
  if (!policy.policySummary) policy.policySummary = buildPolicySummary(policy);
  return policy;
}

export function buildPolicySummary(policy) {
  policy = normalizeCancellationPolicy(policy);
  const window =
    policy.fullRefundNoticeHours >= 168
      ? Math.round(policy.fullRefundNoticeHours / 24) + ' days'
      : policy.fullRefundNoticeHours + ' hours';
  const applies = String(policy.refundAppliesTo).replace(/_/g, ' ');
  return 'Full refund when cancelled at least ' + window + ' before the appointment. Refund applies to: ' + applies + '.';
}

export function normalizePromoCodes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(function (p) {
      if (!p || typeof p !== 'object') return null;
      const code = String(p.code || '').trim().toUpperCase();
      if (!code) return null;
      return {
        id: String(p.id || crypto.randomUUID()),
        code: code,
        label: String(p.label || code).trim(),
        discountKind: p.discountKind === 'fixed' || p.kind === 'fixed' ? 'fixed' : 'percent',
        discountValue: Number(p.discountValue != null ? p.discountValue : p.value) || 0,
        enabled: p.enabled !== false,
        expiresAt: p.expiresAt || p.expires_at || null,
        maxUses: p.maxUses != null ? Number(p.maxUses) : p.max_uses != null ? Number(p.max_uses) : null,
      };
    })
    .filter(Boolean);
}

export function normalizeProductsSettings(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    allowPickup: raw.allowPickup !== false,
    allowShipping: !!raw.allowShipping,
    shippingFlatRate: Number(raw.shippingFlatRate) || 0,
    pickupInstructions: String(raw.pickupInstructions || '').trim(),
    shippingNote: String(raw.shippingNote || '').trim(),
    defaultFulfillment: raw.defaultFulfillment === 'shipping' ? 'shipping' : 'pickup',
  };
}

export function normalizeReviewsSettings(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return { enabled: raw.enabled !== false };
}

export async function loadSettingsBundle(userId) {
  const keys = [
    'booking_payment',
    'cancellation_policy',
    'booking_promo_codes',
    'booking_hours',
    'style_catalog_meta',
    'style_price_overrides',
    'reviews_settings',
    'products_catalog',
    'products_settings',
    'site_content',
    'site_theme',
  ];
  const [settings, covers] = await Promise.all([loadSiteSettings(userId, keys), loadStyleCovers(userId)]);

  return {
    bookingPayment: normalizeBookingPayment(settings.booking_payment),
    cancellationPolicy: normalizeCancellationPolicy(settings.cancellation_policy),
    promoCodes: normalizePromoCodes(settings.booking_promo_codes),
    bookingHours: normalizeBookingHours(settings.booking_hours || DEFAULT_BOOKING_HOURS),
    styleMeta: settings.style_catalog_meta || {},
    stylePrices: settings.style_price_overrides || {},
    reviewsSettings: normalizeReviewsSettings(settings.reviews_settings),
    products: normalizeSiteProducts(settings.products_catalog),
    productsSettings: normalizeProductsSettings(settings.products_settings || DEFAULT_PRODUCTS_SETTINGS),
    siteContent: normalizeSiteContent(settings.site_content),
    siteTheme: normalizeSiteTheme(settings.site_theme),
    covers: covers,
    catalog: buildSiteServices(settings.style_catalog_meta, settings.style_price_overrides, covers),
  };
}

export async function saveBookingPayment(userId, payment) {
  await saveSiteSetting(userId, 'booking_payment', bookingPaymentToSave(payment));
}

export async function saveCancellationPolicy(userId, policy) {
  const normalized = normalizeCancellationPolicy(policy);
  await saveSiteSetting(userId, 'cancellation_policy', normalized);
}

export async function savePromoCodes(userId, codes) {
  await saveSiteSetting(userId, 'booking_promo_codes', normalizePromoCodes(codes));
}

export async function saveBookingHoursSetting(userId, hours) {
  await saveSiteSetting(userId, 'booking_hours', normalizeBookingHours(hours));
}

export async function saveStyleCatalog(userId, meta, prices) {
  await Promise.all([
    saveSiteSetting(userId, 'style_catalog_meta', meta || {}),
    saveSiteSetting(userId, 'style_price_overrides', prices || {}),
  ]);
}

export async function upsertStyleCover(userId, styleId, storagePath) {
  const client = await getStudioClient();
  const { data: existing } = await client
    .from('styld_site_records')
    .select('id')
    .eq('user_id', userId)
    .eq('record_type', 'style_cover_image')
    .eq('record_key', styleId)
    .maybeSingle();

  const row = {
    user_id: userId,
    record_type: 'style_cover_image',
    record_key: styleId,
    data: { storage_path: storagePath, storagePath: storagePath },
  };

  if (existing?.id) {
    await client.from('styld_site_records').update({ data: row.data }).eq('id', existing.id);
  } else {
    await client.from('styld_site_records').insert(row);
  }
  return storagePath;
}

export async function uploadStyleCover(userId, styleId, file) {
  const path = await uploadToStyleCovers(userId, styleId, file);
  await upsertStyleCover(userId, styleId, path);
  return path;
}

export async function loadSiteReviews(userId) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_records')
    .select('id,data,created_at')
    .eq('user_id', userId)
    .eq('record_type', 'review')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(function (row) {
    let d = row.data;
    if (d && d.value) d = d.value;
    return {
      id: row.id,
      created_at: row.created_at,
      booking_id: d?.booking_id || '',
      client_name: d?.client_name || 'Client',
      rating: Number(d?.rating) || 0,
      message: String(d?.message || '').trim(),
      published: d?.published !== false,
      source: d?.source || '',
    };
  });
}

export async function deleteSiteReview(userId, reviewId) {
  const client = await getStudioClient();
  const { error } = await client
    .from('styld_site_records')
    .delete()
    .eq('user_id', userId)
    .eq('record_type', 'review')
    .eq('id', reviewId);
  if (error) throw error;
}

export async function saveReviewsSettings(userId, settings) {
  await saveSiteSetting(userId, 'reviews_settings', normalizeReviewsSettings(settings));
}

export async function saveProductsBundle(userId, products, productsSettings, siteContent) {
  await Promise.all([
    saveSiteSetting(userId, 'products_catalog', normalizeSiteProducts(products)),
    saveSiteSetting(userId, 'products_settings', normalizeProductsSettings(productsSettings)),
    saveSiteSetting(userId, 'site_content', normalizeSiteContent(siteContent)),
  ]);
}

export async function saveCertificationsBundle(userId, siteContent, siteTheme) {
  await Promise.all([
    saveSiteSetting(userId, 'site_content', normalizeSiteContent(siteContent)),
    saveSiteSetting(userId, 'site_theme', normalizeSiteTheme(siteTheme)),
  ]);
}

export function paymentPreviewSummary(payment, samplePrice) {
  payment = normalizeBookingPayment(payment);
  samplePrice = samplePrice || 200;
  let dueNow = 0;
  if (payment.mode === 'full') dueNow = samplePrice;
  else if (payment.mode === 'deposit') {
    dueNow =
      payment.depositKind === 'percent'
        ? Math.round((samplePrice * payment.depositValue) / 100)
        : payment.depositValue;
  }
  return {
    modeLabel:
      payment.mode === 'full'
        ? 'Full payment upfront'
        : payment.mode === 'deposit'
          ? 'Deposit online'
          : 'Pay in person',
    dueNow: dueNow,
    approval: payment.requireBookingApproval ? 'Manual approval required' : 'Auto-confirm when paid',
  };
}

export { uploadToStyleCovers, publicMediaUrl } from './studio-api.js';
