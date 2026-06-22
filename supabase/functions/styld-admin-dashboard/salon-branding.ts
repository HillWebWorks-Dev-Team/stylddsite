import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const STYLE_COVERS_BUCKET = 'style-covers';
const AVATAR_BUCKETS = ['avatars', 'profile-images'] as const;
const SIGNED_TTL_SECONDS = 3600;
const SIGN_BATCH_SIZE = 100;

async function readTable<T>(
  query: PromiseLike<{ data: T | null; error: { message?: string } | null }>,
): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error) {
    console.error('[salon-branding]', error.message || error);
    return [] as NonNullable<T>;
  }
  return (data ?? []) as NonNullable<T>;
}

export type SalonBrandMeta = {
  brand_name: string;
  email: string | null;
  subdomain: string | null;
  logo_url: string | null;
  image_url: string | null;
  has_logo: boolean;
};

export type StyleCatalogItem = {
  id: string;
  title: string;
  duration_minutes: number | null;
  category: string | null;
  base_price: number;
  addon_count: number;
  addons: StyleAddon[];
  price_label: string;
  description: string | null;
  image_url: string | null;
  has_cover: boolean;
};

export type StyleAddon = { id: string; name: string; price: number };

export function pickSettingValue(row: { data?: unknown }) {
  const d = row?.data;
  if (d && typeof d === 'object' && 'value' in (d as Record<string, unknown>)) {
    return (d as { value: unknown }).value;
  }
  return d ?? null;
}

export function coverStoragePath(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const nested = row.storage_path ?? row.storagePath ?? row.path ?? row.url;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return null;
}

export function normalizeStorageObjectPath(path: string, bucket: string) {
  let p = path.replace(/^\/+/, '');
  const prefix = `${bucket}/`;
  if (p.startsWith(prefix)) p = p.slice(prefix.length);
  return p;
}

export function resolveBrandName(
  siteContent: Record<string, unknown> | null | undefined,
  profile: Record<string, unknown>,
) {
  const content = siteContent || {};
  return (
    String(content.brandName || profile.business_name || profile.full_name || 'Salon').trim() || 'Salon'
  );
}

type StorageTarget = { bucket: string; objectPath: string };

function absoluteAssetUrl(value: unknown): string | null {
  const raw = coverStoragePath(value);
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return null;
}

function resolveStorageTarget(value: unknown, defaultBucket = STYLE_COVERS_BUCKET): StorageTarget | null {
  const raw = coverStoragePath(value);
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return null;

  let p = raw.replace(/^\/+/, '');
  for (const bucket of [STYLE_COVERS_BUCKET, ...AVATAR_BUCKETS]) {
    const prefix = `${bucket}/`;
    if (p.startsWith(prefix)) {
      return { bucket, objectPath: p.slice(prefix.length) };
    }
  }

  return {
    bucket: defaultBucket,
    objectPath: normalizeStorageObjectPath(p, defaultBucket),
  };
}

function avatarStorageTarget(value: unknown): StorageTarget | null {
  const direct = resolveStorageTarget(value, STYLE_COVERS_BUCKET);
  if (direct) {
    if (AVATAR_BUCKETS.includes(direct.bucket as (typeof AVATAR_BUCKETS)[number])) return direct;
    return direct;
  }
  const raw = coverStoragePath(value);
  if (!raw || raw.startsWith('http')) return null;
  for (const bucket of AVATAR_BUCKETS) {
    const objectPath = normalizeStorageObjectPath(raw, bucket);
    if (objectPath) return { bucket, objectPath };
  }
  return null;
}

export function pickSalonLogoSource(
  theme: Record<string, unknown>,
  content: Record<string, unknown>,
  avatar?: unknown,
): unknown {
  const candidates = [theme.logoImagePath, content.logoImagePath, avatar];
  for (const candidate of candidates) {
    if (absoluteAssetUrl(candidate)) return candidate;
    if (coverStoragePath(candidate)) return candidate;
  }
  return null;
}

function hasUploadedLogo(theme: Record<string, unknown>, content: Record<string, unknown>) {
  return !!(coverStoragePath(theme.logoImagePath) || coverStoragePath(content.logoImagePath));
}

function logoStorageTarget(
  theme: Record<string, unknown>,
  content: Record<string, unknown>,
  avatar?: unknown,
): StorageTarget | null {
  const logoCandidates = [theme.logoImagePath, content.logoImagePath];
  for (const candidate of logoCandidates) {
    if (absoluteAssetUrl(candidate)) return null;
    const target = resolveStorageTarget(candidate, STYLE_COVERS_BUCKET);
    if (target) return target;
  }

  if (absoluteAssetUrl(avatar)) return null;
  return avatarStorageTarget(avatar);
}

export function publicAssetUrl(path: unknown, supabaseUrl: string, bucket = STYLE_COVERS_BUCKET) {
  const direct = absoluteAssetUrl(path);
  if (direct) return direct;
  const raw = coverStoragePath(path);
  if (!raw || !supabaseUrl) return null;
  const objectPath = normalizeStorageObjectPath(raw, bucket);
  if (!objectPath) return null;
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${objectPath}`;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function signBucketPaths(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return signed;

  for (const batch of chunk(unique, SIGN_BATCH_SIZE)) {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(batch, SIGNED_TTL_SECONDS);
      if (error || !data) continue;
      for (const row of data) {
        const path = String(row.path || '');
        if (path && row.signedUrl && !row.error) signed.set(path, row.signedUrl);
      }
    } catch {
      /* try public fallback later */
    }
  }

  return signed;
}

function resolveSignedOrPublicUrl(
  absolute: string | null,
  target: StorageTarget | null,
  signedByBucket: Map<string, Map<string, string>>,
  supabaseUrl: string,
) {
  if (absolute) return absolute;
  if (!target) return null;

  const signed = signedByBucket.get(target.bucket)?.get(target.objectPath);
  if (signed) return signed;

  return publicAssetUrl(target.objectPath, supabaseUrl, target.bucket);
}

export async function loadSalonBrandMetaForUsers(
  supabase: SupabaseClient,
  supabaseUrl: string,
  userIds: string[],
): Promise<Map<string, SalonBrandMeta>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const [profiles, subdomains, settingsRows] = await Promise.all([
    readTable(
      supabase
        .from('profiles')
        .select('id,email,full_name,business_name,avatar_url')
        .in('id', uniqueIds),
    ),
    readTable(
      supabase.from('styld_site_subdomains').select('user_id,subdomain').in('user_id', uniqueIds),
    ),
    readTable(
      supabase
        .from('styld_site_records')
        .select('user_id,record_key,data')
        .eq('record_type', 'site_setting')
        .in('record_key', ['site_content', 'site_theme'])
        .in('user_id', uniqueIds),
    ),
  ]);

  const profileMap = new Map(profiles.map((p) => [String(p.id), p]));
  const subMap = new Map(subdomains.map((s) => [String(s.user_id), s.subdomain]));
  const settingsByUser = new Map<string, Record<string, unknown>>();

  for (const row of settingsRows) {
    const uid = String(row.user_id);
    if (!settingsByUser.has(uid)) settingsByUser.set(uid, {});
    settingsByUser.get(uid)![String(row.record_key)] = pickSettingValue(row);
  }

  const pathsByBucket = new Map<string, Set<string>>();
  const planByUser = new Map<
    string,
    {
      brand_name: string;
      email: string | null;
      subdomain: string | null;
      has_logo: boolean;
      absolute: string | null;
      target: StorageTarget | null;
    }
  >();

  for (const uid of uniqueIds) {
    const profile = profileMap.get(uid) || {};
    const settings = settingsByUser.get(uid) || {};
    const siteContent = (settings.site_content || {}) as Record<string, unknown>;
    const siteTheme = (settings.site_theme || {}) as Record<string, unknown>;
    const absolute = absoluteAssetUrl(pickSalonLogoSource(siteTheme, siteContent, profile.avatar_url));
    const target = logoStorageTarget(siteTheme, siteContent, profile.avatar_url);

    if (target) {
      if (!pathsByBucket.has(target.bucket)) pathsByBucket.set(target.bucket, new Set());
      pathsByBucket.get(target.bucket)!.add(target.objectPath);
    }

    planByUser.set(uid, {
      brand_name: resolveBrandName(siteContent, profile),
      email: (profile.email as string | null | undefined) ?? null,
      subdomain: subMap.get(uid) || null,
      has_logo: hasUploadedLogo(siteTheme, siteContent),
      absolute,
      target,
    });
  }

  const signedByBucket = new Map<string, Map<string, string>>();
  await Promise.all(
    [...pathsByBucket.entries()].map(async ([bucket, paths]) => {
      signedByBucket.set(bucket, await signBucketPaths(supabase, bucket, [...paths]));
    }),
  );

  const result = new Map<string, SalonBrandMeta>();
  for (const uid of uniqueIds) {
    const plan = planByUser.get(uid)!;
    const logoUrl = resolveSignedOrPublicUrl(plan.absolute, plan.target, signedByBucket, supabaseUrl);
    result.set(uid, {
      brand_name: plan.brand_name,
      email: plan.email,
      subdomain: plan.subdomain,
      logo_url: logoUrl,
      image_url: logoUrl,
      has_logo: plan.has_logo,
    });
  }

  return result;
}

export function buildStyleCoverMap(rows: Array<{ record_key?: unknown; data?: unknown }>) {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = String(row.record_key || '').trim();
    const path = coverStoragePath(pickSettingValue(row));
    if (key && path) map.set(key, path);
  }
  return map;
}

function normalizeAddons(raw: unknown): StyleAddon[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const name = String(row.name || '').trim();
      if (!name) return null;
      const id = String(row.id || `addon-${index}`).trim();
      const price = Number(row.price);
      return { id, name, price: Number.isFinite(price) ? price : 0 };
    })
    .filter((item): item is StyleAddon => !!item);
}

function formatStylePriceRange(basePrice: number, addons: StyleAddon[]): string {
  const base = Number(basePrice) || 0;
  if (!addons.length) return base > 0 ? `$${Math.round(base)}` : '—';
  const maxAddon = addons.reduce((max, addon) => Math.max(max, addon.price || 0), 0);
  const high = base + maxAddon;
  if (high <= base) return base > 0 ? `$${Math.round(base)}` : '—';
  return `$${Math.round(base)}–$${Math.round(high)}`;
}

export function summarizeStyleCatalogStats(meta: unknown, prices: unknown) {
  const metaObj = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  const priceObj = prices && typeof prices === 'object' ? (prices as Record<string, unknown>) : {};
  const ids = new Set([...Object.keys(metaObj), ...Object.keys(priceObj)]);
  let addon_count = 0;
  for (const id of ids) {
    addon_count += normalizeAddons((metaObj[id] as Record<string, unknown> | undefined)?.addons).length;
  }
  return { style_count: ids.size, addon_count };
}

export async function buildStyleCatalogWithUrls(
  supabase: SupabaseClient,
  supabaseUrl: string,
  meta: unknown,
  prices: unknown,
  coverRows: Array<{ record_key?: unknown; data?: unknown }>,
  logoFallbackPath?: unknown,
): Promise<StyleCatalogItem[]> {
  const metaObj = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  const priceObj = prices && typeof prices === 'object' ? (prices as Record<string, unknown>) : {};
  const coverMap = buildStyleCoverMap(coverRows);
  const ids = new Set([...Object.keys(metaObj), ...Object.keys(priceObj), ...coverMap.keys()]);

  const logoAbsolute = absoluteAssetUrl(logoFallbackPath);
  const logoTarget = logoAbsolute ? null : resolveStorageTarget(logoFallbackPath, STYLE_COVERS_BUCKET);

  const pathsByBucket = new Map<string, Set<string>>();
  const styleTargets = new Map<string, StorageTarget | null>();

  for (const id of ids) {
    const absolute = absoluteAssetUrl(coverMap.get(id));
    const target = absolute ? null : resolveStorageTarget(coverMap.get(id), STYLE_COVERS_BUCKET);
    styleTargets.set(id, target);
    if (target) {
      if (!pathsByBucket.has(target.bucket)) pathsByBucket.set(target.bucket, new Set());
      pathsByBucket.get(target.bucket)!.add(target.objectPath);
    }
  }

  if (logoTarget) {
    if (!pathsByBucket.has(logoTarget.bucket)) pathsByBucket.set(logoTarget.bucket, new Set());
    pathsByBucket.get(logoTarget.bucket)!.add(logoTarget.objectPath);
  }

  const signedByBucket = new Map<string, Map<string, string>>();
  await Promise.all(
    [...pathsByBucket.entries()].map(async ([bucket, paths]) => {
      signedByBucket.set(bucket, await signBucketPaths(supabase, bucket, [...paths]));
    }),
  );

  const logoFallbackUrl = resolveSignedOrPublicUrl(logoAbsolute, logoTarget, signedByBucket, supabaseUrl);

  return [...ids]
    .map((id) => {
      const item = (metaObj[id] || {}) as Record<string, unknown>;
      const base = Number(priceObj[id]) || 0;
      const addons = normalizeAddons(item.addons);
      const title = String(item.title || id).trim() || id;
      const absolute = absoluteAssetUrl(coverMap.get(id));
      const target = styleTargets.get(id) || null;
      const coverUrl = resolveSignedOrPublicUrl(absolute, target, signedByBucket, supabaseUrl);
      const imageUrl = coverUrl || logoFallbackUrl || null;

      return {
        id,
        title,
        duration_minutes: item.durationMinutes != null ? Number(item.durationMinutes) : null,
        category: item.category ? String(item.category) : null,
        base_price: base,
        addon_count: addons.length,
        addons,
        price_label: formatStylePriceRange(base, addons),
        description: item.description ? String(item.description) : null,
        image_url: imageUrl,
        has_cover: !!coverUrl,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
