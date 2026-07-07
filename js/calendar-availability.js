/** Timeline / overlap helpers for Web Studio calendar. */

import { isCancelledBooking } from './site-data.js';

export const HOUR_HEIGHT = 56;
export const SNAP_MINUTES = 30;
export const TIMELINE_START = 0;
export const TIMELINE_END = 24 * 60;

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

export function parseDateKey(key) {
  const d = new Date(String(key) + 'T12:00:00');
  return isNaN(d.getTime()) ? new Date() : d;
}

export function isWeekdayClosed(date, hours) {
  const d = date instanceof Date ? date : new Date(date);
  const weekday = d.getDay();
  if (hours && hours.days && typeof hours.days === 'object') {
    const dayCfg = hours.days[String(weekday)] ?? hours.days[weekday];
    if (dayCfg != null) return !!dayCfg.closed;
  }
  return (hours?.closedWeekdays || []).indexOf(weekday) !== -1;
}

function parseTimeLabelToMinutes(label) {
  const text = String(label || '').trim();
  if (!text) return null;
  const match24 = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) return Number(match24[1]) * 60 + Number(match24[2]);
  const match12 = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match12) {
    let hour = Number(match12[1]);
    const minute = Number(match12[2] || 0);
    const meridiem = match12[3].toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
  return null;
}

export function getDayHours(date, hours) {
  const d = date instanceof Date ? date : new Date(date);
  const weekday = d.getDay();
  let startHour = hours?.slotDayStartHour ?? 8;
  let startMinute = hours?.slotDayStartMinute ?? 0;
  let endHour = hours?.slotDayEndHour ?? 19;
  let endMinute = hours?.slotDayEndMinute ?? 30;

  if (hours && hours.days && typeof hours.days === 'object') {
    const dayCfg = hours.days[String(weekday)] ?? hours.days[weekday];
    if (dayCfg && typeof dayCfg === 'object' && !dayCfg.closed) {
      const openMin = parseTimeLabelToMinutes(dayCfg.open);
      const closeMin = parseTimeLabelToMinutes(dayCfg.close);
      if (openMin != null && closeMin != null && closeMin > openMin) {
        return {
          startHour: Math.floor(openMin / 60),
          startMinute: openMin % 60,
          endHour: Math.floor(closeMin / 60),
          endMinute: closeMin % 60,
        };
      }
    }
  }

  const wh = hours?.weekdayHours || {};
  const dayHours = wh[String(weekday)] || wh[weekday];
  if (dayHours && typeof dayHours === 'object') {
    if (dayHours.startHour != null) startHour = Number(dayHours.startHour);
    if (dayHours.startMinute != null) startMinute = Number(dayHours.startMinute);
    if (dayHours.endHour != null) endHour = Number(dayHours.endHour);
    if (dayHours.endMinute != null) endMinute = Number(dayHours.endMinute);
  }
  return { startHour, startMinute, endHour, endMinute };
}

export function getDayOpenCloseBoundaries(date, hours) {
  const h = getDayHours(date, hours);
  return {
    openMinutes: h.startHour * 60 + h.startMinute,
    closeMinutes: h.endHour * 60 + h.endMinute,
  };
}

export function buildClosedRegions(date, hours) {
  if (isWeekdayClosed(date, hours)) {
    return [{ startMinutes: TIMELINE_START, endMinutes: TIMELINE_END, kind: 'closed' }];
  }
  const { openMinutes, closeMinutes } = getDayOpenCloseBoundaries(date, hours);
  const regions = [];
  if (openMinutes > TIMELINE_START) {
    regions.push({ startMinutes: TIMELINE_START, endMinutes: openMinutes, kind: 'closed' });
  }
  if (closeMinutes < TIMELINE_END) {
    regions.push({ startMinutes: closeMinutes, endMinutes: TIMELINE_END, kind: 'closed' });
  }
  return regions;
}

export function getTimelineBoundsForDate(date, hours) {
  const isClosedDay = isWeekdayClosed(date, hours);
  const { openMinutes, closeMinutes } = getDayOpenCloseBoundaries(date, hours);
  if (closeMinutes <= openMinutes) {
    return {
      timelineStartMinutes: 8 * 60,
      timelineEndMinutes: 18 * 60,
      isClosedDay,
    };
  }
  return {
    timelineStartMinutes: openMinutes,
    timelineEndMinutes: closeMinutes,
    isClosedDay,
  };
}

export function timelineDurationHours(bounds) {
  return Math.max(0.5, (bounds.timelineEndMinutes - bounds.timelineStartMinutes) / 60);
}

export function resolveTimelineBounds(hours, date) {
  const bounds = getTimelineBoundsForDate(date, hours);
  return {
    timelineStartMinutes: bounds.timelineStartMinutes,
    timelineEndMinutes: bounds.timelineEndMinutes,
    hourHeight: HOUR_HEIGHT,
  };
}

export function getTimelineBoundsForWeek(weekDays, hours) {
  let minOpen = null;
  let maxClose = null;
  weekDays.forEach(function (day) {
    if (isWeekdayClosed(day, hours)) return;
    const b = getDayOpenCloseBoundaries(day, hours);
    if (minOpen == null || b.openMinutes < minOpen) minOpen = b.openMinutes;
    if (maxClose == null || b.closeMinutes > maxClose) maxClose = b.closeMinutes;
  });
  if (minOpen == null || maxClose == null || maxClose <= minOpen) {
    return { timelineStartMinutes: 8 * 60, timelineEndMinutes: 18 * 60 };
  }
  return { timelineStartMinutes: minOpen, timelineEndMinutes: maxClose };
}

export function minutesFromMidnight(d) {
  return d.getHours() * 60 + d.getMinutes();
}

export function snapMinutes(m, step) {
  step = step || SNAP_MINUTES;
  return Math.round(m / step) * step;
}

export function clampMinutes(m, min, max) {
  return Math.max(min, Math.min(max, m));
}

export function formatMinutesLabel(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function overlayFromBlock(block, dateKeyStr) {
  if (!block || !block.starts_at || !block.ends_at) return null;
  const starts = new Date(block.starts_at);
  const ends = new Date(block.ends_at);
  if (isNaN(starts.getTime()) || isNaN(ends.getTime())) return null;

  const dayStart = new Date(dateKeyStr + 'T00:00:00');
  const dayEnd = new Date(dateKeyStr + 'T23:59:59.999');
  if (ends <= dayStart || starts >= dayEnd) return null;

  const clipStart = starts < dayStart ? dayStart : starts;
  const clipEnd = ends > dayEnd ? dayEnd : ends;
  let endMin = minutesFromMidnight(clipEnd);
  if (clipEnd.getHours() === 23 && clipEnd.getMinutes() === 59) endMin = TIMELINE_END;

  return {
    id: block.id,
    startMinutes: minutesFromMidnight(clipStart),
    endMinutes: Math.max(minutesFromMidnight(clipStart) + SNAP_MINUTES, endMin),
    kind: 'block',
    note: block.note || '',
  };
}

export function bookingOverlayForDate(booking, dateKeyStr) {
  if (!booking || !booking.startAt || isCancelledBooking(booking)) return null;
  if (toDateKey(booking.startAt) !== dateKeyStr) return null;
  const startMin = minutesFromMidnight(booking.startAt);
  const endMin = startMin + (booking.duration_minutes || 120);
  return {
    id: booking.id,
    startMinutes: startMin,
    endMinutes: endMin,
    kind: 'booking',
    booking: booking,
  };
}

export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function rangeInsideOpenHours(startMin, endMin, date, hours) {
  if (isWeekdayClosed(date, hours)) return false;
  const { openMinutes, closeMinutes } = getDayOpenCloseBoundaries(date, hours);
  return startMin >= openMinutes && endMin <= closeMinutes;
}

export function validateRangeSelection(startMin, endMin, date, hours, overlays) {
  if (endMin - startMin < SNAP_MINUTES) return 'Select at least 30 minutes.';
  if (!rangeInsideOpenHours(startMin, endMin, date, hours)) return 'Outside business hours.';
  for (let i = 0; i < (overlays || []).length; i++) {
    const o = overlays[i];
    if (rangesOverlap(startMin, endMin, o.startMinutes, o.endMinutes)) {
      if (o.kind === 'closed') return 'Outside business hours.';
      if (o.kind === 'block') return 'Overlaps blocked time.';
      if (o.kind === 'booking') return 'Overlaps an existing booking.';
    }
  }
  return null;
}

export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function weekDaysFrom(date) {
  const start = startOfWeek(date);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}
