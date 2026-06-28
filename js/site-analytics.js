/**
 * Business analytics — computed client-side from bookings snapshot (Part 7).
 */
import {
  getPaidAmount,
  getRevenueForPeriod,
  getTodayJobStats,
  getUpcomingAppointments,
  isCancelledBooking,
  PERIODS,
} from './site-data.js';

function normalizeStatus(booking) {
  return String(booking.booking_status || '').toLowerCase();
}

function bookingCreatedAt(booking) {
  const d = booking.createdAt ? new Date(booking.createdAt) : null;
  return d && !isNaN(d.getTime()) ? d : null;
}

function periodStart(period, now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'day') return d;
  if (period === 'week') {
    d.setDate(d.getDate() - d.getDay());
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

function daysAgoStart(days, now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Math.max(0, days - 1));
  return d;
}

export function getMoneyStatsForLastDays(bookings, days, now) {
  now = now || new Date();
  const since = daysAgoStart(days, now);
  let collected = 0;
  let pending = 0;
  let paidBookings = 0;
  let pendingBookings = 0;

  (bookings || []).forEach(function (b) {
    if (isCancelledBooking(b)) return;
    const created = bookingCreatedAt(b);
    if (!created || created < since) return;

    const paid = getPaidAmount(b);
    const pay = String(b.payment_status || '').toLowerCase();
    const status = normalizeStatus(b);
    const total = Number(b.estimated_total) || 0;

    if (paid > 0) {
      collected += paid;
      paidBookings += 1;
    }

    if (
      status === 'pending_payment' &&
      pay !== 'in_person' &&
      pay !== 'paid' &&
      pay !== 'completed'
    ) {
      pending += Math.max(0, total - paid);
      pendingBookings += 1;
    }
  });

  return {
    collected: Math.round(collected * 100) / 100,
    pending: Math.round(pending * 100) / 100,
    paidBookings: paidBookings,
    pendingBookings: pendingBookings,
  };
}

export function getBookingOverview(bookings) {
  const list = bookings || [];
  let cancelled = 0;
  let completed = 0;
  let pendingPayment = 0;

  list.forEach(function (b) {
    const status = normalizeStatus(b);
    if (isCancelledBooking(b)) {
      cancelled += 1;
      return;
    }
    if (status === 'completed') completed += 1;
    const pay = String(b.payment_status || '').toLowerCase();
    if (status === 'pending_payment' && pay !== 'in_person') pendingPayment += 1;
  });

  return {
    total: list.length,
    cancelled: cancelled,
    completed: completed,
    pendingPayment: pendingPayment,
    upcomingCount: getUpcomingAppointments(list, 500).length,
  };
}

export function getPeriodBookingStats(bookings, period, clients, now) {
  now = now || new Date();
  const start = periodStart(period, now);
  let newBookings = 0;
  let completed = 0;
  let cancelled = 0;
  let completedValueSum = 0;
  let completedValueCount = 0;

  (bookings || []).forEach(function (b) {
    const created = bookingCreatedAt(b);
    if (created && (!start || created >= start)) newBookings += 1;

    const status = normalizeStatus(b);
    const inRange = function (date) {
      if (!date || isNaN(date.getTime())) return false;
      return !start || date >= start;
    };

    if (isCancelledBooking(b) && inRange(created)) cancelled += 1;
    if (status === 'completed' && inRange(created)) {
      completed += 1;
      const price = Number(b.estimated_total) || 0;
      const deposit = Number(b.deposit_amount) || 0;
      if (price > 0 || deposit > 0) {
        completedValueSum += price > 0 ? price : deposit;
        completedValueCount += 1;
      }
    }
  });

  return {
    revenue: getRevenueForPeriod(bookings, period, now),
    newBookings: newBookings,
    completed: completed,
    cancelled: cancelled,
    avgCompletedValue: completedValueCount
      ? Math.round((completedValueSum / completedValueCount) * 100) / 100
      : 0,
    totalClients: (clients || []).length,
  };
}

export function getPopularServices(bookings, limit) {
  const counts = new Map();
  (bookings || []).forEach(function (b) {
    if (normalizeStatus(b) !== 'completed') return;
    const name = b.style_name || 'Service';
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()]
    .map(function ([name, count]) {
      return { name: name, count: count };
    })
    .sort(function (a, b) {
      return b.count - a.count;
    })
    .slice(0, limit || 5);
}

export function getTopClients(clients, limit) {
  return (clients || [])
    .slice()
    .sort(function (a, b) {
      return (b.totalSpent || 0) - (a.totalSpent || 0);
    })
    .slice(0, limit || 5);
}

export function friendlyPath(path) {
  const clean = String(path || '/').split('?')[0].replace(/\/$/, '') || '/';
  const map = {
    '/': 'Home',
    '/index.html': 'Home',
    '/booking': 'Booking',
    '/booking.html': 'Booking',
    '/book': 'Booking',
    '/book.html': 'Booking',
    '/styles-catalog.html': 'Styles Catalog',
    '/styles-catalog': 'Styles Catalog',
    '/gallery.html': 'Gallery',
    '/gallery': 'Gallery',
    '/portfolio': 'Portfolio',
    '/portfolio.html': 'Portfolio',
    '/products': 'Products',
    '/products.html': 'Products',
    '/certifications': 'Certifications',
    '/certifications.html': 'Certifications',
    '/review': 'Review',
    '/review.html': 'Review',
  };
  return map[clean] || clean.replace(/^\//, '').replace(/-/g, ' ') || 'Page';
}

export { PERIODS, getTodayJobStats, getRevenueForPeriod };
