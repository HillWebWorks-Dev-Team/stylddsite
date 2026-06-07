(function () {
  var cfg = window.__STYLD_TENANT__ || {};
  if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
    window.__SALON_SITE_SUPABASE = {
      url: cfg.supabaseUrl,
      anonKey: cfg.supabaseAnonKey,
    };
  }
})();
