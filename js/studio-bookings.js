/**
 * Web Studio — booking data loading, live refresh, and mutations (Part 3).
 */
import {
  getStudioClient,
  invokeFunction,
  loadStyleCovers,
  marketingCfg,
} from './studio-api.js';
import { buildSnapshot } from './site-data.js';

const POLL_MS = 20000;

export async function loadAllBookings(userId) {
  const client = await getStudioClient();
  const { data, error } = await client
    .from('styld_site_records')
    .select('id,data,created_at,updated_at')
    .eq('user_id', userId)
    .eq('record_type', 'booking')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export function bookingPhotoUrl(storagePath) {
  const path = String(storagePath || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const cfg = marketingCfg();
  if (!cfg.supabaseUrl) return '';
  return cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/booking-photos/' + path.replace(/^\/+/, '');
}

export function styleCoverUrl(storagePath) {
  const path = String(storagePath || '').trim();
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const cfg = marketingCfg();
  if (!cfg.supabaseUrl) return '';
  return cfg.supabaseUrl.replace(/\/$/, '') + '/storage/v1/object/public/style-covers/' + path.replace(/^\/+/, '');
}

export async function fetchStripeConnectStatus() {
  try {
    return (await invokeFunction('stripe-connect-status', {})) || { status: 'not_started' };
  } catch (_) {
    return { status: 'not_started', balanceAvailableCents: 0, balancePendingCents: 0 };
  }
}

export async function createBookingsStore(ctx, onChange) {
  const userId = ctx.session.user.id;
  let snapshot = buildSnapshot([]);
  let styleCovers = {};
  let stripe = null;
  let stripeLoading = true;
  let disposed = false;
  let pollTimer = null;
  let channel = null;

  async function refresh() {
    const [rows, covers] = await Promise.all([loadAllBookings(userId), loadStyleCovers(userId)]);
    if (disposed) return snapshot;
    styleCovers = covers;
    snapshot = buildSnapshot(rows);
    if (typeof onChange === 'function') onChange(snapshot);
    return snapshot;
  }

  async function refreshStripe() {
    stripeLoading = true;
    if (typeof onChange === 'function') onChange(snapshot);
    stripe = await fetchStripeConnectStatus();
    stripeLoading = false;
    if (typeof onChange === 'function') onChange(snapshot);
    return stripe;
  }

  function startPoll() {
    stopPoll();
    pollTimer = setInterval(function () {
      if (document.hidden) return;
      refresh().catch(function () {});
    }, POLL_MS);
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function subscribe() {
    const client = await getStudioClient();
    channel = client
      .channel('site-data-live-' + userId)
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
          if (row && row.record_type && row.record_type !== 'booking') return;
          refresh().catch(function () {});
        },
      )
      .subscribe();
  }

  await refresh();
  refreshStripe();
  await subscribe();
  startPoll();

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) refresh().catch(function () {});
  });

  return {
    get snapshot() {
      return snapshot;
    },
    get styleCovers() {
      return styleCovers;
    },
    get stripe() {
      return stripe;
    },
    get stripeLoading() {
      return stripeLoading;
    },
    refresh: refresh,
    refreshStripe: refreshStripe,
    dispose: function () {
      disposed = true;
      stopPoll();
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
  };
}

async function updateBookingRecord(recordId, dataPatch) {
  const client = await getStudioClient();
  const { data: row, error: loadErr } = await client
    .from('styld_site_records')
    .select('id,data')
    .eq('id', recordId)
    .maybeSingle();
  if (loadErr) throw loadErr;
  if (!row) throw new Error('Booking not found');

  let wrapped = false;
  let existing = row.data;
  if (existing && typeof existing === 'object' && existing.value != null && typeof existing.value === 'object') {
    wrapped = true;
    existing = existing.value;
  } else if (existing && typeof existing === 'object' && existing.value != null) {
    wrapped = true;
    existing = existing.value;
  }

  const merged = Object.assign({}, existing && typeof existing === 'object' ? existing : {}, dataPatch);
  const payload = wrapped ? { value: merged } : merged;

  const { error } = await client.from('styld_site_records').update({ data: payload }).eq('id', recordId);
  if (error) throw error;
  return merged;
}

export async function approveBooking(ctx, booking) {
  const subdomain = ctx.subdomain?.subdomain || ctx.sitePublish?.subdomain || '';
  await updateBookingRecord(booking.recordId, {
    booking_status: 'confirmed',
    approved_at: new Date().toISOString(),
  });
  try {
    await invokeFunction('booking-client-email', {
      bookingId: booking.storageBookingId || booking.id,
      subdomain: subdomain,
      force: true,
    });
  } catch (_) {
    /* email optional in dev */
  }
}

export async function declinePendingBooking(ctx, booking) {
  const subdomain = ctx.subdomain?.subdomain || ctx.sitePublish?.subdomain || '';
  if (!subdomain) throw new Error('Publish your site before declining bookings.');
  return invokeFunction('booking-cancel', {
    bookingId: booking.storageBookingId || booking.id,
    subdomain: subdomain,
    cancelledBy: 'stylist',
  });
}

export async function cancelBooking(ctx, booking) {
  return declinePendingBooking(ctx, booking);
}

export async function startSession(booking) {
  return updateBookingRecord(booking.recordId, {
    booking_status: 'in_progress',
    session_started_at: new Date().toISOString(),
  });
}

export async function completeSession(booking, extras) {
  extras = extras || {};
  const now = new Date();
  const started = booking.session_started_at ? new Date(booking.session_started_at) : now;
  const durationMin = Math.max(1, Math.round((now.getTime() - started.getTime()) / 60000));
  const patch = {
    booking_status: 'completed',
    completed_at: now.toISOString(),
    session_ended_at: now.toISOString(),
    actual_duration_minutes: durationMin,
    review_token: crypto.randomUUID(),
  };
  if (extras.tip_amount != null) patch.tip_amount = Number(extras.tip_amount) || 0;
  if (extras.stylist_notes != null) patch.stylist_notes = String(extras.stylist_notes || '');
  if (extras.balance_collected_cents != null) {
    patch.balance_collected_cents = Number(extras.balance_collected_cents) || 0;
    patch.balance_collected_at = now.toISOString();
    patch.payment_status = 'in_person';
    patch.payment_method_at_service = 'cash';
  }
  return updateBookingRecord(booking.recordId, patch);
}

export async function saveStylistNotes(booking, notes) {
  return updateBookingRecord(booking.recordId, { stylist_notes: String(notes || '') });
}

export async function listBookingGalleryPhotos(booking) {
  const client = await getStudioClient();
  const folder = booking.storageBookingId || booking.id;
  if (!folder) return [];
  try {
    const { data, error } = await client.storage.from('booking-photos').list(folder, { limit: 50 });
    if (error || !data) return [];
    return data
      .filter(function (f) {
        return f.name && !f.name.startsWith('.');
      })
      .map(function (f) {
        return bookingPhotoUrl(folder + '/' + f.name);
      });
  } catch (_) {
    return [];
  }
}
