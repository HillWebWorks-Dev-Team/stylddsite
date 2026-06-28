/**
 * Edge function HTTP helper — no imports from studio-api (avoids circular deps).
 */

function marketingCfg() {
  return window.__STYLD_MARKETING__ || {};
}

function readAccessToken() {
  const keys = ['styld_studio_auth', 'styld_pro_session'];
  for (let i = 0; i < keys.length; i++) {
    try {
      const raw = localStorage.getItem(keys[i]);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.access_token) return parsed.access_token;
      if (parsed && parsed.currentSession && parsed.currentSession.access_token) {
        return parsed.currentSession.access_token;
      }
    } catch (_) {
      /* try next key */
    }
  }
  return null;
}

export async function invokeEdgeFunction(name, body, options) {
  options = options || {};
  const cfg = marketingCfg();
  const url = String(cfg.supabaseUrl || '').replace(/\/$/, '');
  const key = cfg.supabaseAnonKey || '';
  const token = readAccessToken();

  if (!url || !key) throw new Error('not_configured');
  if (!token) throw new Error('not_authenticated');

  const timeoutMs = options.timeoutMs != null ? options.timeoutMs : 15000;
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url + '/functions/v1/' + name, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });

    const data = await res.json().catch(function () {
      return {};
    });

    if (!res.ok) {
      throw new Error(data.error || data.msg || 'Request failed');
    }
    return data;
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('request_timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export { readAccessToken, marketingCfg };
