/**
 * Website traffic analytics — analytics-summary edge fn + RPC fallback (Part 7).
 */
import { getStudioClient, invokeFunction } from './studio-api.js';

const EMPTY_SUMMARY = {
  subdomain: null,
  views7d: 0,
  views30d: 0,
  sessions7d: 0,
  sessions30d: 0,
  topPages: [],
  referrers: [],
  devices: { mobile: 0, tablet: 0, desktop: 0 },
  dailyTrend: [],
};

function normalizeSummary(raw) {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_SUMMARY };
  const devices = raw.devices || {};
  return {
    subdomain: raw.subdomain ?? null,
    views7d: Number(raw.views7d ?? raw.views_7d) || 0,
    views30d: Number(raw.views30d ?? raw.views_30d) || 0,
    sessions7d: Number(raw.sessions7d ?? raw.sessions_7d) || 0,
    sessions30d: Number(raw.sessions30d ?? raw.sessions_30d) || 0,
    topPages: Array.isArray(raw.topPages)
      ? raw.topPages
      : Array.isArray(raw.top_paths)
        ? raw.top_paths.map(function (p) {
            return { path: p.path, views: p.views };
          })
        : [],
    referrers: Array.isArray(raw.referrers) ? raw.referrers : [],
    devices: {
      mobile: Number(devices.mobile) || 0,
      tablet: Number(devices.tablet) || 0,
      desktop: Number(devices.desktop) || 0,
    },
    dailyTrend: Array.isArray(raw.dailyTrend)
      ? raw.dailyTrend
      : Array.isArray(raw.daily_views)
        ? raw.daily_views.map(function (d) {
            return { date: d.date || d.day, views: d.views || 0, sessions: d.sessions || 0 };
          })
        : [],
  };
}

function summaryFromRpc(data7, data30, subdomain) {
  const daily = Array.isArray(data30?.daily) ? data30.daily : [];
  const topPages = Array.isArray(data30?.top_pages) ? data30.top_pages : [];
  const views7 = Number(data7?.total_views) || 0;
  const views30 = Number(data30?.total_views) || 0;

  return {
    subdomain: subdomain,
    views7d: views7,
    views30d: views30,
    sessions7d: views7,
    sessions30d: views30,
    topPages: topPages.map(function (p) {
      return { path: p.path, views: p.views };
    }),
    referrers: [],
    devices: { mobile: 0, tablet: 0, desktop: 0 },
    dailyTrend: daily.map(function (d) {
      return { date: d.day, views: d.views || 0, sessions: d.views || 0 };
    }),
  };
}

async function fetchViaRpc(subdomain) {
  const client = await getStudioClient();
  const [res7, res30] = await Promise.all([
    client.rpc('get_site_analytics_summary', { p_days: 7 }),
    client.rpc('get_site_analytics_summary', { p_days: 30 }),
  ]);
  if (res7.error && res30.error) throw res7.error || res30.error;
  return summaryFromRpc(res7.data, res30.data, subdomain);
}

export async function fetchBusinessAnalytics(ctx) {
  const subdomain =
    ctx?.subdomain?.subdomain || ctx?.sitePublish?.subdomain || null;
  const published = Boolean(ctx?.publishedAt);

  if (!published || !subdomain) {
    return { ...EMPTY_SUMMARY, subdomain: null };
  }

  try {
    const data = await invokeFunction('analytics-summary', {});
    if (data && !data.error) return normalizeSummary(data);
  } catch (_) {}

  try {
    return await fetchViaRpc(subdomain);
  } catch (_) {
    return { ...EMPTY_SUMMARY, subdomain: subdomain };
  }
}
