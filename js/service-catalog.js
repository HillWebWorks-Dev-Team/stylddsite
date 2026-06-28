/** Static service catalog base + merge with stylist overrides. */

const VENUE_PREFIX = { studio: 'salon', house: 'house', kids: 'kids' };

const CATEGORY_RULES = [
  { match: /knotless/i, category: 'Knotless Braids' },
  { match: /passion/i, category: 'Passion Twists' },
  { match: /boho/i, category: 'Boho Braids' },
  { match: /feedin|feed-in/i, category: 'Feed-in Braids' },
  { match: /locs/i, category: 'Locs' },
  { match: /fulani/i, category: 'Fulani Braids' },
  { match: /wig/i, category: 'Wigs & Weaves' },
  { match: /natural|cornrow|twist|box/i, category: 'Natural Styles' },
  { match: /fade|taper|cut|barber|line/i, category: 'Barbering' },
  { match: /silk|press|blowout/i, category: 'Silk Press & Styling' },
  { match: /lash|brow|makeup/i, category: 'Beauty' },
];

export const BASE_STYLE_IDS = [
  'studio-knotless-sm', 'studio-knotless-md', 'studio-knotless-lg',
  'studio-passion-sm', 'studio-passion-md',
  'studio-boho-sm', 'studio-boho-md', 'studio-boho-lg',
  'studio-feedin-2', 'studio-feedin-4', 'studio-feedin-8',
  'studio-locs-retwist', 'studio-locs-starter',
  'studio-wig-install', 'studio-skin-fade',
  'house-knotless-sm', 'house-knotless-md', 'house-knotless-lg',
  'house-passion-sm', 'house-boho-md',
  'house-feedin-4', 'house-feedin-8',
  'kids-knotless-sm', 'kids-knotless-md',
];

function titleCase(s) {
  return String(s || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
}

export function parseStyleVenue(styleId) {
  const prefix = String(styleId || '').split('-')[0];
  return VENUE_PREFIX[prefix] || 'salon';
}

export function parseStyleCategory(styleId) {
  const id = String(styleId || '');
  for (let i = 0; i < CATEGORY_RULES.length; i++) {
    if (CATEGORY_RULES[i].match.test(id)) return CATEGORY_RULES[i].category;
  }
  return 'Services';
}

export function defaultStyleTitle(styleId) {
  const parts = String(styleId || '').split('-');
  if (parts.length <= 1) return titleCase(styleId);
  return titleCase(parts.slice(1).join('-'));
}

function normalizeAddons(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(function (a) {
      if (!a || typeof a !== 'object') return null;
      const name = String(a.name || '').trim();
      if (!name) return null;
      return {
        id: String(a.id || crypto.randomUUID()),
        name: name,
        price: Number(a.price) || 0,
      };
    })
    .filter(Boolean);
}

function normalizeVariants(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(function (v) {
      if (!v || typeof v !== 'object') return null;
      const label = String(v.label || '').trim();
      if (!label) return null;
      return {
        id: String(v.id || crypto.randomUUID()),
        label: label,
        price: Number(v.price) || 0,
      };
    })
    .filter(Boolean);
}

export function normalizeStyleMetaEntry(raw, styleId) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    title: String(raw.title || '').trim() || defaultStyleTitle(styleId),
    description: String(raw.description || '').trim(),
    category: String(raw.category || '').trim() || parseStyleCategory(styleId),
    durationMinutes: Number(raw.durationMinutes || raw.duration_minutes) || 120,
    defaultVariantLabel: String(raw.defaultVariantLabel || raw.default_variant_label || 'Standard').trim(),
    variants: normalizeVariants(raw.variants),
    addons: normalizeAddons(raw.addons),
    venue: raw.venue || parseStyleVenue(styleId),
  };
}

export function buildSiteServices(meta, prices, covers) {
  meta = meta && typeof meta === 'object' ? meta : {};
  prices = prices && typeof prices === 'object' ? prices : {};
  covers = covers && typeof covers === 'object' ? covers : {};

  const ids = {};
  BASE_STYLE_IDS.forEach(function (id) {
    ids[id] = true;
  });
  Object.keys(meta).forEach(function (id) {
    ids[id] = true;
  });
  Object.keys(prices).forEach(function (id) {
    ids[id] = true;
  });
  Object.keys(covers).forEach(function (id) {
    ids[id] = true;
  });

  const services = Object.keys(ids).map(function (styleId) {
    const entry = normalizeStyleMetaEntry(meta[styleId], styleId);
    const price = typeof prices[styleId] === 'number' ? prices[styleId] : Number(prices[styleId]) || 0;
    return {
      id: styleId,
      title: entry.title,
      description: entry.description,
      category: entry.category,
      durationMinutes: entry.durationMinutes,
      defaultVariantLabel: entry.defaultVariantLabel,
      variants: entry.variants,
      addons: entry.addons,
      venue: entry.venue,
      price: price,
      coverPath: covers[styleId] || null,
    };
  });

  const byCategory = {};
  services.forEach(function (s) {
    if (!byCategory[s.category]) byCategory[s.category] = [];
    byCategory[s.category].push(s);
  });
  Object.keys(byCategory).forEach(function (cat) {
    byCategory[cat].sort(function (a, b) {
      return a.title.localeCompare(b.title);
    });
  });

  return { services: services, byCategory: byCategory };
}
