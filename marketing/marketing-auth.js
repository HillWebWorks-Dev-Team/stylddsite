(function (global) {
  var SESSION_KEY = 'styld_pro_session';

  function cfg() {
    return global.__STYLD_MARKETING__ || {};
  }

  function baseUrl() {
    return String(cfg().supabaseUrl || '').replace(/\/$/, '');
  }

  function anonKey() {
    return cfg().supabaseAnonKey || '';
  }

  function authHeaders(token) {
    var key = anonKey();
    return {
      apikey: key,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    };
  }

  function readSupabaseSession() {
    try {
      var raw = localStorage.getItem('styld_studio_auth');
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.access_token) return data;
      if (data && data.currentSession && data.currentSession.access_token) return data.currentSession;
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        var session = JSON.parse(raw);
        if (session && session.access_token) return session;
      }
    } catch (e) {
      /* ignore */
    }
    return readSupabaseSession();
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    updateAuthNavLinks();
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    updateAuthNavLinks();
  }

  function isExpired(session) {
    if (!session || !session.expires_at) return false;
    return Date.now() / 1000 >= Number(session.expires_at) - 30;
  }

  function refreshSession() {
    var session = getSession();
    if (!session || !session.refresh_token) {
      return Promise.reject(new Error('not_authenticated'));
    }
    var url = baseUrl();
    var key = anonKey();
    if (!url || !key) return Promise.reject(new Error('not_configured'));

    return fetch(url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            clearSession();
            throw new Error(data.msg || data.error_description || 'Session expired');
          }
          var next = {
            access_token: data.access_token,
            refresh_token: data.refresh_token || session.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
            user: data.user || session.user,
          };
          setSession(next);
          return next;
        });
      });
  }

  function ensureSession() {
    var session = getSession();
    if (!session) return Promise.reject(new Error('not_authenticated'));
    if (!isExpired(session)) return Promise.resolve(session);
    return refreshSession();
  }

  function signInWithPassword(email, password) {
    var url = baseUrl();
    var key = anonKey();
    if (!url || !key) return Promise.reject(new Error('not_configured'));

    return fetch(url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify({ email: String(email || '').trim(), password: password || '' }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.msg || data.error_description || 'Sign in failed');
        }
        var session = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
          user: data.user,
        };
        setSession(session);
        return session;
      });
    });
  }

  function requestPasswordReset(email) {
    var url = baseUrl();
    var key = anonKey();
    if (!url || !key) return Promise.reject(new Error('not_configured'));
    var redirectTo =
      (global.location && global.location.origin ? global.location.origin : 'https://styldd.com') + '/login';

    return fetch(url + '/auth/v1/recover', {
      method: 'POST',
      headers: authHeaders(key),
      body: JSON.stringify({ email: String(email || '').trim(), redirect_to: redirectTo }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.msg || data.error_description || 'Could not send reset email');
        }
        return data;
      });
    });
  }

  function signOut() {
    var session = getSession();
    clearSession();
    var url = baseUrl();
    var key = anonKey();
    if (!session || !url || !key) return Promise.resolve();
    return fetch(url + '/auth/v1/logout', {
      method: 'POST',
      headers: authHeaders(session.access_token),
      body: JSON.stringify({ scope: 'local' }),
    }).catch(function () {
      /* ignore */
    });
  }

  function ownerDashboard() {
    return ensureSession().then(function (session) {
      var url = baseUrl();
      var key = anonKey();
      if (!url || !key) return Promise.reject(new Error('not_configured'));

      return fetch(url + '/functions/v1/styld-admin-dashboard', {
        method: 'POST',
        headers: authHeaders(session.access_token),
        body: JSON.stringify({ action: 'owner_dashboard' }),
      }).then(function (res) {
        return res.json().then(function (data) {
          if (res.status === 401) {
            clearSession();
            throw new Error('not_authenticated');
          }
          if (!res.ok) {
            throw new Error(data.error || 'Could not load dashboard');
          }
          return data;
        });
      });
    });
  }

  function updateAuthNavLinks() {
    var session = getSession();
    var loggedIn = !!session;
    document.querySelectorAll('[data-auth-link="login"]').forEach(function (el) {
      el.hidden = loggedIn;
    });
    document.querySelectorAll('[data-auth-link="dashboard"]').forEach(function (el) {
      el.hidden = !loggedIn;
    });
  }

  function requireAuth(loginPath) {
    loginPath = loginPath || '/login';
    return ensureSession().catch(function () {
      var next = global.location.pathname + global.location.search;
      global.location.href = loginPath + '?next=' + encodeURIComponent(next);
      return Promise.reject(new Error('redirecting'));
    });
  }

  global.StyldMarketingAuth = {
    getSession: getSession,
    ensureSession: ensureSession,
    signInWithPassword: signInWithPassword,
    requestPasswordReset: requestPasswordReset,
    signOut: signOut,
    ownerDashboard: ownerDashboard,
    requireAuth: requireAuth,
    updateAuthNavLinks: updateAuthNavLinks,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateAuthNavLinks);
  } else {
    updateAuthNavLinks();
  }

  window.addEventListener('storage', function (e) {
    if (e.key === SESSION_KEY || e.key === 'styld_studio_auth') {
      updateAuthNavLinks();
    }
  });
})(window);
