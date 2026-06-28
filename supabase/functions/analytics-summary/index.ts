import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function verifyUserJwt(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (anonKey && token === anonKey) return null;

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

function parseReferrerHost(referrer: string | null | undefined) {
  const raw = String(referrer || '').trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    if (!host || host.includes('styldd.com')) return null;
    return host.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

function deviceBucket(deviceType: string) {
  const d = String(deviceType || 'unknown').toLowerCase();
  if (d === 'mobile') return 'mobile';
  if (d === 'tablet') return 'tablet';
  if (d === 'desktop') return 'desktop';
  return 'unknown';
}

type EventRow = {
  path?: string;
  referrer?: string | null;
  device_type?: string;
  session_id?: string | null;
  created_at?: string;
};

function aggregateEvents(events: EventRow[], subdomain: string | null) {
  const now = Date.now();
  const dayMs = 86400000;
  let views7d = 0;
  let views30d = 0;
  const sessions7 = new Set<string>();
  const sessions30 = new Set<string>();
  const pathMap = new Map<string, number>();
  const refMap = new Map<string, number>();
  const deviceCounts = { mobile: 0, tablet: 0, desktop: 0, unknown: 0 };
  const dailyMap = new Map<string, { views: number; sessions: Set<string> }>();

  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now - i * dayMs);
    dailyMap.set(d.toISOString().slice(0, 10), { views: 0, sessions: new Set() });
  }

  for (const e of events) {
    const created = String(e.created_at || '');
    const t = new Date(created).getTime();
    if (isNaN(t)) continue;
    const age = now - t;
    const sid = String(e.session_id || created + (e.path || '/'));

    if (age <= 7 * dayMs) {
      views7d += 1;
      sessions7.add(sid);
    }
    if (age <= 30 * dayMs) {
      views30d += 1;
      sessions30.add(sid);
      const day = created.slice(0, 10);
      const bucket = dailyMap.get(day);
      if (bucket) {
        bucket.views += 1;
        bucket.sessions.add(sid);
      }
      const path = String(e.path || '/');
      pathMap.set(path, (pathMap.get(path) || 0) + 1);
      const refHost = parseReferrerHost(e.referrer);
      if (refHost) refMap.set(refHost, (refMap.get(refHost) || 0) + 1);
      const dev = deviceBucket(String(e.device_type || 'unknown'));
      if (dev in deviceCounts) deviceCounts[dev as keyof typeof deviceCounts] += 1;
      else deviceCounts.unknown += 1;
    }
  }

  const deviceTotal = deviceCounts.mobile + deviceCounts.tablet + deviceCounts.desktop;
  const devices =
    deviceTotal > 0
      ? {
          mobile: Math.round((deviceCounts.mobile / deviceTotal) * 100),
          tablet: Math.round((deviceCounts.tablet / deviceTotal) * 100),
          desktop: Math.round((deviceCounts.desktop / deviceTotal) * 100),
        }
      : { mobile: 0, tablet: 0, desktop: 0 };

  const dailyTrend = [...dailyMap.entries()].map(([date, v]) => ({
    date,
    views: v.views,
    sessions: v.sessions.size,
  }));

  return {
    subdomain,
    views7d,
    views30d,
    sessions7d: sessions7.size,
    sessions30d: sessions30.size,
    topPages: [...pathMap.entries()]
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 8),
    referrers: [...refMap.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    devices,
    dailyTrend,
  };
}

async function loadEvents(
  supabase: ReturnType<typeof adminClient>,
  subdomain: string,
): Promise<EventRow[]> {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const analyticsRes = await supabase
    .from('styld_analytics_events')
    .select('path,referrer,device_type,session_id,created_at')
    .eq('subdomain', subdomain)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (!analyticsRes.error && analyticsRes.data?.length) {
    return analyticsRes.data as EventRow[];
  }

  const pageViewsRes = await supabase
    .from('styld_site_page_views')
    .select('path,referrer,page_type,created_at')
    .eq('subdomain', subdomain)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000);

  if (pageViewsRes.error || !pageViewsRes.data) return [];

  return pageViewsRes.data.map((row) => ({
    path: row.path,
    referrer: row.referrer,
    device_type: 'unknown',
    session_id: null,
    created_at: row.created_at,
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const userId = await verifyUserJwt(req);
  if (!userId) return json({ error: 'unauthorized' }, 401);

  const supabase = adminClient();
  const { data: subRow, error: subError } = await supabase
    .from('styld_site_subdomains')
    .select('subdomain,published_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (subError) return json({ error: subError.message }, 500);

  if (!subRow?.subdomain || !subRow.published_at) {
    return json({
      subdomain: null,
      views7d: 0,
      views30d: 0,
      sessions7d: 0,
      sessions30d: 0,
      topPages: [],
      referrers: [],
      devices: { mobile: 0, tablet: 0, desktop: 0 },
      dailyTrend: [],
    });
  }

  const events = await loadEvents(supabase, subRow.subdomain);
  return json(aggregateEvents(events, subRow.subdomain));
});
