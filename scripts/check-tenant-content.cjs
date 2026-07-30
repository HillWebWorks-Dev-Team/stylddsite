/** Quick check: trialsyldd About/Policies content (same fields as profile-content.js). */
const fs = require('fs');
const path = require('path');

const cfgText = fs.readFileSync(path.join(__dirname, '../js/styld-tenant-config.local.js'), 'utf8');
const url = cfgText.match(/supabaseUrl = "([^"]+)"/)[1];
const key = cfgText.match(/supabaseAnonKey = "([^"]+)"/)[1];
const headers = { apikey: key, Authorization: 'Bearer ' + key };

const subdomain = process.argv[2] || 'trialsyldd';

function resolveAboutMeText(content) {
  var text = String(content.heroDescription || content.hero_description || '').trim();
  if (text === 'Welcome — book online and pay securely.') return '';
  return text;
}

function resolveBookingPolicyText(content) {
  return String(content.bookingPolicy || content.booking_policy || '').trim();
}

async function main() {
  const subRes = await fetch(
    url +
      '/rest/v1/styld_site_subdomains?subdomain=eq.' +
      encodeURIComponent(subdomain) +
      '&select=user_id,published_at',
    { headers },
  );
  const subRows = await subRes.json();
  if (!subRows[0]) {
    console.error('Subdomain not found:', subdomain);
    process.exit(1);
  }

  const uid = subRows[0].user_id;
  const recRes = await fetch(
    url +
      '/rest/v1/styld_site_records?user_id=eq.' +
      encodeURIComponent(uid) +
      '&record_type=eq.site_setting&record_key=eq.site_content&select=data',
    { headers },
  );
  const recRows = await recRes.json();
  const raw = recRows[0] && recRows[0].data != null ? recRows[0].data : recRows[0];
  const content = raw && typeof raw === 'object' ? raw : {};

  const aboutText = resolveAboutMeText(content);
  const policyText = resolveBookingPolicyText(content);
  const hidden = Array.isArray(content.hiddenSections) ? content.hiddenSections : [];

  console.log('Subdomain:', subdomain);
  console.log('Published:', !!subRows[0].published_at);
  console.log('About text length:', aboutText.length, aboutText ? '(has text)' : '(EMPTY — section hidden on site)');
  console.log('Policy text length:', policyText.length, policyText ? '(has text)' : '(EMPTY — section hidden on site)');
  console.log('hiddenSections:', hidden.join(', ') || '(none)');
  console.log('mainSectionOrder:', JSON.stringify(content.mainSectionOrder || content.main_section_order || null));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
