import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROOT_DOMAIN = Deno.env.get('STYLD_ROOT_DOMAIN') || 'styldd.com';
const ADMIN_PIN = Deno.env.get('ADMIN_PIN') || '0000';

const wrongPinAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_WRONG_PINS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

type Body = {
  pin?: string;
  action?: string;
  filters?: Record<string, unknown>;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clientIp(req: Request) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function verifyPin(req: Request, pin: string | undefined) {
  if (!pin || pin !== ADMIN_PIN) {
    const ip = clientIp(req);
    const now = Date.now();
    const entry = wrongPinAttempts.get(ip) || { count: 0, resetAt: now + LOCKOUT_MS };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + LOCKOUT_MS;
    }
    entry.count += 1;
    wrongPinAttempts.set(ip, entry);
    if (entry.count >= MAX_WRONG_PINS) {
      return { ok: false as const, locked: true, retryAfterMs: entry.resetAt - now };
    }
    return { ok: false as const, locked: false };
  }
  wrongPinAttempts.delete(clientIp(req));
  return { ok: true as const };
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function pickData(row: { data?: unknown }) {
  const d = row?.data;
  if (d && typeof d === 'object' && 'value' in (d as Record<string, unknown>)) {
    return (d as { value: unknown }).value;
  }
  return d ?? null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';

function publicAssetUrl(path: unknown, bucket = 'style-covers') {
  if (!path || typeof path !== 'string') return null;
  const p = path.trim();
  if (!p) return null;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (!SUPABASE_URL) return null;
  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${p.replace(/^\/+/, '')}`;
}

async function signedBookingPhotoUrl(
  supabase: ReturnType<typeof adminClient>,
  path: unknown,
): Promise<string | null> {
  if (!path || typeof path !== 'string') return null;
  const cleaned = path.trim().replace(/^\/+/, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return cleaned;
  try {
    const { data, error } = await supabase.storage.from('booking-photos').createSignedUrl(cleaned, 3600);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    /* fall through */
  }
  return publicAssetUrl(cleaned, 'booking-photos');
}

function salonImageUrl(
  profile: Record<string, unknown>,
  siteContent: Record<string, unknown> | null,
  siteTheme: Record<string, unknown> | null,
) {
  const theme = siteTheme || {};
  const content = siteContent || {};
  return (
    publicAssetUrl(theme.logoImagePath) ||
    publicAssetUrl(theme.heroImagePath) ||
    publicAssetUrl(profile.avatar_url, 'style-covers') ||
    (typeof profile.avatar_url === 'string' && profile.avatar_url.startsWith('http') ? profile.avatar_url : null) ||
    null
  );
}

function revenueFromBookingData(data: Record<string, unknown> | null) {
  if (!data) return { gross: 0, collected: 0, pending: 0 };
  const status = String(data.booking_status || '').toLowerCase();
  if (status === 'cancelled') return { gross: 0, collected: 0, pending: 0 };
  const gross = Number(data.estimated_total) || 0;
  const deposit = Number(data.deposit_amount) || 0;
  const payment = String(data.payment_status || '').toLowerCase();
  let collected = 0;
  if (payment === 'paid') collected = gross;
  else if (payment === 'deposit_paid') collected = deposit;
  const pending = Math.max(0, gross - collected);
  return { gross, collected, pending };
}

function totalChargeWithFee(stylistAmount: number) {
  if (!stylistAmount || stylistAmount <= 0) return 0;
  const amountCents = Math.round(stylistAmount * 100);
  const chargeCents = Math.ceil((amountCents + 30) / (1 - 0.029 - 0.01));
  return chargeCents / 100;
}

function computeServiceFee(stylistAmount: number) {
  if (!stylistAmount || stylistAmount <= 0) return 0;
  return Math.round((totalChargeWithFee(stylistAmount) - stylistAmount) * 100) / 100;
}

function estimatePlatformFee(stylistAmount: number) {
  if (!stylistAmount || stylistAmount <= 0) return 0;
  return Math.round(stylistAmount * 0.01 * 100) / 100;
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function aggregatePaymentMetrics(bookingRows: { user_id: string; data: unknown }[]) {
  let gross = 0;
  let collected = 0;
  let pending = 0;
  let customerCharges = 0;
  let serviceFees = 0;
  let platformFees = 0;
  let refundsTotal = 0;
  let refundsCount = 0;
  const paymentStatusCounts = new Map<string, number>();
  const revenueByUser = new Map<string, { gross: number; collected: number; pending: number }>();

  for (const row of bookingRows) {
    const d = pickData(row) as Record<string, unknown> | null;
    const rev = revenueFromBookingData(d);
    gross += rev.gross;
    collected += rev.collected;
    pending += rev.pending;

    const pay = String(d?.payment_status || 'none').toLowerCase();
    paymentStatusCounts.set(pay, (paymentStatusCounts.get(pay) || 0) + 1);

    if (rev.collected > 0) {
      customerCharges += totalChargeWithFee(rev.collected);
      serviceFees += computeServiceFee(rev.collected);
      platformFees += estimatePlatformFee(rev.collected);
    }

    const refundCents = Number(d?.refund_amount_cents) || 0;
    if (refundCents > 0) {
      refundsTotal += refundCents / 100;
      refundsCount += 1;
    }

    const uid = String(row.user_id);
    const existing = revenueByUser.get(uid) || { gross: 0, collected: 0, pending: 0 };
    existing.gross += rev.gross;
    existing.collected += rev.collected;
    existing.pending += rev.pending;
    revenueByUser.set(uid, existing);
  }

  return {
    gross: roundMoney(gross),
    collected: roundMoney(collected),
    pending: roundMoney(pending),
    customer_charges: roundMoney(customerCharges),
    estimated_service_fees: roundMoney(serviceFees),
    estimated_platform_fees: roundMoney(platformFees),
    estimated_processing_fees: roundMoney(Math.max(0, serviceFees - platformFees)),
    refunds_total: roundMoney(refundsTotal),
    refunds_count: refundsCount,
    payment_status: [...paymentStatusCounts.entries()].map(([status, count]) => ({ status, count })),
    revenue_by_user: revenueByUser,
  };
}

function aggregateStripeConnect(stripeRows: Record<string, unknown>[]) {
  let available = 0;
  let pending = 0;
  let live = 0;
  let payouts = 0;
  let withBalance = 0;

  for (const row of stripeRows) {
    if (row.charges_enabled) live += 1;
    if (row.payouts_enabled) payouts += 1;
    const av = Number(row.balance_available_cents) || 0;
    const pe = Number(row.balance_pending_cents) || 0;
    available += av;
    pending += pe;
    if (av > 0 || pe > 0) withBalance += 1;
  }

  return {
    merchants_total: stripeRows.length,
    merchants_live: live,
    merchants_payouts_enabled: payouts,
    balance_available_cents: available,
    balance_pending_cents: pending,
    balance_available: roundMoney(available / 100),
    balance_pending: roundMoney(pending / 100),
    balance_total: roundMoney((available + pending) / 100),
    accounts_with_balance: withBalance,
  };
}

function aggregateRevenueByUser(bookingRows: { user_id: string; data: unknown }[]) {
  const map = new Map<string, { gross: number; collected: number; pending: number; count: number }>();
  for (const row of bookingRows) {
    const uid = String(row.user_id);
    const rev = revenueFromBookingData(pickData(row) as Record<string, unknown>);
    const existing = map.get(uid) || { gross: 0, collected: 0, pending: 0, count: 0 };
    existing.gross += rev.gross;
    existing.collected += rev.collected;
    existing.pending += rev.pending;
    existing.count += rev.gross > 0 || rev.collected > 0 ? 1 : 0;
    map.set(uid, existing);
  }
  return map;
}

function bookingFields(data: Record<string, unknown> | null) {
  if (!data || typeof data !== 'object') return {};
  const d = data as Record<string, unknown>;
  return {
    id: d.id ?? null,
    full_name: d.full_name ?? null,
    email: d.email ?? null,
    phone: d.phone ?? null,
    style_id: d.style_id ?? null,
    style_name: d.style_name ?? null,
    service_address: d.service_address ?? null,
    appointment_date: d.appointment_date ?? null,
    appointment_slot: d.appointment_slot ?? null,
    appointment_starts_at: d.appointment_starts_at ?? null,
    duration_minutes: d.duration_minutes ?? null,
    booking_status: d.booking_status ?? null,
    payment_status: d.payment_status ?? null,
    estimated_total: d.estimated_total ?? null,
    deposit_amount: d.deposit_amount ?? null,
    stripe_payment_intent_id: d.stripe_payment_intent_id ?? d.unit_payment_id ?? null,
    photo_hair_path: d.photo_hair_path ?? d.current_hair_photo_path ?? null,
    photo_ref_path: d.photo_ref_path ?? d.reference_photo_path ?? null,
    notes: d.notes ?? null,
    source: d.source ?? null,
    google_calendar_id: d.google_calendar_id ?? null,
    refund_status: d.refund_status ?? null,
    refund_amount_cents: d.refund_amount_cents ?? null,
    review_token: d.review_token ?? null,
  };
}

async function safeTable<T>(
  supabase: ReturnType<typeof adminClient>,
  table: string,
  build: (q: ReturnType<ReturnType<typeof adminClient>['from']>) => ReturnType<ReturnType<typeof adminClient>['from']>,
): Promise<T[]> {
  try {
    const { data, error } = await build(supabase.from(table));
    if (error) {
      console.warn(`table ${table}:`, error.message);
      return [];
    }
    return (data as T[]) || [];
  } catch (e) {
    console.warn(`table ${table} missing:`, e);
    return [];
  }
}

async function fetchRevenueCatStatus(userId: string) {
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!key) {
    return {
      status: 'unknown',
      message: 'Set REVENUECAT_SECRET_API_KEY in Supabase Edge Function secrets',
      plan_label: 'Unknown',
    };
  }
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.status === 404) {
      return {
        status: 'none',
        entitlement: null,
        product: null,
        plan_label: 'Free',
        expires_date: null,
        purchase_date: null,
        store: null,
        will_renew: false,
      };
    }
    if (!res.ok) {
      return { status: 'error', message: `RevenueCat HTTP ${res.status}`, plan_label: 'Error' };
    }

    const body = await res.json();
    const subscriber = (body?.subscriber || {}) as Record<string, unknown>;
    const entitlements = (subscriber.entitlements || {}) as Record<string, Record<string, unknown>>;
    const subscriptions = (subscriber.subscriptions || {}) as Record<string, Record<string, unknown>>;
    const pro = entitlements.pro;

    if (!pro) {
      return {
        status: 'none',
        entitlement: null,
        product: null,
        plan_label: 'Free',
        expires_date: null,
        purchase_date: null,
        store: null,
        will_renew: false,
      };
    }

    const productId = String(pro.product_identifier || '') || null;
    const expiresDate = (pro.expires_date as string | null) ?? null;
    const purchaseDate = (pro.purchase_date as string | null) ?? null;
    const storeRaw = String(pro.store || '');
    const store =
      storeRaw === 'app_store' ? 'App Store' : storeRaw === 'play_store' ? 'Google Play' : storeRaw || null;

    const active = !expiresDate || new Date(expiresDate) > new Date();
    const planLabel =
      productId === 'styld_yearly'
        ? 'Pro Yearly'
        : productId === 'styld_monthly'
          ? 'Pro Monthly'
          : productId
            ? productId
            : 'Pro';

    const subRow = productId ? subscriptions[productId] : null;
    const unsubscribeAt = subRow?.unsubscribe_detected_at ?? null;
    const billingIssues = !!subRow?.billing_issues_detected_at;

    return {
      status: active ? 'active' : 'expired',
      entitlement: 'pro',
      product: productId,
      plan_label: planLabel,
      expires_date: expiresDate,
      purchase_date: purchaseDate,
      store,
      period_type: subRow?.period_type ?? null,
      will_renew: active && !unsubscribeAt,
      unsubscribe_detected_at: unsubscribeAt,
      billing_issues: billingIssues,
      is_sandbox: subRow?.is_sandbox ?? null,
    };
  } catch (e) {
    return { status: 'error', message: String(e), plan_label: 'Error' };
  }
}

const STYLD_SUB_MONTHLY_PRICE = () => Number(Deno.env.get('STYLD_SUB_MONTHLY_PRICE') || 9.99);
const STYLD_SUB_YEARLY_PRICE = () => Number(Deno.env.get('STYLD_SUB_YEARLY_PRICE') || 99.99);

function monthKeyFromIso(iso: string) {
  if (!iso || iso.length < 7) return '';
  return iso.slice(0, 7);
}

function resolveRevenuePeriod(filters: Record<string, unknown>) {
  const now = new Date();
  const range = String(filters.range || 'month').toLowerCase();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (range === 'all') {
    return { range: 'all' as const, label: 'All time', month: null, year: null };
  }

  if (range === 'year') {
    const year = String(filters.year || now.getFullYear());
    return { range: 'year' as const, label: year, month: null, year };
  }

  const month = String(filters.month || defaultMonth);
  return { range: 'month' as const, label: month, month, year: month.slice(0, 4) };
}

function aggregatePlatformFeesTimeline(bookingRows: { created_at: string; data: unknown }[]) {
  const byMonth = new Map<
    string,
    {
      platform_fees: number;
      service_fees: number;
      customer_charges: number;
      collected: number;
      paid_bookings: number;
    }
  >();

  for (const row of bookingRows) {
    const d = pickData(row) as Record<string, unknown> | null;
    const rev = revenueFromBookingData(d);
    if (rev.collected <= 0) continue;
    const month = monthKeyFromIso(String(row.created_at || ''));
    if (!month) continue;

    const bucket = byMonth.get(month) || {
      platform_fees: 0,
      service_fees: 0,
      customer_charges: 0,
      collected: 0,
      paid_bookings: 0,
    };
    bucket.platform_fees += estimatePlatformFee(rev.collected);
    bucket.service_fees += computeServiceFee(rev.collected);
    bucket.customer_charges += totalChargeWithFee(rev.collected);
    bucket.collected += rev.collected;
    bucket.paid_bookings += 1;
    byMonth.set(month, bucket);
  }

  return [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({
      month,
      platform_fees: roundMoney(v.platform_fees),
      service_fees: roundMoney(v.service_fees),
      customer_charges: roundMoney(v.customer_charges),
      collected: roundMoney(v.collected),
      paid_bookings: v.paid_bookings,
    }));
}

function filterTimelineByPeriod(
  timeline: ReturnType<typeof aggregatePlatformFeesTimeline>,
  period: ReturnType<typeof resolveRevenuePeriod>,
) {
  if (period.range === 'all') return timeline;
  if (period.range === 'year') {
    const y = period.year || period.label;
    return timeline.filter((t) => t.month.startsWith(`${y}-`));
  }
  return timeline.filter((t) => t.month === period.month);
}

function sumPlatformTimeline(timeline: ReturnType<typeof aggregatePlatformFeesTimeline>) {
  return timeline.reduce(
    (acc, t) => ({
      platform_fees: acc.platform_fees + t.platform_fees,
      service_fees: acc.service_fees + t.service_fees,
      customer_charges: acc.customer_charges + t.customer_charges,
      collected: acc.collected + t.collected,
      paid_bookings: acc.paid_bookings + t.paid_bookings,
    }),
    { platform_fees: 0, service_fees: 0, customer_charges: 0, collected: 0, paid_bookings: 0 },
  );
}

async function revenueCatV2Fetch(path: string, query?: Record<string, string>) {
  const key = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!key) return null;
  try {
    const url = new URL(`https://api.revenuecat.com/v2${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v) url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.warn('RevenueCat v2', path, res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn('RevenueCat v2 error', path, e);
    return null;
  }
}

async function getRevenueCatProjectId() {
  const fromEnv = Deno.env.get('REVENUECAT_PROJECT_ID');
  if (fromEnv) return fromEnv;
  const data = await revenueCatV2Fetch('/projects');
  const items = (data?.items || []) as Record<string, unknown>[];
  return items.length ? String(items[0].id) : null;
}

function parseRevenueCatOverviewMetrics(body: Record<string, unknown> | null) {
  if (!body) return null;
  const metrics = (body.metrics || []) as Record<string, unknown>[];
  const map = new Map<string, number>();
  for (const m of metrics) {
    map.set(String(m.id || ''), Number(m.value) || 0);
  }
  return {
    mrr: map.get('mrr') ?? null,
    active_subscriptions: map.get('active_subscriptions') ?? null,
    active_trials: map.get('active_trials') ?? null,
    revenue: map.get('revenue') ?? null,
    raw: body,
  };
}

function estimateMrrFromCounts(monthly: number, yearly: number) {
  return roundMoney(monthly * STYLD_SUB_MONTHLY_PRICE() + yearly * (STYLD_SUB_YEARLY_PRICE() / 12));
}

async function actionStyldRevenue(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const period = resolveRevenuePeriod(filters);

  const [profiles, settingsRows, bookingRows] = await Promise.all([
    safeTable<Record<string, unknown>>(supabase, 'profiles', (q) =>
      q.select('id,email,full_name,business_name,created_at'),
    ),
    safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
      q.select('user_id,data').eq('record_type', 'site_setting').eq('record_key', 'site_content'),
    ),
    safeTable<{ created_at: string; data: unknown }>(supabase, 'styld_site_records', (q) =>
      q.select('created_at,data').eq('record_type', 'booking'),
    ),
  ]);

  const brandByUser = new Map<string, string>();
  for (const row of settingsRows) {
    const content = pickData(row) as Record<string, unknown> | null;
    brandByUser.set(String(row.user_id), String(content?.brandName || ''));
  }

  const timelineAll = aggregatePlatformFeesTimeline(bookingRows);
  const timelineFiltered = filterTimelineByPeriod(timelineAll, period);
  const platformTotals = sumPlatformTimeline(timelineFiltered);
  const platformTotalsRounded = {
    platform_fees: roundMoney(platformTotals.platform_fees),
    service_fees: roundMoney(platformTotals.service_fees),
    customer_charges: roundMoney(platformTotals.customer_charges),
    collected: roundMoney(platformTotals.collected),
    paid_bookings: platformTotals.paid_bookings,
  };

  const userIds = profiles.map((p) => String(p.id));
  const concurrency = 8;
  const subscriptionRows: Array<Record<string, unknown>> = [];

  for (let i = 0; i < userIds.length; i += concurrency) {
    const batch = userIds.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (uid) => {
        const profile = profiles.find((p) => String(p.id) === uid) || {};
        const sub = await fetchRevenueCatStatus(uid);
        return {
          user_id: uid,
          brand_name:
            brandByUser.get(uid) ||
            String(profile.business_name || profile.full_name || 'Salon'),
          email: profile.email ?? null,
          ...sub,
        };
      }),
    );
    subscriptionRows.push(...batchResults);
  }

  let activeMonthly = 0;
  let activeYearly = 0;
  let activeOther = 0;
  let activeTotal = 0;
  let freeTotal = 0;
  let expiredTotal = 0;
  let errorTotal = 0;
  let newInPeriod = 0;

  for (const row of subscriptionRows) {
    const status = String(row.status || '');
    const product = String(row.product || '');
    const purchaseDate = String(row.purchase_date || '');

    if (status === 'active') {
      activeTotal += 1;
      if (product === 'styld_monthly') activeMonthly += 1;
      else if (product === 'styld_yearly') activeYearly += 1;
      else if (product) activeOther += 1;
    } else if (status === 'none') {
      freeTotal += 1;
    } else if (status === 'expired') {
      expiredTotal += 1;
    } else if (status === 'error' || status === 'unknown') {
      errorTotal += 1;
    }

    if (period.range === 'month' && period.month && purchaseDate.startsWith(period.month)) {
      newInPeriod += 1;
    } else if (period.range === 'year' && period.year && purchaseDate.startsWith(`${period.year}-`)) {
      newInPeriod += 1;
    }
  }

  const estimatedMrr = estimateMrrFromCounts(activeMonthly, activeYearly);

  const projectId = await getRevenueCatProjectId();
  let revenueCatOverview = null;
  if (projectId) {
    const overviewBody = await revenueCatV2Fetch(`/projects/${projectId}/metrics/overview`);
    revenueCatOverview = parseRevenueCatOverviewMetrics(overviewBody as Record<string, unknown> | null);
  }

  const activeSubscribers = subscriptionRows
    .filter((r) => r.status === 'active')
    .sort((a, b) => String(a.brand_name).localeCompare(String(b.brand_name)));

  const availableMonths = timelineAll.map((t) => t.month);
  const availableYears = [...new Set(availableMonths.map((m) => m.slice(0, 4)))].sort();

  return {
    period,
    platform: platformTotalsRounded,
    platform_timeline: timelineAll.slice(-24),
    platform_timeline_filtered: timelineFiltered,
    subscriptions: {
      total_salons: subscriptionRows.length,
      active: activeTotal,
      active_monthly: activeMonthly,
      active_yearly: activeYearly,
      active_other: activeOther,
      free: freeTotal,
      expired: expiredTotal,
      errors: errorTotal,
      new_in_period: newInPeriod,
      estimated_mrr: estimatedMrr,
      monthly_price: STYLD_SUB_MONTHLY_PRICE(),
      yearly_price: STYLD_SUB_YEARLY_PRICE(),
      revenuecat_overview: revenueCatOverview,
      subscribers: activeSubscribers,
    },
    combined: {
      platform_cut: platformTotalsRounded.platform_fees,
      estimated_subscription_mrr: estimatedMrr,
      note:
        'Platform cut is estimated 1% on collected booking payments in the selected period. Subscription MRR is estimated from active Pro plans.',
    },
    available_months: availableMonths,
    available_years: availableYears,
    pricing_note: `Assumed Pro Monthly $${STYLD_SUB_MONTHLY_PRICE()}, Pro Yearly $${STYLD_SUB_YEARLY_PRICE()} — override with STYLD_SUB_MONTHLY_PRICE / STYLD_SUB_YEARLY_PRICE secrets.`,
  };
}

async function loadAuthUsers(supabase: ReturnType<typeof adminClient>) {
  const map = new Map<string, Record<string, unknown>>();
  let page = 1;
  const perPage = 1000;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn('auth.admin.listUsers:', error.message);
      break;
    }
    for (const u of data.users) {
      const meta = (u.app_metadata || {}) as Record<string, unknown>;
      map.set(u.id, {
        last_sign_in_at: u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        provider: meta.provider ?? (Array.isArray(u.identities) && u.identities[0]?.provider) ?? null,
        auth_created_at: u.created_at,
      });
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return map;
}

async function actionOverview(supabase: ReturnType<typeof adminClient>) {
  const [
    profiles,
    userSites,
    subdomains,
    bookings,
    inquiries,
    reviews,
    stripeAccounts,
    settingsRows,
  ] = await Promise.all([
    safeTable<{ id: string; full_name: string | null; business_name: string | null }>(supabase, 'profiles', (q) =>
      q.select('id,full_name,business_name'),
    ),
    safeTable<{ user_id: string; published_at: string | null }>(supabase, 'styld_user_sites', (q) =>
      q.select('user_id,published_at'),
    ),
    safeTable<{ user_id: string; subdomain: string }>(supabase, 'styld_site_subdomains', (q) =>
      q.select('user_id,subdomain'),
    ),
    safeTable<{ user_id: string; data: unknown }>(supabase, 'styld_site_records', (q) =>
      q.select('user_id,data').eq('record_type', 'booking'),
    ),
    safeTable(supabase, 'styld_site_records', (q) => q.select('id').eq('record_type', 'inquiry')),
    safeTable(supabase, 'styld_site_records', (q) => q.select('id').eq('record_type', 'review')),
    safeTable<Record<string, unknown>>(supabase, 'styld_stripe_accounts', (q) => q.select('*')),
    safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
      q.select('user_id,data').eq('record_type', 'site_setting').eq('record_key', 'site_content'),
    ),
  ]);

  const publishedSites = userSites.filter((s) => s.published_at).length;
  const stripeConnect = aggregateStripeConnect(stripeAccounts);
  const payments = aggregatePaymentMetrics(bookings);

  const profileMap = new Map(profiles.map((p) => [String(p.id), p]));
  const subMap = new Map(subdomains.map((s) => [String(s.user_id), s.subdomain]));
  const brandByUser = new Map<string, string>();
  for (const row of settingsRows) {
    const content = pickData(row) as Record<string, unknown> | null;
    brandByUser.set(String(row.user_id), String(content?.brandName || ''));
  }

  const topSalons = [...payments.revenue_by_user.entries()]
    .map(([userId, rev]) => {
      const profile = profileMap.get(userId) || {};
      const brand =
        brandByUser.get(userId) ||
        profile.business_name ||
        profile.full_name ||
        'Salon';
      return {
        user_id: userId,
        brand_name: brand,
        subdomain: subMap.get(userId) || null,
        gross: roundMoney(rev.gross),
        collected: roundMoney(rev.collected),
        pending: roundMoney(rev.pending),
      };
    })
    .sort((a, b) => b.collected - a.collected)
    .slice(0, 10);

  const clientKeys = new Set<string>();
  const globalClients = new Set<string>();
  for (const b of bookings) {
    const d = pickData(b) as Record<string, unknown> | null;
    const email = String(d?.email || '').toLowerCase().trim();
    const phone = String(d?.phone || '').trim();
    if (!email && !phone) continue;
    const key = `${b.user_id}::${email}::${phone}`;
    clientKeys.add(key);
    globalClients.add(`${email}::${phone}`);
  }

  const { revenue_by_user: _revenueByUser, ...paymentsPublic } = payments;

  return {
    total_stylists: profiles.length,
    published_sites: publishedSites,
    draft_sites: Math.max(0, profiles.length - publishedSites),
    total_bookings: bookings.length,
    unique_clients_per_stylist: clientKeys.size,
    unique_clients_global: globalClients.size,
    total_inquiries: inquiries.length,
    total_reviews: reviews.length,
    stripe_merchants_live: stripeConnect.merchants_live,
    subscriptions_note: Deno.env.get('REVENUECAT_SECRET_API_KEY')
      ? 'RevenueCat configured — see Salons tab for per-account plans'
      : 'Subscription data unavailable — set REVENUECAT_SECRET_API_KEY',
    payments: paymentsPublic,
    stripe_connect: stripeConnect,
    top_salons_by_collected: topSalons,
    fee_note:
      'Service and platform fees are estimated from the checkout formula (1% platform + pass-through card processing on collected booking amounts).',
  };
}

async function actionUsers(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const search = String(filters.search || '')
    .toLowerCase()
    .trim();

  const [profiles, userSites, subdomains, stripeRows, settingsRows, bookingRows, recordCounts, pushRows, pageViews, authMap, reviewRatingRows] =
    await Promise.all([
      safeTable<Record<string, unknown>>(supabase, 'profiles', (q) =>
        q.select('id,email,full_name,business_name,avatar_url,created_at,updated_at').order('created_at', {
          ascending: false,
        }),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_user_sites', (q) =>
        q.select('user_id,subdomain,published_at'),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_subdomains', (q) =>
        q.select('user_id,subdomain,published_at'),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_stripe_accounts', (q) => q.select('*')),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
        q.select('user_id,record_type,record_key,data').eq('record_type', 'site_setting').in('record_key', [
          'onboarding_state',
          'onboarding_responses',
          'site_publish',
          'site_content',
          'site_theme',
        ]),
      ),
      safeTable<{ user_id: string; data: unknown }>(supabase, 'styld_site_records', (q) =>
        q.select('user_id,data').eq('record_type', 'booking'),
      ),
      safeTable<{ user_id: string; record_type: string }>(supabase, 'styld_site_records', (q) =>
        q.select('user_id,record_type').in('record_type', ['booking', 'inquiry', 'review']),
      ),
      safeTable<{ user_id: string }>(supabase, 'styld_push_tokens', (q) => q.select('user_id')),
      safeTable<{ subdomain: string; created_at: string }>(supabase, 'styld_site_page_views', (q) =>
        q.select('subdomain,created_at'),
      ),
      loadAuthUsers(supabase),
      safeTable<{ user_id: string; data: unknown }>(supabase, 'styld_site_records', (q) =>
        q.select('user_id,data').eq('record_type', 'review'),
      ),
    ]);

  const analyticsEvents = await safeTable<{ subdomain: string; created_at: string }>(
    supabase,
    'styld_analytics_events',
    (q) => q.select('subdomain,created_at'),
  );
  const views = analyticsEvents.length ? analyticsEvents : pageViews;

  const siteByUser = new Map(userSites.map((s) => [String(s.user_id), s]));
  const subByUser = new Map(subdomains.map((s) => [String(s.user_id), s]));
  const stripeByUser = new Map(stripeRows.map((s) => [String(s.user_id), s]));

  const settingsByUser = new Map<string, Record<string, unknown>>();
  for (const row of settingsRows) {
    const uid = String(row.user_id);
    if (!settingsByUser.has(uid)) settingsByUser.set(uid, {});
    settingsByUser.get(uid)![String(row.record_key)] = pickData(row);
  }

  const revenueByUser = aggregateRevenueByUser(bookingRows);

  const countsByUser = new Map<string, { bookings: number; inquiries: number; reviews: number }>();
  for (const row of recordCounts) {
    const uid = String(row.user_id);
    if (!countsByUser.has(uid)) countsByUser.set(uid, { bookings: 0, inquiries: 0, reviews: 0 });
    const c = countsByUser.get(uid)!;
    if (row.record_type === 'booking') c.bookings += 1;
    if (row.record_type === 'inquiry') c.inquiries += 1;
    if (row.record_type === 'review') c.reviews += 1;
  }

  const pushCount = new Map<string, number>();
  for (const row of pushRows) {
    const uid = String(row.user_id);
    pushCount.set(uid, (pushCount.get(uid) || 0) + 1);
  }

  const ratingsByUser = new Map<string, { sum: number; count: number }>();
  for (const row of reviewRatingRows) {
    const d = pickData(row) as Record<string, unknown> | null;
    const rating = Number(d?.rating) || 0;
    if (rating <= 0) continue;
    const uid = String(row.user_id);
    const existing = ratingsByUser.get(uid) || { sum: 0, count: 0 };
    existing.sum += rating;
    existing.count += 1;
    ratingsByUser.set(uid, existing);
  }

  const now = Date.now();
  const ms7 = 7 * 86400000;
  const ms30 = 30 * 86400000;
  const viewsBySub7 = new Map<string, number>();
  const viewsBySub30 = new Map<string, number>();
  for (const v of views) {
    const sub = String(v.subdomain || '');
    const t = new Date(v.created_at).getTime();
    if (now - t <= ms7) viewsBySub7.set(sub, (viewsBySub7.get(sub) || 0) + 1);
    if (now - t <= ms30) viewsBySub30.set(sub, (viewsBySub30.get(sub) || 0) + 1);
  }

  let users = profiles.map((p) => {
    const uid = String(p.id);
    const site = siteByUser.get(uid) || subByUser.get(uid) || {};
    const subdomain = String(site.subdomain || '');
    const settings = settingsByUser.get(uid) || {};
    const siteContent = (settings.site_content || {}) as Record<string, unknown>;
    const siteTheme = (settings.site_theme || {}) as Record<string, unknown>;
    const onboardingState = (settings.onboarding_state || {}) as Record<string, unknown>;
    const sitePublish = (settings.site_publish || {}) as Record<string, unknown>;
    const stripe = stripeByUser.get(uid) || {};
    const auth = authMap.get(uid) || {};
    const counts = countsByUser.get(uid) || { bookings: 0, inquiries: 0, reviews: 0 };
    const revenue = revenueByUser.get(uid) || { gross: 0, collected: 0, pending: 0, count: 0 };
    const brandName =
      String(siteContent.brandName || p.business_name || p.full_name || 'Salon').trim() || 'Salon';
    const ratingStats = ratingsByUser.get(uid);
    const reviewsAvgRating = ratingStats?.count
      ? Math.round((ratingStats.sum / ratingStats.count) * 10) / 10
      : null;

    return {
      user_id: uid,
      email: p.email,
      full_name: p.full_name,
      business_name: p.business_name,
      brand_name: brandName,
      avatar_url: p.avatar_url,
      image_url: salonImageUrl(p, siteContent, siteTheme),
      created_at: p.created_at,
      updated_at: p.updated_at,
      total_revenue: Math.round(revenue.gross * 100) / 100,
      revenue_collected: Math.round(revenue.collected * 100) / 100,
      revenue_pending: Math.round(revenue.pending * 100) / 100,
      last_sign_in_at: auth.last_sign_in_at ?? null,
      email_confirmed_at: auth.email_confirmed_at ?? null,
      provider: auth.provider ?? null,
      subdomain,
      published_at: site.published_at ?? null,
      public_url: subdomain ? `https://${subdomain}.${ROOT_DOMAIN}` : null,
      onboarding_completed: !!onboardingState.completed,
      onboarding_responses_saved: !!settings.onboarding_responses,
      site_published: !!(sitePublish.published ?? site.published_at),
      stripe: {
        onboarding_complete: stripe.onboarding_complete ?? null,
        charges_enabled: stripe.charges_enabled ?? null,
        payouts_enabled: stripe.payouts_enabled ?? null,
        balance_available_cents: stripe.balance_available_cents ?? null,
        balance_pending_cents: stripe.balance_pending_cents ?? null,
      },
      push_tokens: pushCount.get(uid) || 0,
      booking_count: counts.bookings,
      inquiry_count: counts.inquiries,
      review_count: counts.reviews,
      reviews_avg_rating: reviewsAvgRating,
      page_views_7d: viewsBySub7.get(subdomain) || 0,
      page_views_30d: viewsBySub30.get(subdomain) || 0,
      subscription: { status: 'pending' as const },
    };
  });

  if (search) {
    users = users.filter((u) => {
      const hay = [u.email, u.full_name, u.business_name, u.brand_name, u.subdomain].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(search);
    });
  }

  const rcKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (rcKey) {
    await Promise.all(
      users.map(async (u) => {
        u.subscription = (await fetchRevenueCatStatus(String(u.user_id))) as typeof u.subscription;
      }),
    );
  } else {
    users.forEach((u) => {
      u.subscription = {
        status: 'unknown',
        message: 'Set REVENUECAT_SECRET_API_KEY in Supabase secrets',
        plan_label: 'Unknown',
      } as typeof u.subscription;
    });
  }

  return { users };
}

function clientRecordKey(email: string, phone: string) {
  return `${email.toLowerCase()}::${phone}`;
}

function deriveClientsFromBookings(bookings: Record<string, unknown>[]) {
  const map = new Map<
    string,
    {
      client_key: string;
      client_name: string;
      email: string;
      phone: string;
      booking_count: number;
      total_spend: number;
      collected_spend: number;
      pending_spend: number;
      first_booking_at: string | null;
      last_booking_at: string | null;
      cancelled_count: number;
      completed_count: number;
      favorite_service: string | null;
    }
  >();
  const serviceCounts = new Map<string, Map<string, number>>();

  for (const b of bookings) {
    const email = String(b.email || '').trim();
    const phone = String(b.phone || '').trim();
    const name = String(b.full_name || '').trim();
    const key = clientRecordKey(email, phone);
    const rev = revenueFromBookingData(b);
    const appt = String(b.appointment_starts_at || b.created_at || '');
    const status = String(b.booking_status || '').toLowerCase();
    const style = String(b.style_name || '').trim();

    if (style) {
      const styles = serviceCounts.get(key) || new Map<string, number>();
      styles.set(style, (styles.get(style) || 0) + 1);
      serviceCounts.set(key, styles);
    }

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        client_key: key,
        client_name: name,
        email,
        phone,
        booking_count: 1,
        total_spend: rev.gross,
        collected_spend: rev.collected,
        pending_spend: rev.pending,
        first_booking_at: appt || null,
        last_booking_at: appt || null,
        cancelled_count: status === 'cancelled' ? 1 : 0,
        completed_count: status === 'completed' ? 1 : 0,
        favorite_service: style || null,
      });
    } else {
      if (name && (!existing.client_name || existing.client_name === 'Client')) {
        existing.client_name = name;
      }
      existing.booking_count += 1;
      existing.total_spend += rev.gross;
      existing.collected_spend += rev.collected;
      existing.pending_spend += rev.pending;
      if (status === 'cancelled') existing.cancelled_count += 1;
      if (status === 'completed') existing.completed_count += 1;
      if (appt) {
        if (!existing.first_booking_at || appt < existing.first_booking_at) existing.first_booking_at = appt;
        if (!existing.last_booking_at || appt > existing.last_booking_at) existing.last_booking_at = appt;
      }
    }
  }

  for (const client of map.values()) {
    const styles = serviceCounts.get(client.client_key);
    if (styles && styles.size) {
      let top = '';
      let topCount = 0;
      for (const [style, count] of styles.entries()) {
        if (count > topCount) {
          top = style;
          topCount = count;
        }
      }
      client.favorite_service = top || client.favorite_service;
    }
  }

  return [...map.values()].sort((a, b) => b.total_spend - a.total_spend);
}

function buildSalonAnalytics(
  pageViews: Record<string, unknown>[],
  analyticsEvents: Record<string, unknown>[],
  bookings: Record<string, unknown>[],
  reviews: { data?: unknown }[],
) {
  const events = pageViews.length ? pageViews : analyticsEvents;
  const source = pageViews.length
    ? 'styld_site_page_views'
    : analyticsEvents.length
      ? 'styld_analytics_events'
      : 'none';

  const now = Date.now();
  const dayMs = 86400000;
  let views7 = 0;
  let views30 = 0;
  let views90 = 0;
  const dailyMap = new Map<string, number>();
  const pathMap = new Map<string, number>();
  const pageTypeMap = new Map<string, number>();
  const deviceMap = new Map<string, number>();

  for (const e of events) {
    const created = String(e.created_at || '');
    const t = new Date(created).getTime();
    if (isNaN(t)) continue;
    const age = now - t;
    if (age <= 7 * dayMs) views7 += 1;
    if (age <= 30 * dayMs) views30 += 1;
    if (age <= 90 * dayMs) views90 += 1;
    if (age <= 30 * dayMs) {
      const day = created.slice(0, 10);
      dailyMap.set(day, (dailyMap.get(day) || 0) + 1);
    }
    const path = String(e.path || '/');
    pathMap.set(path, (pathMap.get(path) || 0) + 1);
    const pt = String(e.page_type || 'other');
    pageTypeMap.set(pt, (pageTypeMap.get(pt) || 0) + 1);
    const dev = String(e.device_type || 'unknown');
    deviceMap.set(dev, (deviceMap.get(dev) || 0) + 1);
  }

  const daily_views: { day: string; views: number }[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now - i * dayMs);
    const key = d.toISOString().slice(0, 10);
    daily_views.push({ day: key, views: dailyMap.get(key) || 0 });
  }

  const monthMap = new Map<string, { revenue: number; bookings: number; collected: number }>();
  const serviceMap = new Map<string, { count: number; revenue: number }>();
  const statusMap = new Map<string, number>();
  const paymentMap = new Map<string, number>();

  for (const b of bookings) {
    const rev = revenueFromBookingData(b);
    const status = String(b.booking_status || 'unknown');
    statusMap.set(status, (statusMap.get(status) || 0) + 1);
    const pay = String(b.payment_status || 'unknown');
    paymentMap.set(pay, (paymentMap.get(pay) || 0) + 1);

    const style = String(b.style_name || 'Unknown');
    const svc = serviceMap.get(style) || { count: 0, revenue: 0 };
    svc.count += 1;
    svc.revenue += rev.gross;
    serviceMap.set(style, svc);

    const when = String(b.appointment_starts_at || b.created_at || '');
    if (when.length >= 7) {
      const month = when.slice(0, 7);
      const m = monthMap.get(month) || { revenue: 0, bookings: 0, collected: 0 };
      m.revenue += rev.gross;
      m.collected += rev.collected;
      m.bookings += 1;
      monthMap.set(month, m);
    }
  }

  let ratingSum = 0;
  let ratingCount = 0;
  for (const r of reviews) {
    const d = (r.data || {}) as Record<string, unknown>;
    const rating = Number(d.rating);
    if (rating >= 1 && rating <= 5) {
      ratingSum += rating;
      ratingCount += 1;
    }
  }

  return {
    source,
    total_views: events.length,
    views_7d: views7,
    views_30d: views30,
    views_90d: views90,
    daily_views,
    top_paths: [...pathMap.entries()]
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10),
    by_page_type: [...pageTypeMap.entries()].map(([page_type, views]) => ({ page_type, views })),
    by_device: [...deviceMap.entries()].map(([device_type, views]) => ({ device_type, views })),
    revenue_by_month: [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-12)
      .map(([month, v]) => ({
        month,
        revenue: Math.round(v.revenue * 100) / 100,
        collected: Math.round(v.collected * 100) / 100,
        bookings: v.bookings,
      })),
    top_services: [...serviceMap.entries()]
      .map(([name, v]) => ({ name, count: v.count, revenue: Math.round(v.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
    booking_status: [...statusMap.entries()].map(([status, count]) => ({ status, count })),
    payment_status: [...paymentMap.entries()].map(([status, count]) => ({ status, count })),
    reviews_avg_rating: ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
    reviews_count: reviews.length,
  };
}

async function actionUserDetail(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const userId = String(filters.user_id || '');
  if (!userId) return { error: 'user_id required' };

  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();

  const [profile, settings, bookings, inquiries, reviews, blocks, covers, stripe, push, cancels, subscription, userSite, pageViews, analyticsEvents, authUser] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
        q.select('*').eq('user_id', userId).eq('record_type', 'site_setting'),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
        q.select('*').eq('user_id', userId).eq('record_type', 'booking').order('created_at', { ascending: false }).limit(500),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
        q.select('*').eq('user_id', userId).eq('record_type', 'inquiry').order('created_at', { ascending: false }).limit(100),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
        q.select('*').eq('user_id', userId).eq('record_type', 'review').order('created_at', { ascending: false }).limit(100),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
        q.select('*').eq('user_id', userId).eq('record_type', 'blocked_interval'),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
        q.select('*').eq('user_id', userId).eq('record_type', 'style_cover_image'),
      ),
      supabase.from('styld_stripe_accounts').select('*').eq('user_id', userId).maybeSingle(),
      safeTable<Record<string, unknown>>(supabase, 'styld_push_tokens', (q) => q.select('*').eq('user_id', userId)),
      safeTable<Record<string, unknown>>(supabase, 'styld_cancellation_events', (q) =>
        q.select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
      ),
      fetchRevenueCatStatus(userId),
      supabase.from('styld_user_sites').select('*').eq('user_id', userId).maybeSingle(),
      safeTable<Record<string, unknown>>(supabase, 'styld_site_page_views', (q) =>
        q
          .select('path,page_type,referrer,created_at,subdomain')
          .eq('user_id', userId)
          .gte('created_at', since90)
          .order('created_at', { ascending: false })
          .limit(5000),
      ),
      safeTable<Record<string, unknown>>(supabase, 'styld_analytics_events', (q) =>
        q
          .select('path,device_type,referrer,created_at,subdomain')
          .gte('created_at', since90)
          .order('created_at', { ascending: false })
          .limit(5000),
      ),
      supabase.auth.admin.getUserById(userId),
    ]);

  const siteSettings: Record<string, unknown> = {};
  for (const row of settings) {
    siteSettings[String(row.record_key)] = pickData(row);
  }

  const profileRow = (profile.data || {}) as Record<string, unknown>;
  const siteContent = (siteSettings.site_content || {}) as Record<string, unknown>;
  const siteTheme = (siteSettings.site_theme || {}) as Record<string, unknown>;
  const sitePublish = (siteSettings.site_publish || {}) as Record<string, unknown>;
  const subdomain = String(
    sitePublish.subdomain || (userSite.data as Record<string, unknown> | null)?.subdomain || '',
  );
  const filteredAnalytics =
    subdomain && analyticsEvents.length
      ? analyticsEvents.filter((e) => String(e.subdomain || '') === subdomain)
      : [];

  const parsedReviews = reviews.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    data: pickData(r),
  }));

  const parsedBookings = bookings.map((b) => ({
    id: b.id,
    created_at: b.created_at,
    updated_at: b.updated_at,
    ...bookingFields(pickData(b) as Record<string, unknown>),
  }));

  let gross = 0;
  let collected = 0;
  let pending = 0;
  let cancelledCount = 0;
  const clientKeys = new Set<string>();
  for (const b of parsedBookings) {
    const rev = revenueFromBookingData(b as Record<string, unknown>);
    gross += rev.gross;
    collected += rev.collected;
    pending += rev.pending;
    if (String(b.booking_status || '').toLowerCase() === 'cancelled') cancelledCount += 1;
    const email = String(b.email || '').toLowerCase().trim();
    const phone = String(b.phone || '').trim();
    if (email || phone) clientKeys.add(`${email}::${phone}`);
  }

  const analytics = buildSalonAnalytics(pageViews, filteredAnalytics, parsedBookings, parsedReviews);
  const clients = deriveClientsFromBookings(parsedBookings);
  const auth = authUser.data?.user;
  const contact = (siteContent.contact || {}) as Record<string, unknown>;
  const visit = (siteContent.visit || {}) as Record<string, unknown>;

  return {
    profile: profile.data,
    brand_name: String(siteContent.brandName || profileRow.business_name || profileRow.full_name || 'Salon'),
    tagline: siteContent.tagline || null,
    image_url: salonImageUrl(profileRow, siteContent, siteTheme),
    public_url: subdomain ? `https://${subdomain}.${ROOT_DOMAIN}` : null,
    subdomain,
    published_at: (userSite.data as Record<string, unknown> | null)?.published_at || sitePublish.publishedAt || null,
    last_sign_in_at: auth?.last_sign_in_at || null,
    email_confirmed_at: auth?.email_confirmed_at || null,
    contact: {
      phone: contact.phone || siteContent.phone || null,
      email: contact.email || siteContent.email || null,
      instagram: contact.instagram || siteContent.instagram || null,
      address: siteContent.address || visit.addressLine1 || null,
      city: visit.city || null,
      state: visit.state || null,
      timezone: siteContent.timezone || null,
    },
    revenue_summary: {
      gross: Math.round(gross * 100) / 100,
      collected: Math.round(collected * 100) / 100,
      pending: Math.round(pending * 100) / 100,
      booking_count: parsedBookings.length,
      cancelled_count: cancelledCount,
      unique_clients: clientKeys.size,
    },
    analytics,
    clients,
    site_settings: siteSettings,
    booking_payment: siteSettings.booking_payment || null,
    booking_hours: siteSettings.booking_hours || null,
    cancellation_policy: siteSettings.cancellation_policy || null,
    onboarding_responses: siteSettings.onboarding_responses || null,
    bookings: parsedBookings,
    inquiries: inquiries.map((r) => ({ id: r.id, created_at: r.created_at, data: pickData(r) })),
    reviews: parsedReviews,
    blocked_intervals: blocks.map((r) => ({ id: r.id, data: pickData(r) })),
    style_covers: covers.map((r) => ({ id: r.id, record_key: r.record_key, data: pickData(r) })),
    stripe: stripe.data,
    push_tokens: push,
    cancellations: cancels,
    subscription,
    emails: await fetchEmailsForUser(supabase, userId, 100),
  };
}

function normalizeEmailRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    user_id: row.user_id,
    created_at: row.created_at,
    template_key: String(row.template_key || 'unknown'),
    recipient_email: row.recipient_email ?? null,
    recipient_name: row.recipient_name ?? null,
    subject: row.subject ?? null,
    preview_text: row.preview_text ?? null,
    html_body: row.html_body ?? null,
    text_body: row.text_body ?? null,
    booking_id: row.booking_id ?? null,
    client_email: row.client_email ?? null,
    status: row.status ?? 'sent',
    provider: row.provider ?? null,
    provider_message_id: row.provider_message_id ?? null,
    metadata: row.metadata ?? {},
  };
}

async function fetchEmailsForUser(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  limit = 100,
) {
  if (!userId) return [];
  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_sent_emails', (q) =>
    q
      .select(
        'id,user_id,created_at,template_key,recipient_email,recipient_name,subject,preview_text,booking_id,client_email,status,provider',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
  return rows.map(normalizeEmailRow);
}

async function enrichRowsWithSalonMeta<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof adminClient>,
  rows: T[],
): Promise<(T & { brand_name: string | null; subdomain: string | null })[]> {
  const userIds = [...new Set(rows.map((r) => String(r.user_id || '')).filter(Boolean))];
  if (!userIds.length) {
    return rows.map((r) => ({ ...r, brand_name: null, subdomain: null }));
  }

  const [profiles, subdomains, settingsRows] = await Promise.all([
    safeTable<Record<string, unknown>>(supabase, 'profiles', (q) =>
      q.select('id,full_name,business_name').in('id', userIds),
    ),
    safeTable<{ user_id: string; subdomain: string }>(supabase, 'styld_site_subdomains', (q) =>
      q.select('user_id,subdomain').in('user_id', userIds),
    ),
    safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
      q.select('user_id,data').eq('record_type', 'site_setting').eq('record_key', 'site_content').in('user_id', userIds),
    ),
  ]);

  const profileMap = new Map(profiles.map((p) => [String(p.id), p]));
  const subMap = new Map(subdomains.map((s) => [String(s.user_id), s.subdomain]));
  const brandByUser = new Map<string, string>();
  for (const row of settingsRows) {
    const content = pickData(row) as Record<string, unknown> | null;
    brandByUser.set(String(row.user_id), String(content?.brandName || ''));
  }

  return rows.map((row) => {
    const uid = String(row.user_id || '');
    const profile = profileMap.get(uid) || {};
    const brand =
      brandByUser.get(uid) ||
      String(profile.business_name || profile.full_name || '') ||
      null;
    return {
      ...row,
      brand_name: brand,
      subdomain: subMap.get(uid) || null,
    };
  });
}

async function enrichEmailsWithSalon(
  supabase: ReturnType<typeof adminClient>,
  emails: ReturnType<typeof normalizeEmailRow>[],
) {
  const userIds = [...new Set(emails.map((e) => String(e.user_id || '')).filter(Boolean))];
  if (!userIds.length) return emails;

  const [profiles, subdomains] = await Promise.all([
    safeTable<Record<string, unknown>>(supabase, 'profiles', (q) =>
      q.select('id,full_name,business_name').in('id', userIds),
    ),
    safeTable<{ user_id: string; subdomain: string }>(supabase, 'styld_site_subdomains', (q) =>
      q.select('user_id,subdomain').in('user_id', userIds),
    ),
  ]);

  const profileMap = new Map(profiles.map((p) => [String(p.id), p]));
  const subMap = new Map(subdomains.map((s) => [String(s.user_id), s.subdomain]));

  const settingsByUser = new Map<string, Record<string, unknown>>();
  const allSettings = await safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
    q.select('user_id,record_key,data').in('user_id', userIds).eq('record_type', 'site_setting'),
  );
  for (const row of allSettings) {
    const uid = String(row.user_id || '');
    if (!settingsByUser.has(uid)) settingsByUser.set(uid, {});
    const bucket = settingsByUser.get(uid)!;
    bucket[String(row.record_key)] = pickData(row);
  }

  return emails.map((email) => {
    const uid = String(email.user_id || '');
    const profile = profileMap.get(uid) || {};
    const siteContent = (settingsByUser.get(uid)?.site_content || {}) as Record<string, unknown>;
    const subdomain = subMap.get(uid) || '';
    return {
      ...email,
      brand_name: String(
        siteContent.brandName || profile.business_name || profile.full_name || 'Salon',
      ),
      subdomain: subdomain || null,
      public_url: subdomain ? `https://${subdomain}.${ROOT_DOMAIN}` : null,
    };
  });
}

async function actionEmails(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const userId = String(filters.user_id || '').trim();
  const search = String(filters.search || '').toLowerCase().trim();
  const limit = Math.min(Number(filters.limit) || 200, 500);

  let rows: Record<string, unknown>[];
  if (userId) {
    rows = await safeTable<Record<string, unknown>>(supabase, 'styld_sent_emails', (q) => {
      let query = q
        .select(
          'id,user_id,created_at,template_key,recipient_email,recipient_name,subject,preview_text,booking_id,client_email,status,provider',
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      return query;
    });
  } else {
    rows = await safeTable<Record<string, unknown>>(supabase, 'styld_sent_emails', (q) =>
      q
        .select(
          'id,user_id,created_at,template_key,recipient_email,recipient_name,subject,preview_text,booking_id,client_email,status,provider',
        )
        .order('created_at', { ascending: false })
        .limit(limit),
    );
  }

  let emails = await enrichEmailsWithSalon(supabase, rows.map(normalizeEmailRow));

  if (search) {
    emails = emails.filter((e) => {
      const hay = [
        e.brand_name,
        e.subdomain,
        e.recipient_email,
        e.recipient_name,
        e.subject,
        e.preview_text,
        e.template_key,
        e.booking_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(search);
    });
  }

  return { emails, total: emails.length };
}

async function actionEmailDetail(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const emailId = String(filters.email_id || filters.id || '').trim();
  if (!emailId) return { error: 'email_id required' };

  const { data, error } = await supabase.from('styld_sent_emails').select('*').eq('id', emailId).maybeSingle();
  if (error || !data) return { error: 'Email not found' };

  const email = normalizeEmailRow(data as Record<string, unknown>);
  const enriched = (await enrichEmailsWithSalon(supabase, [email]))[0];
  return { email: enriched };
}

async function actionBookings(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const search = String(filters.search || '').toLowerCase().trim();
  const limit = Math.min(Number(filters.limit) || 500, 1000);

  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
    q
      .select('id,user_id,created_at,updated_at,data')
      .eq('record_type', 'booking')
      .order('created_at', { ascending: false })
      .limit(limit),
  );

  let bookings = rows.map((b) => ({
    row_id: b.id,
    user_id: b.user_id,
    created_at: b.created_at,
    updated_at: b.updated_at,
    ...bookingFields(pickData(b) as Record<string, unknown>),
  }));

  if (search) {
    bookings = bookings.filter((b) => {
      const hay = [b.full_name, b.email, b.phone, b.style_name, b.id, b.user_id].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(search);
    });
  }

  bookings = await enrichRowsWithSalonMeta(supabase, bookings);

  return { bookings };
}

async function actionBookingDetail(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const bookingId = String(filters.booking_id || filters.id || '').trim();
  if (!bookingId) return { error: 'booking_id required' };

  let row: Record<string, unknown> | null = null;

  const byRowId = await supabase
    .from('styld_site_records')
    .select('id,user_id,created_at,updated_at,data')
    .eq('record_type', 'booking')
    .eq('id', bookingId)
    .maybeSingle();

  if (byRowId.data) {
    row = byRowId.data as Record<string, unknown>;
  } else {
    const byDataId = await supabase
      .from('styld_site_records')
      .select('id,user_id,created_at,updated_at,data')
      .eq('record_type', 'booking')
      .filter('data->>id', 'eq', bookingId)
      .maybeSingle();
    row = (byDataId.data as Record<string, unknown> | null) || null;
  }

  if (!row) return { error: 'Booking not found' };

  const userId = String(row.user_id || '');
  const raw = pickData(row) as Record<string, unknown>;
  const fields = bookingFields(raw);

  const [photoHairUrl, photoRefUrl, profile, settingsRows, userSite] = await Promise.all([
    signedBookingPhotoUrl(supabase, fields.photo_hair_path),
    signedBookingPhotoUrl(supabase, fields.photo_ref_path),
    userId ? supabase.from('profiles').select('*').eq('id', userId).maybeSingle() : Promise.resolve({ data: null }),
    userId
      ? safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
          q.select('*').eq('user_id', userId).eq('record_type', 'site_setting'),
        )
      : Promise.resolve([]),
    userId ? supabase.from('styld_user_sites').select('*').eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const siteSettings: Record<string, unknown> = {};
  for (const settingRow of settingsRows) {
    siteSettings[String(settingRow.record_key)] = pickData(settingRow);
  }

  const profileRow = (profile.data || {}) as Record<string, unknown>;
  const siteContent = (siteSettings.site_content || {}) as Record<string, unknown>;
  const sitePublish = (siteSettings.site_publish || {}) as Record<string, unknown>;
  const subdomain = String(
    sitePublish.subdomain || (userSite.data as Record<string, unknown> | null)?.subdomain || '',
  );

  return {
    booking: {
      row_id: row.id,
      user_id: userId || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...fields,
      photo_hair_url: photoHairUrl,
      photo_ref_url: photoRefUrl,
    },
    salon: userId
      ? {
          user_id: userId,
          brand_name: String(siteContent.brandName || profileRow.business_name || profileRow.full_name || 'Salon'),
          subdomain: subdomain || null,
          public_url: subdomain ? `https://${subdomain}.${ROOT_DOMAIN}` : null,
        }
      : null,
  };
}

async function actionClients(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const search = String(filters.search || '').toLowerCase().trim();
  const rows = await safeTable<{ user_id: string; data: unknown }>(supabase, 'styld_site_records', (q) =>
    q.select('user_id,data').eq('record_type', 'booking'),
  );

  const map = new Map<
    string,
    {
      user_id: string;
      client_name: string;
      email: string;
      phone: string;
      booking_count: number;
      last_booking_at: string | null;
      total_spend: number;
    }
  >();

  for (const row of rows) {
    const d = pickData(row) as Record<string, unknown> | null;
    const email = String(d?.email || '').trim();
    const phone = String(d?.phone || '').trim();
    const name = String(d?.full_name || '').trim();
    const key = `${row.user_id}::${email.toLowerCase()}::${phone}`;
    const existing = map.get(key);
    const total = Number(d?.estimated_total) || 0;
    const appt = String(d?.appointment_starts_at || '');
    if (!existing) {
      map.set(key, {
        user_id: String(row.user_id),
        client_name: name,
        email,
        phone,
        booking_count: 1,
        last_booking_at: appt || null,
        total_spend: total,
      });
    } else {
      existing.booking_count += 1;
      existing.total_spend += total;
      if (appt && (!existing.last_booking_at || appt > existing.last_booking_at)) {
        existing.last_booking_at = appt;
      }
    }
  }

  let clients = [...map.values()];
  if (search) {
    clients = clients.filter((c) => {
      const hay = [c.client_name, c.email, c.phone, c.user_id].join(' ').toLowerCase();
      return hay.includes(search);
    });
  }
  clients.sort((a, b) => b.booking_count - a.booking_count);
  const enriched = await enrichRowsWithSalonMeta(supabase, clients);
  return { clients: enriched };
}

async function actionCancellations(supabase: ReturnType<typeof adminClient>) {
  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_cancellation_events', (q) =>
    q.select('*').order('created_at', { ascending: false }).limit(500),
  );
  const enriched = await enrichRowsWithSalonMeta(supabase, rows);
  return { cancellations: enriched };
}

async function actionInquiries(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const search = String(filters.search || '').toLowerCase().trim();
  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
    q.select('id,user_id,created_at,data').eq('record_type', 'inquiry').order('created_at', { ascending: false }).limit(500),
  );
  let inquiries = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    data: pickData(r),
  }));
  if (search) {
    inquiries = inquiries.filter((r) => JSON.stringify(r.data).toLowerCase().includes(search));
  }
  inquiries = await enrichRowsWithSalonMeta(supabase, inquiries);
  return { inquiries };
}

async function actionReviews(supabase: ReturnType<typeof adminClient>) {
  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
    q.select('id,user_id,created_at,data').eq('record_type', 'review').order('created_at', { ascending: false }).limit(500),
  );
  const reviews = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    data: pickData(r),
  }));
  const enriched = await enrichRowsWithSalonMeta(supabase, reviews);
  return { reviews: enriched };
}

async function actionOnboarding(supabase: ReturnType<typeof adminClient>) {
  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
    q
      .select('id,user_id,created_at,data')
      .eq('record_type', 'site_setting')
      .eq('record_key', 'onboarding_responses')
      .order('created_at', { ascending: false }),
  );
  const responses = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    created_at: r.created_at,
    value: pickData(r),
  }));
  const enriched = await enrichRowsWithSalonMeta(supabase, responses);
  return { responses: enriched };
}

async function actionAnalytics(supabase: ReturnType<typeof adminClient>) {
  const events = await safeTable<Record<string, unknown>>(supabase, 'styld_analytics_events', (q) =>
    q.select('subdomain,path,referrer,device_type,session_id,created_at').order('created_at', { ascending: false }).limit(5000),
  );

  if (events.length) {
    const bySub = new Map<string, number>();
    const byPath = new Map<string, number>();
    const byDevice = new Map<string, number>();
    for (const e of events) {
      const sub = String(e.subdomain || '(unknown)');
      bySub.set(sub, (bySub.get(sub) || 0) + 1);
      const path = String(e.path || '/');
      byPath.set(path, (byPath.get(path) || 0) + 1);
      const dev = String(e.device_type || 'unknown');
      byDevice.set(dev, (byDevice.get(dev) || 0) + 1);
    }
    return {
      source: 'styld_analytics_events',
      total_events: events.length,
      by_subdomain: [...bySub.entries()].map(([subdomain, views]) => ({ subdomain, views })).sort((a, b) => b.views - a.views),
      top_paths: [...byPath.entries()].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, 20),
      by_device: [...byDevice.entries()].map(([device_type, views]) => ({ device_type, views })),
    };
  }

  const views = await safeTable<Record<string, unknown>>(supabase, 'styld_site_page_views', (q) =>
    q.select('subdomain,path,referrer,page_type,created_at').order('created_at', { ascending: false }).limit(5000),
  );
  const bySub = new Map<string, number>();
  const byPath = new Map<string, number>();
  for (const v of views) {
    const sub = String(v.subdomain || '(unknown)');
    bySub.set(sub, (bySub.get(sub) || 0) + 1);
    const path = String(v.path || '/');
    byPath.set(path, (byPath.get(path) || 0) + 1);
  }
  return {
    source: 'styld_site_page_views',
    total_events: views.length,
    by_subdomain: [...bySub.entries()].map(([subdomain, views]) => ({ subdomain, views })).sort((a, b) => b.views - a.views),
    top_paths: [...byPath.entries()].map(([path, views]) => ({ path, views })).sort((a, b) => b.views - a.views).slice(0, 20),
    by_device: [],
  };
}

async function actionExport(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const type = String(filters.type || 'bookings');
  if (type === 'onboarding') {
    const data = await actionOnboarding(supabase);
    return data;
  }
  return actionBookings(supabase, { ...filters, limit: 2000 });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const pinCheck = verifyPin(req, body.pin);
  if (!pinCheck.ok) {
    return json(
      {
        error: pinCheck.locked ? 'Too many attempts. Try again later.' : 'Invalid PIN',
        locked: !!pinCheck.locked,
        retryAfterMs: pinCheck.locked ? pinCheck.retryAfterMs : undefined,
      },
      pinCheck.locked ? 429 : 401,
    );
  }

  const supabase = adminClient();
  const action = String(body.action || 'overview');
  const filters = body.filters || {};

  try {
    switch (action) {
      case 'overview':
        return json(await actionOverview(supabase));
      case 'styld_revenue':
        return json(await actionStyldRevenue(supabase, filters));
      case 'users':
        return json(await actionUsers(supabase, filters));
      case 'user_detail':
        return json(await actionUserDetail(supabase, filters));
      case 'bookings':
        return json(await actionBookings(supabase, filters));
      case 'booking_detail':
        return json(await actionBookingDetail(supabase, filters));
      case 'emails':
        return json(await actionEmails(supabase, filters));
      case 'email_detail':
        return json(await actionEmailDetail(supabase, filters));
      case 'clients':
        return json(await actionClients(supabase, filters));
      case 'cancellations':
        return json(await actionCancellations(supabase));
      case 'inquiries':
        return json(await actionInquiries(supabase, filters));
      case 'reviews':
        return json(await actionReviews(supabase));
      case 'onboarding':
        return json(await actionOnboarding(supabase));
      case 'analytics':
        return json(await actionAnalytics(supabase));
      case 'export':
        return json(await actionExport(supabase, filters));
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
