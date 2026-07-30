/** Print heroDescription vs aboutBody for a subdomain. */
const fs = require('fs');
const path = require('path');

const cfgText = fs.readFileSync(path.join(__dirname, '../js/styld-tenant-config.local.js'), 'utf8');
const url = cfgText.match(/supabaseUrl = "([^"]+)"/)[1];
const key = cfgText.match(/supabaseAnonKey = "([^"]+)"/)[1];
const headers = { apikey: key, Authorization: 'Bearer ' + key };

const subdomain = process.argv[2] || 'trial2';

async function main() {
  const subRes = await fetch(
    url + '/rest/v1/styld_site_subdomains?subdomain=eq.' + encodeURIComponent(subdomain) + '&select=user_id',
    { headers },
  );
  const subRows = await subRes.json();
  if (!subRows[0]) {
    console.error('Subdomain not found:', subdomain);
    process.exit(1);
  }

  const recRes = await fetch(
    url +
      '/rest/v1/styld_site_records?user_id=eq.' +
      encodeURIComponent(subRows[0].user_id) +
      '&record_type=eq.site_setting&record_key=eq.site_content&select=data',
    { headers },
  );
  const recRows = await recRes.json();
  const c = (recRows[0] && recRows[0].data) || {};
  const content = c && typeof c === 'object' && c.value != null && typeof c.value === 'object' ? c.value : c;

  console.log('Subdomain:', subdomain);
  console.log('heroDescription:', JSON.stringify(content.heroDescription || ''));
  console.log('aboutBody:', JSON.stringify(content.aboutBody || ''));
  console.log('aboutTitle:', JSON.stringify(content.aboutTitle || ''));
  console.log('menuBlurb:', JSON.stringify(content.menuBlurb || ''));
  console.log('keys:', Object.keys(content).slice(0, 30).join(', '));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
