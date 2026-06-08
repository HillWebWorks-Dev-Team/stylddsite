/**
 * Injects public runtime config from Vercel / local env into js/*.local.js files.
 * Reads: STYLD_SUPABASE_URL, STYLD_SUPABASE_ANON_KEY, STYLD_ROOT_DOMAIN, STRIPE_PUBLISHABLE_KEY
 * Also accepts NEXT_PUBLIC_* aliases for compatibility.
 */
const fs = require('fs');
const path = require('path');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function env(name, alt) {
  const val = process.env[name] || (alt ? process.env[alt] : '') || '';
  return String(val).trim();
}

const root = path.join(__dirname, '..');
loadDotEnv(path.join(root, '.env'));
loadDotEnv(path.join(root, '.env.local'));

const supabaseUrl = env('STYLD_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = env('STYLD_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const rootDomain = env('STYLD_ROOT_DOMAIN', 'EXPO_PUBLIC_STYLD_ROOT_DOMAIN') || 'styldd.com';
const stripePk = env('STRIPE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'vercel-build-inject: STYLD_SUPABASE_URL / STYLD_SUPABASE_ANON_KEY missing — tenant sites may not load data.',
  );
}

const tenantLocal = `/* Generated at build — do not edit. See scripts/vercel-build-inject.cjs */
(function () {
  window.__STYLD_TENANT__ = window.__STYLD_TENANT__ || {};
  window.__STYLD_TENANT__.supabaseUrl = ${JSON.stringify(supabaseUrl)};
  window.__STYLD_TENANT__.supabaseAnonKey = ${JSON.stringify(supabaseAnonKey)};
  window.__STYLD_TENANT__.rootDomain = ${JSON.stringify(rootDomain)};
  window.__STYLD_TENANT__.marketingUrl = "https://" + ${JSON.stringify(rootDomain)};
  window.__STYLD_TENANT__.stripePk = ${JSON.stringify(stripePk)};
})();
`;

const marketingLocal = `/* Generated at build — do not edit. See scripts/vercel-build-inject.cjs */
(function () {
  window.__STYLD_MARKETING__ = window.__STYLD_MARKETING__ || {};
  window.__STYLD_MARKETING__.supabaseUrl = ${JSON.stringify(supabaseUrl)};
  window.__STYLD_MARKETING__.supabaseAnonKey = ${JSON.stringify(supabaseAnonKey)};
  window.__STYLD_MARKETING__.rootDomain = ${JSON.stringify(rootDomain)};
})();
`;

fs.writeFileSync(path.join(root, 'js', 'styld-tenant-config.local.js'), tenantLocal);
fs.writeFileSync(path.join(root, 'js', 'marketing-config.local.js'), marketingLocal);
console.log('Injected runtime config for root domain:', rootDomain);
