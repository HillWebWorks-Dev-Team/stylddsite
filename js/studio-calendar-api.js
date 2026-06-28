/**
 * Web Studio calendar data — blocks, hours, manual bookings, unified live store.
 */
import { getStudioClient, loadSiteSetting, loadSiteSettings, loadStyleCovers } from './studio-api.js';
import { DEFAULT_BOOKING_HOURS, normalizeBookingHours } from './booking-hours.js';
import { buildSnapshot, unwrapBookingData } from './site-data.js';
import { loadAllBookings } from './studio-bookings.js';

const POLL_MS = 20000;

function unwrapRowData(row) {
  if (!row || !row.data) return {};
  const d = row.data;
  if (typeof d === 'object' && d.value != null && typeof d.value === 'object') return d.value;
  return typeof d === 'object' ? d : {};
}

export async function loadBlockedIntervals(userId) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_records')
    .select('id,data,created_at')
    .eq('user_id', userId)
    .eq('record_type', 'blocked_interval')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(function (row) {
    const d = unwrapRowData(row);
    return {
      id: row.id,
      starts_at: d.starts_at || null,
      ends_at: d.ends_at || null,
      note: d.note || null,
    };
  });
}

export async function loadBookingHours(userId) {
  const raw = await loadSiteSetting(userId, 'booking_hours');
  return normalizeBookingHours(raw || DEFAULT_BOOKING_HOURS);
}

export async function addBlockedInterval(userId, input) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_records')
    .insert({
      user_id: userId,
      record_type: 'blocked_interval',
      record_key: null,
      data: {
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        note: input.note || null,
      },
    })
    .select('id,data')
    .single();
  if (error) throw error;
  const d = unwrapRowData(data);
  return { id: data.id, starts_at: d.starts_at, ends_at: d.ends_at, note: d.note || null };
}

export async function deleteBlockedInterval(userId, blockId) {
  const client = await getStudioClient();
  const { error } = await client
    .from('styld_site_records')
    .delete()
    .eq('user_id', userId)
    .eq('record_type', 'blocked_interval')
    .eq('id', blockId);
  if (error) throw error;
}

export async function loadCatalogServices(userId) {
  const settings = await loadSiteSettings(userId, ['style_catalog_meta', 'style_price_overrides']);
  const covers = await loadStyleCovers(userId);
  const meta = settings.style_catalog_meta || {};
  const prices = settings.style_price_overrides || {};
  const ids = {};
  Object.keys(meta).forEach(function (k) {
    ids[k] = true;
  });
  Object.keys(prices).forEach(function (k) {
    ids[k] = true;
  });
  return Object.keys(ids).map(function (styleId) {
    const item = meta[styleId] || {};
    const price = typeof prices[styleId] === 'number' ? prices[styleId] : Number(prices[styleId]) || 0;
    return {
      id: styleId,
      title: item.title || styleId,
      price: price,
      durationMinutes: item.durationMinutes || item.duration_minutes || 120,
      venue: item.venue || 'salon',
      coverPath: covers[styleId] || null,
    };
  });
}

export async function createManualBooking(userId, input) {
  const client = await getStudioClient();
  const bookingId = crypto.randomUUID();
  const startsAt = new Date(input.appointment_starts_at);
  const dateKey = input.appointment_date || startsAt.toISOString().slice(0, 10);
  const payload = {
    id: bookingId,
    full_name: input.full_name,
    phone: input.phone || '',
    email: input.email || '',
    style_id: input.style_id,
    style_name: input.style_name,
    hair_length: input.hair_length || '',
    hair_option: input.hair_option || '',
    notes: input.notes || '',
    service_address: input.service_address || '',
    appointment_starts_at: startsAt.toISOString(),
    appointment_date: dateKey,
    duration_minutes: input.duration_minutes || 120,
    estimated_total: input.estimated_total || 0,
    deposit_amount: 0,
    payment_status: 'paid',
    booking_status: 'confirmed',
    source: 'admin_dashboard',
  };

  const { data, error } = await client
    .from('styld_site_records')
    .insert({
      user_id: userId,
      record_type: 'booking',
      record_key: bookingId,
      data: payload,
    })
    .select('id,data,created_at,updated_at')
    .single();
  if (error) throw error;
  return data;
}

export async function createCalendarStore(ctx, onChange) {
  const userId = ctx.session.user.id;
  let snapshot = buildSnapshot([]);
  let blockedIntervals = [];
  let bookingHours = normalizeBookingHours(DEFAULT_BOOKING_HOURS);
  let styleCovers = {};
  let catalogServices = [];
  let disposed = false;
  let pollTimer = null;
  let channel = null;

  async function refresh() {
    const [rows, blocks, hours, covers, catalog] = await Promise.all([
      loadAllBookings(userId),
      loadBlockedIntervals(userId),
      loadBookingHours(userId),
      loadStyleCovers(userId),
      loadCatalogServices(userId),
    ]);
    if (disposed) return snapshot;
    blockedIntervals = blocks;
    bookingHours = hours;
    styleCovers = covers;
    catalogServices = catalog;
    snapshot = buildSnapshot(rows);
    if (typeof onChange === 'function') onChange();
    return snapshot;
  }

  function startPoll() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      refresh().catch(function () {});
    }, POLL_MS);
  }

  async function subscribe() {
    const client = await getStudioClient();
    channel = client
      .channel('studio-calendar-live-' + userId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'styld_site_records',
          filter: 'user_id=eq.' + userId,
        },
        function (payload) {
          const row = payload.new || payload.old;
          if (!row) return;
          if (row.record_type !== 'booking' && row.record_type !== 'blocked_interval') {
            if (row.record_type === 'site_setting' && row.record_key === 'booking_hours') {
              refresh().catch(function () {});
            }
            return;
          }
          refresh().catch(function () {});
        },
      )
      .subscribe();
  }

  await refresh();
  await subscribe();
  startPoll();

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refresh().catch(function () {});
  });

  return {
    get snapshot() {
      return snapshot;
    },
    get blockedIntervals() {
      return blockedIntervals;
    },
    get bookingHours() {
      return bookingHours;
    },
    get catalogServices() {
      return catalogServices;
    },
    refresh: refresh,
    dispose: function () {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      if (channel) {
        getStudioClient().then(function (client) {
          client.removeChannel(channel);
        });
      }
    },
    findBooking: function (id) {
      const needle = String(id || '').toLowerCase();
      return snapshot.bookings.find(function (b) {
        return (
          String(b.id || '').toLowerCase() === needle ||
          String(b.recordId || '').toLowerCase() === needle ||
          String(b.storageBookingId || '').toLowerCase() === needle
        );
      });
    },
    coverForStyle: function (styleId) {
      return styleCovers[styleId] || null;
    },
    addBlock: function (input) {
      return addBlockedInterval(userId, input).then(refresh);
    },
    removeBlock: function (blockId) {
      return deleteBlockedInterval(userId, blockId).then(refresh);
    },
    createBooking: function (input) {
      return createManualBooking(userId, input).then(refresh);
    },
    reloadHours: function () {
      return loadBookingHours(userId).then(function (h) {
        bookingHours = h;
        if (typeof onChange === 'function') onChange();
      });
    },
  };
}

export { unwrapBookingData };
