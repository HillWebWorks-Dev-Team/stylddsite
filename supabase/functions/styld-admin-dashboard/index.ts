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
  if (!key) return { status: 'unknown', message: 'Configure REVENUECAT_SECRET_API_KEY' };
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return { status: 'error', message: `RevenueCat ${res.status}` };
    const body = await res.json();
    const entitlements = body?.subscriber?.entitlements || {};
    const pro = entitlements.pro;
    if (pro && pro.expires_date) {
      const active = new Date(pro.expires_date) > new Date();
      return {
        status: active ? 'active' : 'expired',
        product: pro.product_identifier ?? null,
        expires_date: pro.expires_date,
        store: pro.store ?? null,
      };
    }
    return { status: 'none', product: null, expires_date: null, store: null };
  } catch (e) {
    return { status: 'error', message: String(e) };
  }
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
    bookings,
    inquiries,
    reviews,
    stripeAccounts,
  ] = await Promise.all([
    safeTable<{ id: string }>(supabase, 'profiles', (q) => q.select('id')),
    safeTable<{ user_id: string; published_at: string | null }>(supabase, 'styld_user_sites', (q) =>
      q.select('user_id,published_at'),
    ),
    safeTable<{ user_id: string; data: unknown }>(supabase, 'styld_site_records', (q) =>
      q.select('user_id,data').eq('record_type', 'booking'),
    ),
    safeTable(supabase, 'styld_site_records', (q) => q.select('id').eq('record_type', 'inquiry')),
    safeTable(supabase, 'styld_site_records', (q) => q.select('id').eq('record_type', 'review')),
    safeTable<{ charges_enabled: boolean | null }>(supabase, 'styld_stripe_accounts', (q) =>
      q.select('charges_enabled'),
    ),
  ]);

  const publishedSites = userSites.filter((s) => s.published_at).length;
  const stripeLive = stripeAccounts.filter((s) => s.charges_enabled).length;

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

  return {
    total_stylists: profiles.length,
    published_sites: publishedSites,
    draft_sites: Math.max(0, profiles.length - publishedSites),
    total_bookings: bookings.length,
    unique_clients_per_stylist: clientKeys.size,
    unique_clients_global: globalClients.size,
    total_inquiries: inquiries.length,
    total_reviews: reviews.length,
    stripe_merchants_live: stripeLive,
    subscriptions_note: Deno.env.get('REVENUECAT_SECRET_API_KEY')
      ? 'RevenueCat configured — see Users tab'
      : 'Subscription unknown — configure REVENUECAT_SECRET_API_KEY',
  };
}

async function actionUsers(supabase: ReturnType<typeof adminClient>, filters: Record<string, unknown>) {
  const search = String(filters.search || '')
    .toLowerCase()
    .trim();

  const [profiles, userSites, subdomains, stripeRows, settingsRows, bookingRows, recordCounts, pushRows, pageViews, authMap] =
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

  users.sort((a, b) => (b.total_revenue as number) - (a.total_revenue as number));

  const rcKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (rcKey && users.length <= 50) {
    await Promise.all(
      users.map(async (u) => {
        u.subscription = (await fetchRevenueCatStatus(u.user_id)) as typeof u.subscription;
      }),
    );
  } else if (!rcKey) {
    users.forEach((u) => {
      u.subscription = { status: 'unknown', message: 'Configure REVENUECAT_SECRET_API_KEY' } as typeof u.subscription;
    });
  }

  return { users };
}

function deriveClientsFromBookings(bookings: Record<string, unknown>[]) {
  const map = new Map<
    string,
    {
      client_name: string;
      email: string;
      phone: string;
      booking_count: number;
      total_spend: number;
      last_booking_at: string | null;
    }
  >();
  for (const b of bookings) {
    const email = String(b.email || '').trim();
    const phone = String(b.phone || '').trim();
    const name = String(b.full_name || '').trim();
    const key = `${email.toLowerCase()}::${phone}`;
    const rev = revenueFromBookingData(b);
    const appt = String(b.appointment_starts_at || '');
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        client_name: name,
        email,
        phone,
        booking_count: 1,
        total_spend: rev.gross,
        last_booking_at: appt || null,
      });
    } else {
      existing.booking_count += 1;
      existing.total_spend += rev.gross;
      if (appt && (!existing.last_booking_at || appt > existing.last_booking_at)) {
        existing.last_booking_at = appt;
      }
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
  };
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

  return { bookings };
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
  return { clients };
}

async function actionCancellations(supabase: ReturnType<typeof adminClient>) {
  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_cancellation_events', (q) =>
    q.select('*').order('created_at', { ascending: false }).limit(500),
  );
  return { cancellations: rows };
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
  return { inquiries };
}

async function actionReviews(supabase: ReturnType<typeof adminClient>) {
  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
    q.select('id,user_id,created_at,data').eq('record_type', 'review').order('created_at', { ascending: false }).limit(500),
  );
  return {
    reviews: rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      created_at: r.created_at,
      data: pickData(r),
    })),
  };
}

async function actionOnboarding(supabase: ReturnType<typeof adminClient>) {
  const rows = await safeTable<Record<string, unknown>>(supabase, 'styld_site_records', (q) =>
    q
      .select('id,user_id,created_at,data')
      .eq('record_type', 'site_setting')
      .eq('record_key', 'onboarding_responses')
      .order('created_at', { ascending: false }),
  );
  return {
    responses: rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      created_at: r.created_at,
      value: pickData(r),
    })),
  };
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
      case 'users':
        return json(await actionUsers(supabase, filters));
      case 'user_detail':
        return json(await actionUserDetail(supabase, filters));
      case 'bookings':
        return json(await actionBookings(supabase, filters));
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
