/** In-memory site preview HTML for studio editor (iframe srcdoc). */

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mediaUrl(supabaseUrl, path) {
  if (!path || !supabaseUrl) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + String(path).replace(/^\/+/, '');
}

function isHidden(content, section) {
  return Array.isArray(content.hiddenSections) && content.hiddenSections.indexOf(section) !== -1;
}

export function buildSitePreviewHtml(ctx) {
  const content = ctx.content || {};
  const theme = ctx.theme || {};
  const styles = ctx.styles || [];
  const supabaseUrl = ctx.supabaseUrl || '';
  const primary = theme.primaryColor || '#db2777';
  const secondary = theme.secondaryColor || '#1a1a1a';
  const bg = theme.backgroundColor || '#faf8f5';
  const heroUrl = mediaUrl(supabaseUrl, theme.heroImagePath);
  const logoUrl = mediaUrl(supabaseUrl, theme.logoImagePath);

  const menuCards = styles
    .slice(0, 6)
    .map(function (s) {
      return (
        '<article class="card">' +
        (s.imageUrl
          ? '<div class="card-img" style="background-image:url(' + esc(s.imageUrl) + ')"></div>'
          : '') +
        '<h4>' +
        esc(s.title) +
        '</h4>' +
        (s.priceLabel ? '<p class="price">' + esc(s.priceLabel) + '</p>' : '') +
        '</article>'
      );
    })
    .join('');

  const faq = (content.faqItems || [])
    .slice(0, 4)
    .map(function (item) {
      return '<details><summary>' + esc(item.question) + '</summary><p>' + esc(item.answer) + '</p></details>';
    })
    .join('');

  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Inter,system-ui,sans-serif;background:' +
    esc(bg) +
    ';color:' +
    esc(secondary) +
    ';line-height:1.5}.nav{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:' +
    esc(theme.navbarColor || bg) +
    ';border-bottom:1px solid rgba(0,0,0,.08)}.brand{font-weight:700;font-size:1rem}.hero{padding:24px 16px;display:grid;gap:16px}.hero-img{height:180px;border-radius:12px;background:#ddd center/cover no-repeat}.hero h1{font-size:1.6rem;line-height:1.15}.hero h1 span{color:' +
    esc(primary) +
    '}.section{padding:16px;border-top:1px solid rgba(0,0,0,.06)}.section h2{font-size:1.1rem;margin-bottom:8px}.grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.card{border:1px solid rgba(0,0,0,.08);border-radius:10px;overflow:hidden;background:#fff}.card-img{height:90px;background:#eee center/cover}.card h4{font-size:.85rem;padding:8px 8px 0}.card .price{font-size:.8rem;padding:0 8px 8px;color:' +
    esc(primary) +
    '}details{margin-top:8px}summary{cursor:pointer;font-weight:600}.cta{display:inline-block;margin-top:12px;padding:10px 16px;border-radius:999px;background:' +
    esc(primary) +
    ';color:#fff;text-decoration:none;font-weight:700;font-size:.85rem}</style></head><body>' +
    '<header class="nav"><div class="brand">' +
    (logoUrl ? '<img src="' + esc(logoUrl) + '" alt="" height="28" style="vertical-align:middle;margin-right:8px">' : '') +
    esc(content.brandName || 'Your brand') +
    '</div>' +
    (theme.hideBookNowButton ? '' : '<span class="cta" style="margin:0">Book now</span>') +
    '</header>' +
    '<section class="hero">' +
    (heroUrl ? '<div class="hero-img" style="background-image:url(' + esc(heroUrl) + ')"></div>' : '') +
    '<h1>' +
    esc(content.taglineLeft || 'Book') +
    ' <span>' +
    esc(content.taglineRightLine1 || 'your') +
    '</span> ' +
    esc(content.taglineRightLine2 || 'look') +
    '</h1>' +
    (content.heroDescription ? '<p>' + esc(content.heroDescription) + '</p>' : '') +
    '</section>' +
    (!isHidden(content, 'menu')
      ? '<section class="section"><h2>' +
        esc(content.menuTitle || 'Services') +
        '</h2>' +
        (content.menuBlurb ? '<p style="margin-bottom:10px;opacity:.7">' + esc(content.menuBlurb) + '</p>' : '') +
        '<div class="grid">' +
        (menuCards || '<p style="opacity:.6">Add services in Styles settings (Part 6).</p>') +
        '</div></section>'
      : '') +
    (!isHidden(content, 'aboutMe')
      ? '<section class="section"><h2>' +
        esc(content.aboutTitle || 'About') +
        '</h2><p>' +
        esc(content.aboutBody || content.heroDescription || '') +
        '</p></section>'
      : '') +
    (!isHidden(content, 'faq') && faq
      ? '<section class="section"><h2>' +
        esc(content.faqTitle || 'FAQ') +
        '</h2>' +
        faq +
        '</section>'
      : '') +
    '<footer class="section" style="font-size:.75rem;opacity:.55">' +
    esc(content.footerText || content.brandName || '') +
    '</footer></body></html>'
  );
}
