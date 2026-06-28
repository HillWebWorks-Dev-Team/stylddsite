/**
 * Booking snapshot — port of mobile siteData.ts rules for Web Studio Part 3.
 */

const COLLECTED_PAYMENT = new Set([
  'deposit_paid',
  'paid',
  'confirmed',
  'completed',
  'pending_payment',
]);

const CANCELLED = new Set(['cancelled', 'canceled']);

export function unwrapBookingData(row) {
  if (!row || !row.data) return {};
  const d = row.data;
  if (typeof d === 'object' && d.value != null && typeof d.value === 'object') return d.value;
  return typeof d === 'object' ? d : {};
}

export function parseBookingRow(row) {
  const data = unwrapBookingData(row);
  const storageBookingId = String(data.id || row.id || '');
  const startsAt = parseStartAt(data);
  const createdAt = row.created_at || data.created_at || null;

  return {
    recordId: row.id,
    id: storageBookingId,
    storageBookingId: storageBookingId,
    createdAt: createdAt,
    updatedAt: row.updated_at || null,
    full_name: String(data.full_name || data.client_name || 'Client').trim(),
    email: String(data.email || '').trim(),
    phone: String(data.phone || data.phone_display || '').trim(),
    style_id: String(data.style_id || '').trim(),
    style_name: String(data.style_name || data.service_name || 'Service').trim(),
    hair_length: String(data.hair_length || '').trim(),
    hair_option: String(data.hair_option || '').trim(),
    notes: String(data.notes || '').trim(),
    service_address: String(data.service_address || '').trim(),
    appointment_starts_at: data.appointment_starts_at || null,
    appointment_date: data.appointment_date || null,
    startAt: startsAt,
    duration_minutes: normalizeDuration(data.duration_minutes),
    estimated_total: Number(data.estimated_total) || 0,
    deposit_amount: Number(data.deposit_amount) || 0,
    payment_status: String(data.payment_status || '').toLowerCase(),
    booking_status: normalizeBookingStatus(data.booking_status),
    stripe_payment_intent_id: data.stripe_payment_intent_id || data.unit_payment_id || null,
    photo_hair_path: data.photo_hair_path || null,
    photo_ref_path: data.photo_ref_path || null,
    session_started_at: data.session_started_at || null,
    session_ended_at: data.session_ended_at || null,
    stylist_notes: String(data.stylist_notes || '').trim(),
    tip_amount: Number(data.tip_amount) || 0,
    balance_collected_cents: Number(data.balance_collected_cents) || 0,
    completed_at: data.completed_at || null,
    approved_at: data.approved_at || null,
    refund_status: data.refund_status || null,
    refund_amount_cents: Number(data.refund_amount_cents) || 0,
    order_products: Array.isArray(data.order_products) ? data.order_products : [],
    products_subtotal: Number(data.products_subtotal) || 0,
    source: data.source || null,
    raw: data,
  };
}

function normalizeDuration(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 120;
  return Math.min(720, Math.round(n));
}

function normalizeBookingStatus(s) {
  return String(s || 'confirmed').toLowerCase();
}

function parseStartAt(data) {
  if (data.appointment_starts_at) {
    const d = new Date(data.appointment_starts_at);
    if (!isNaN(d.getTime())) return d;
  }
  if (data.appointment_date) {
    const d = new Date(data.appointment_date + 'T12:00:00');
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function isCancelledBooking(b) {
  return CANCELLED.has(normalizeBookingStatus(b.booking_status));
}

export function bookingStatusLabel(status) {
  const s = normalizeBookingStatus(status);
  const map = {
    pending_payment: 'Awaiting payment',
    pending_approval: 'Pending approval',
    confirmed: 'Confirmed',
    in_progress: 'In session',
    completed: 'Completed',
    cancelled: 'Cancelled',
    canceled: 'Cancelled',
  };
  return map[s] || s.replace(/_/g, ' ');
}

export function uiStatusKind(b) {
  const s = normalizeBookingStatus(b.booking_status);
  if (s === 'pending_approval') return 'pending';
  if (s === 'in_progress') return 'active';
  if (s === 'completed') return 'completed';
  if (CANCELLED.has(s)) return 'cancelled';
  if (s === 'pending_payment') return 'awaiting';
  return 'upcoming';
}

export function getPaidAmount(booking) {
  if (isCancelledBooking(booking)) return 0;
  const price = Number(booking.estimated_total) || 0;
  const tip = Number(booking.tip_amount) || 0;
  const pay = String(booking.payment_status || '').toLowerCase();

  if (pay === 'paid' || pay === 'completed') return price + tip;
  if (pay === 'in_person') return (Number(booking.balance_collected_cents) || 0) / 100 + tip;
  if (pay === 'deposit_paid' || COLLECTED_PAYMENT.has(pay)) {
    return (Number(booking.deposit_amount) || 0) + tip;
  }
  return Number(booking.deposit_amount) || 0;
}

function periodStart(period, now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'day') return d;
  if (period === 'week') {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  }
  if (period === 'month') {
    d.setDate(1);
    return d;
  }
  if (period === 'year') {
    d.setMonth(0, 1);
    return d;
  }
  return null;
}

export function getRevenueForPeriod(bookings, period, now) {
  now = now || new Date();
  const start = periodStart(period, now);
  let total = 0;
  (bookings || []).forEach(function (b) {
    if (isCancelledBooking(b)) return;
    const created = b.createdAt ? new Date(b.createdAt) : null;
    if (!created || isNaN(created.getTime())) return;
    if (start && created < start) return;
    total += getPaidAmount(b);
  });
  return Math.round(total * 100) / 100;
}

export function isBookingActiveNow(booking, now) {
  now = now || new Date();
  if (normalizeBookingStatus(booking.booking_status) === 'in_progress') return true;
  if (normalizeBookingStatus(booking.booking_status) !== 'confirmed') return false;
  if (!booking.startAt) return false;
  const start = booking.startAt.getTime();
  const end = start + booking.duration_minutes * 60 * 1000;
  const windowMs = 15 * 60 * 1000;
  return now.getTime() >= start - windowMs && now.getTime() <= end + windowMs;
}

export function isUpcomingBooking(booking, now) {
  now = now || new Date();
  if (isCancelledBooking(booking)) return false;
  const s = normalizeBookingStatus(booking.booking_status);
  if (s === 'completed' || s === 'in_progress') return false;
  if (s === 'pending_approval' || s === 'confirmed' || s === 'pending_payment') {
    if (!booking.startAt) return s !== 'pending_payment';
    return booking.startAt.getTime() >= now.getTime() - 30 * 60 * 1000;
  }
  return false;
}

export function getPendingApprovalAppointments(bookings, limit) {
  const now = new Date();
  return (bookings || [])
    .filter(function (b) {
      return (
        normalizeBookingStatus(b.booking_status) === 'pending_approval' &&
        !isCancelledBooking(b) &&
        (!b.startAt || b.startAt >= now)
      );
    })
    .sort(function (a, b) {
      return (a.startAt?.getTime() || 0) - (b.startAt?.getTime() || 0);
    })
    .slice(0, limit || 20);
}

export function getUpcomingAppointments(bookings, limit) {
  const now = new Date();
  return (bookings || [])
    .filter(function (b) {
      return isUpcomingBooking(b, now) && normalizeBookingStatus(b.booking_status) !== 'pending_approval';
    })
    .sort(function (a, b) {
      return (a.startAt?.getTime() || 0) - (b.startAt?.getTime() || 0);
    })
    .slice(0, limit || 100);
}

export function getActiveAppointments(bookings) {
  const now = new Date();
  return (bookings || []).filter(function (b) {
    return isBookingActiveNow(b, now);
  });
}

export function getRecentBookings(bookings, limit) {
  return (bookings || [])
    .slice()
    .sort(function (a, b) {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    })
    .slice(0, limit || 4);
}

export function formatDateLabel(date) {
  if (!date) return 'Unscheduled';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Unscheduled';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTimeRange(booking) {
  if (!booking.startAt) return '—';
  const start = booking.startAt;
  const end = new Date(start.getTime() + booking.duration_minutes * 60 * 1000);
  const fmt = function (d) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  return fmt(start) + ' – ' + fmt(end);
}

export function groupByDate(appointments) {
  const groups = [];
  const map = new Map();
  appointments.forEach(function (b) {
    const key = b.startAt ? b.startAt.toISOString().slice(0, 10) : 'unscheduled';
    if (!map.has(key)) {
      const g = { dateKey: key, label: formatDateLabel(b.startAt), appointments: [] };
      map.set(key, g);
      groups.push(g);
    }
    map.get(key).appointments.push(b);
  });
  return groups;
}

export function getTodayJobStats(bookings) {
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  let completed = 0;
  let inProgress = 0;
  let total = 0;
  (bookings || []).forEach(function (b) {
    if (!b.startAt || b.startAt.toISOString().slice(0, 10) !== todayKey) return;
    if (isCancelledBooking(b)) return;
    total += 1;
    const s = normalizeBookingStatus(b.booking_status);
    if (s === 'completed') completed += 1;
    if (s === 'in_progress') inProgress += 1;
  });
  const progress = total ? Math.round(((completed + inProgress * 0.5) / total) * 100) : 0;
  return { completed, inProgress, total, progress };
}

export function buildSnapshot(rows) {
  const bookings = (rows || []).map(parseBookingRow);
  const calendarEvents = buildCalendarEvents(bookings);
  const clients = buildClients(bookings);
  return {
    bookings: bookings,
    calendarEvents: calendarEvents,
    clients: clients,
    pending: getPendingApprovalAppointments(bookings),
    upcoming: getUpcomingAppointments(bookings),
    active: getActiveAppointments(bookings),
    recent: getRecentBookings(bookings, 4),
    todayStats: getTodayJobStats(bookings),
  };
}

export function toCalendarEvent(booking) {
  if (!booking || !booking.startAt || isCancelledBooking(booking)) return null;
  const start = booking.startAt;
  const end = new Date(start.getTime() + (booking.duration_minutes || 120) * 60 * 1000);
  const completed = normalizeBookingStatus(booking.booking_status) === 'completed';
  const dateKey = start.toISOString().slice(0, 10);
  return {
    id: 'event-' + booking.id,
    appointmentId: booking.id,
    title: booking.style_name || 'Service',
    styleId: booking.style_id || '',
    dateKey: dateKey,
    startHour: start.getHours(),
    startMinute: start.getMinutes(),
    endHour: end.getHours(),
    endMinute: end.getMinutes(),
    startMinutes: start.getHours() * 60 + start.getMinutes(),
    endMinutes: end.getHours() * 60 + end.getMinutes(),
    completed: completed,
    booking: booking,
  };
}

export function buildCalendarEvents(bookings) {
  return (bookings || [])
    .map(function (b) {
      return toCalendarEvent(b);
    })
    .filter(Boolean);
}

export function getCalendarEventsForDateKey(events, dateKey) {
  return (events || []).filter(function (e) {
    return e.dateKey === dateKey;
  });
}

export const PERIODS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All' },
];

export function fmtMoney(n) {
  if (n == null || isNaN(n)) return '$0';
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function getClientKey(email, phone) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedPhone = String(phone || '').replace(/\D/g, '');
  return normalizedEmail || normalizedPhone || 'unknown-client';
}

export function mapClientBookingStatus(booking) {
  const s = normalizeBookingStatus(booking.booking_status);
  if (CANCELLED.has(s)) return 'cancelled';
  if (s === 'pending_approval' || s === 'pending_payment') return 'pending';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'completed') return 'completed';
  return 'upcoming';
}

function hairTypeLabel(booking) {
  return [booking.hair_length, booking.hair_option].filter(Boolean).join(' · ') || '';
}

function formatMemberSince(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function toClientBooking(booking) {
  const timeRange = formatTimeRange(booking);
  return {
    id: booking.id,
    service: booking.style_name || 'Service',
    styleId: booking.style_id || '',
    date: booking.startAt ? formatDateLabel(booking.startAt) : booking.appointment_date || '—',
    time: booking.startAt && timeRange !== '—' ? timeRange.split(' – ')[0] : undefined,
    amount: Number(booking.estimated_total) || 0,
    hairType: hairTypeLabel(booking),
    status: mapClientBookingStatus(booking),
    productCount: (booking.order_products || []).length || 0,
    bookingStatus: booking.booking_status,
    startAt: booking.startAt,
    createdAt: booking.createdAt,
    completed: normalizeBookingStatus(booking.booking_status) === 'completed',
  };
}

export function buildClients(bookings) {
  const groups = new Map();

  (bookings || []).forEach(function (b) {
    const key = getClientKey(b.email, b.phone);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  });

  const clients = [];
  groups.forEach(function (list, key) {
    const sorted = list.slice().sort(function (a, b) {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
    const latest = sorted[0];
    let earliest = sorted[0];
    sorted.forEach(function (b) {
      if (new Date(b.createdAt || 0).getTime() < new Date(earliest.createdAt || 0).getTime()) {
        earliest = b;
      }
    });

    let totalSpent = 0;
    let totalTips = 0;
    let durationSum = 0;
    let durationCount = 0;
    const hairTypesSet = new Set();
    const serviceCounts = {};

    sorted.forEach(function (b) {
      const hair = hairTypeLabel(b);
      if (hair) hairTypesSet.add(hair);
      const svc = b.style_name || 'Service';
      if (!serviceCounts[svc]) serviceCounts[svc] = { count: 0, styleId: b.style_id };
      serviceCounts[svc].count += 1;

      if (normalizeBookingStatus(b.booking_status) === 'completed') {
        totalSpent += (Number(b.estimated_total) || 0) + (Number(b.tip_amount) || 0);
        totalTips += Number(b.tip_amount) || 0;
        const raw = b.raw || {};
        const dur = raw.actual_duration_minutes || b.duration_minutes;
        if (dur) {
          durationSum += Number(dur);
          durationCount += 1;
        }
      }
    });

    const favoriteOrders = Object.keys(serviceCounts)
      .map(function (name) {
        return {
          service: name,
          styleId: serviceCounts[name].styleId,
          count: serviceCounts[name].count,
        };
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, 3);

    const pastBookings = sorted
      .map(toClientBooking)
      .sort(function (a, b) {
        const ta = a.startAt ? a.startAt.getTime() : new Date(a.createdAt || 0).getTime();
        const tb = b.startAt ? b.startAt.getTime() : new Date(b.createdAt || 0).getTime();
        return tb - ta;
      });

    clients.push({
      id: key,
      name: latest.full_name || 'Client',
      email: latest.email ? latest.email : '—',
      phone: latest.phone || '',
      location: latest.service_address || '',
      memberSince: formatMemberSince(earliest.createdAt),
      totalSpent: Math.round(totalSpent * 100) / 100,
      totalBookings: sorted.length,
      avgSessionMinutes: durationCount ? Math.round(durationSum / durationCount) : 0,
      totalTips: Math.round(totalTips * 100) / 100,
      hairTypes: Array.from(hairTypesSet),
      notes: latest.notes ? latest.notes : 'No notes yet.',
      favoriteOrders: favoriteOrders,
      pastBookings: pastBookings,
    });
  });

  return clients.sort(function (a, b) {
    return b.totalBookings - a.totalBookings;
  });
}

export function getClientById(snapshot, clientId) {
  const decoded = decodeURIComponent(String(clientId || ''));
  return (snapshot.clients || []).find(function (c) {
    return c.id === decoded || c.id === clientId;
  });
}
