/** Normalize site JSON to shapes tenant JS expects. */

const FONT_IDS = ['cormorant', 'playfair', 'inter', 'dm-sans', 'montserrat', 'lora', 'poppins', 'nunito'];
const HERO_LAYOUTS = ['split', 'stack', 'cover', 'image-below', 'minimal'];
const SECTION_IDS = ['menu', 'about', 'visit', 'aboutMe', 'policies', 'portfolio', 'certifications', 'products', 'faq'];
const MAIN_SECTION_ORDER_IDS = ['aboutMe', 'policies', 'reviews', 'portfolio', 'menu', 'faq', 'visit'];
const LOCATION_PARTS = ['address', 'map', 'contact', 'social'];

function normalizeMainSectionOrder(raw) {
  if (!Array.isArray(raw)) return null;
  const seen = {};
  const order = [];
  raw.forEach(function (item) {
    const id = str(item);
    if (!id || MAIN_SECTION_ORDER_IDS.indexOf(id) === -1 || seen[id]) return;
    seen[id] = true;
    order.push(id);
  });
  return order.length ? order : null;
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

function arr(v) {
  return Array.isArray(v) ? v.slice() : [];
}

export function normalizeFaqItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(function (item) {
      if (!item || typeof item !== 'object') return null;
      const question = str(item.question);
      const answer = str(item.answer);
      if (!question) return null;
      return { question: question, answer: answer };
    })
    .filter(Boolean);
}

export function normalizePortfolioItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(function (item) {
      if (!item || typeof item !== 'object') return null;
      const storagePath = str(item.storagePath || item.storage_path);
      if (!storagePath) return null;
      const mediaType = item.mediaType === 'video' ? 'video' : 'image';
      return { storagePath: storagePath, mediaType: mediaType };
    })
    .filter(Boolean)
    .slice(0, 24);
}

export function normalizeCertificationItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(function (item) {
      if (!item || typeof item !== 'object') return null;
      const storagePath = str(item.storagePath || item.storage_path);
      if (!storagePath) return null;
      return {
        storagePath: storagePath,
        mediaType: item.mediaType === 'video' ? 'video' : 'image',
        caption: str(item.caption),
      };
    })
    .filter(Boolean)
    .slice(0, 24);
}

export function normalizeSiteContent(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    brandName: str(r.brandName),
    taglineLeft: str(r.taglineLeft),
    taglineRightLine1: str(r.taglineRightLine1),
    taglineRightLine2: str(r.taglineRightLine2),
    heroDescription: str(r.heroDescription),
    footerText: str(r.footerText),
    metaDescription: str(r.metaDescription),
    bookingPolicy: str(r.bookingPolicy),
    menuTitle: str(r.menuTitle) || 'Services',
    menuBlurb: str(r.menuBlurb),
    aboutTitle: str(r.aboutTitle) || 'About',
    aboutBody: str(r.aboutBody),
    visitTitle: str(r.visitTitle) || 'Visit',
    visitBody: str(r.visitBody),
    hiddenSections: arr(r.hiddenSections).filter(function (s) {
      return SECTION_IDS.indexOf(s) !== -1;
    }),
    hiddenLocationParts: arr(r.hiddenLocationParts).filter(function (s) {
      return LOCATION_PARTS.indexOf(s) !== -1;
    }),
    addressLine1: str(r.addressLine1),
    addressLine2: str(r.addressLine2),
    city: str(r.city),
    state: str(r.state),
    zip: str(r.zip),
    timezone: str(r.timezone),
    mapEmbedUrl: str(r.mapEmbedUrl),
    phoneDisplay: str(r.phoneDisplay || r.phone_display || r.phone),
    phoneTel: str(r.phoneTel || r.phone_tel || r.phoneDisplay || r.phone_display || r.phone),
    email: str(r.email),
    instagramHandle: str(r.instagramHandle).replace(/^@/, ''),
    faqTitle: str(r.faqTitle) || 'FAQ',
    faqBlurb: str(r.faqBlurb),
    faqItems: normalizeFaqItems(r.faqItems),
    mainSectionOrder: normalizeMainSectionOrder(
      r.mainSectionOrder || r.main_section_order,
    ),
    reelsTitle: str(r.reelsTitle) || 'Previous work',
    reelsBlurb: str(r.reelsBlurb),
    portfolioPlacement: r.portfolioPlacement === 'below_menu' ? 'below_menu' : 'above_menu',
    certificationsTitle: str(r.certificationsTitle) || 'Certifications',
    certificationsBlurb: str(r.certificationsBlurb),
    productsTitle: str(r.productsTitle) || 'Shop',
    productsBlurb: str(r.productsBlurb),
  };
}

export function defaultSiteContent(profile) {
  const name = str(profile?.business_name) || str(profile?.full_name) || 'Your business';
  return normalizeSiteContent({
    brandName: name,
    taglineLeft: 'Book',
    taglineRightLine1: 'your',
    taglineRightLine2: 'appointment',
    heroDescription: 'Welcome — book online and pay securely.',
    menuTitle: 'Services',
    aboutTitle: 'About me',
    visitTitle: 'Visit',
  });
}

function normalizeStackImagePath(entry) {
  if (entry == null) return '';
  if (typeof entry === 'string') return str(entry);
  if (typeof entry === 'object') {
    return str(entry.storagePath || entry.storage_path || entry.path || entry.url);
  }
  return '';
}

export function normalizeSiteTheme(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const fontFamily = FONT_IDS.indexOf(r.fontFamily) !== -1 ? r.fontFamily : 'cormorant';
  const layoutRaw = str(r.heroLayout || r.hero_layout).toLowerCase();
  const heroLayout = HERO_LAYOUTS.indexOf(layoutRaw) !== -1 ? layoutRaw : 'split';
  return {
    primaryColor: str(r.primaryColor) || '#db2777',
    secondaryColor: str(r.secondaryColor) || '#1a1a1a',
    backgroundColor: str(r.backgroundColor) || '#faf8f5',
    navbarColor: str(r.navbarColor) || '',
    cardOutlineColor: str(r.cardOutlineColor) || '',
    fontFamily: fontFamily,
    styleCardLayout: r.styleCardLayout === 'outlined' ? 'outlined' : 'card',
    hideBookNowButton: !!r.hideBookNowButton,
    heroLayout: heroLayout,
    heroImagePath: str(r.heroImagePath || r.hero_image_path),
    logoImagePath: str(r.logoImagePath || r.logo_image_path),
    heroStackImagePaths: arr(r.heroStackImagePaths || r.hero_stack_image_paths)
      .map(normalizeStackImagePath)
      .filter(Boolean)
      .slice(0, 3),
    heroStackImageFocus: arr(r.heroStackImageFocus || r.hero_stack_image_focus),
    heroStackImageFormat: r.heroStackImageFormat === 'tall' || r.hero_stack_image_format === 'tall' ? 'tall' : 'wide',
    heroImageFocusX: typeof r.heroImageFocusX === 'number' ? r.heroImageFocusX : 0.5,
    heroImageFocusY: typeof r.heroImageFocusY === 'number' ? r.heroImageFocusY : 0.5,
    heroImagePosition: str(r.heroImagePosition) || 'center center',
    heroCoverBlur: !!r.heroCoverBlur,
    textColors: r.textColors && typeof r.textColors === 'object' ? { ...r.textColors } : {},
    textColorSources: r.textColorSources && typeof r.textColorSources === 'object' ? { ...r.textColorSources } : {},
    portfolioItems: normalizePortfolioItems(r.portfolioItems || r.galleryImagePaths),
    certificationItems: normalizeCertificationItems(r.certificationItems),
  };
}

export function defaultSiteTheme() {
  return normalizeSiteTheme({
    primaryColor: '#db2777',
    secondaryColor: '#1a1a1a',
    backgroundColor: '#faf8f5',
    heroLayout: 'split',
    fontFamily: 'cormorant',
  });
}

export function normalizeSiteProducts(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(function (item, index) {
      if (!item || typeof item !== 'object') return null;
      const id = str(item.id) || 'product-' + index;
      const title = str(item.title);
      if (!title) return null;
      let price = typeof item.price === 'number' ? item.price : Number(item.price);
      if (!Number.isFinite(price) || price < 0) price = 0;
      const imagePaths = arr(item.imagePaths).map(str).filter(Boolean);
      const storagePath = str(item.storagePath || imagePaths[0]);
      return {
        id: id,
        title: title,
        description: str(item.description),
        price: price,
        enabled: item.enabled !== false,
        imagePaths: imagePaths.length ? imagePaths : storagePath ? [storagePath] : [],
        storagePath: storagePath,
        trackInventory: !!item.trackInventory,
        stockQty: typeof item.stockQty === 'number' ? item.stockQty : 0,
      };
    })
    .filter(Boolean)
    .slice(0, 48);
}

export { FONT_IDS, HERO_LAYOUTS, SECTION_IDS, LOCATION_PARTS, MAIN_SECTION_ORDER_IDS };
