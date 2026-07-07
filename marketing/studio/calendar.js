/**
 * Web Studio Calendar — Part 4 (views + schedule management).
 */
import { getCalendarEventsForDateKey } from '/js/site-data.js';
import { getCalendarEventColors } from '/js/style-event-colors.js';
import {
  HOUR_HEIGHT,
  SNAP_MINUTES,
  TIMELINE_END,
  TIMELINE_START,
  bookingOverlayForDate,
  buildClosedRegions,
  clampMinutes,
  formatMinutesLabel,
  getTimelineBoundsForDate,
  getTimelineBoundsForWeek,
  isWeekdayClosed,
  monthGrid,
  overlayFromBlock,
  parseDateKey,
  snapMinutes,
  timelineDurationHours,
  toDateKey,
  validateRangeSelection,
  weekDaysFrom,
} from '/js/calendar-availability.js';
import { createCalendarStore } from '/js/studio-calendar-api.js';

let store = null;
let ctx = null;
let route = '/studio/calendar';
let viewMode = 'day';
let selectedDate = new Date();
let scheduleDraft = null;
let clickAnchor = null;
let fittedHourHeight = null;
let homeDayFitObserver = null;
let homeDayFitAttempts = 0;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseCalendarRoute(pathname) {
  const clean = String(pathname || '').replace(/\/$/, '');
  if (clean === '/studio/calendar/schedule') return { view: 'schedule' };
  return { view: 'home' };
}

export function isCalendarRoute(r) {
  const path = String(r || '');
  if (path === '/studio/calendar' || path.startsWith('/studio/calendar/')) {
    if (/^\/studio\/calendar\/appointments\//.test(path)) return false;
    return true;
  }
  return false;
}

export function calendarPageTitle(r) {
  if (String(r || '').includes('/schedule')) return 'Schedule';
  return 'Calendar';
}

export function isCalendarHomeRoute(r) {
  const clean = String(r || '').replace(/\/$/, '');
  return clean === '/studio/calendar';
}

function sameDay(a, b) {
  return toDateKey(a) === toDateKey(b);
}

function isToday(d) {
  return sameDay(d, new Date());
}

function eventHref(id) {
  return '/studio/calendar/appointments/' + encodeURIComponent(id);
}

function overlaysForDate(dateKeyStr) {
  const hours = store.bookingHours;
  const date = parseDateKey(dateKeyStr);
  const overlays = buildClosedRegions(date, hours).slice();
  store.blockedIntervals.forEach(function (block) {
    const o = overlayFromBlock(block, dateKeyStr);
    if (o) overlays.push(o);
  });
  store.snapshot.bookings.forEach(function (b) {
    const o = bookingOverlayForDate(b, dateKeyStr);
    if (o) overlays.push(o);
  });
  return overlays;
}

function isHomeDayView() {
  return viewMode === 'day' && parseCalendarRoute(route).view === 'home';
}

function isHomeTimelineView() {
  return (viewMode === 'day' || viewMode === 'week') && parseCalendarRoute(route).view === 'home';
}

function dayTimelineBounds(date) {
  return getTimelineBoundsForDate(date, store.bookingHours);
}

function weekTimelineBounds(days) {
  return getTimelineBoundsForWeek(days, store.bookingHours);
}

function homeTimelineBounds() {
  if (viewMode === 'week') return weekTimelineBounds(weekDaysFrom(selectedDate));
  return dayTimelineBounds(selectedDate);
}

function scheduleTimelineBounds(date) {
  const bounds = dayTimelineBounds(date);
  if (bounds.isClosedDay) {
    return {
      timelineStartMinutes: TIMELINE_START,
      timelineEndMinutes: TIMELINE_END,
      isClosedDay: true,
    };
  }
  return bounds;
}

function applyTimelineCssVars(scroll, bounds, hourHeight) {
  if (!scroll || !bounds) return;
  const hourCount = timelineDurationHours(bounds);
  scroll.style.setProperty('--studio-cal-hour-count', String(hourCount));
  if (hourHeight != null) {
    scroll.style.setProperty('--studio-cal-hour-height', hourHeight + 'px');
    scroll.style.setProperty('--studio-cal-timeline-height', hourCount * hourHeight + 'px');
  }
}

function getHourHeight() {
  if (isHomeTimelineView() && fittedHourHeight != null) return fittedHourHeight;
  return HOUR_HEIGHT;
}

function disconnectHomeDayFit() {
  if (homeDayFitObserver) {
    homeDayFitObserver.disconnect();
    homeDayFitObserver = null;
  }
}

function observeHomeDayFit() {
  disconnectHomeDayFit();
  if (!isHomeTimelineView()) return;
  const scroll = document.getElementById('cal-scroll');
  if (!scroll || typeof ResizeObserver === 'undefined') return;
  homeDayFitObserver = new ResizeObserver(function () {
    syncHomeDayFit();
  });
  homeDayFitObserver.observe(scroll);
}

function dayScrollStyle(bounds) {
  const hourCount = timelineDurationHours(bounds);
  let style = '--studio-cal-hour-count:' + hourCount;
  if (fittedHourHeight != null) {
    style +=
      ';--studio-cal-hour-height:' +
      fittedHourHeight +
      'px;--studio-cal-timeline-height:' +
      hourCount * fittedHourHeight +
      'px';
  }
  return style;
}

function syncHomeDayFit() {
  if (!isHomeTimelineView()) {
    fittedHourHeight = null;
    disconnectHomeDayFit();
    return;
  }
  const bounds = homeTimelineBounds();
  const scroll = document.getElementById('cal-scroll');
  if (!scroll) return;
  const hourCount = timelineDurationHours(bounds);
  const available =
    viewMode === 'week'
      ? (scroll.querySelector('.studio-cal__week-body-row') || scroll).clientHeight
      : scroll.clientHeight;
  if (available <= 0) {
    applyTimelineCssVars(scroll, bounds, fittedHourHeight || HOUR_HEIGHT);
    if (homeDayFitAttempts < 10) {
      homeDayFitAttempts += 1;
      requestAnimationFrame(syncHomeDayFit);
    }
    return;
  }
  homeDayFitAttempts = 0;
  const next = Math.max(14, available / hourCount);
  applyTimelineCssVars(scroll, bounds, next);
  if (fittedHourHeight != null && Math.abs(fittedHourHeight - next) < 0.25) return;
  fittedHourHeight = next;
  refreshHomeDayTimeline();
}

function refreshHomeDayTimeline() {
  if (viewMode === 'week') {
    const layout = document.querySelector('.studio-cal__week-layout');
    if (!layout) return;
    layout.outerHTML = renderWeekView();
  } else {
    const layout = document.querySelector('.studio-cal__day-layout');
    if (!layout) return;
    layout.outerHTML = renderDayView();
  }
  const scroll = document.getElementById('cal-scroll');
  if (scroll && fittedHourHeight != null) {
    applyTimelineCssVars(scroll, homeTimelineBounds(), fittedHourHeight);
  }
}

function posStyle(startMin, endMin, hourHeight, timelineStart) {
  const hh = hourHeight != null ? hourHeight : HOUR_HEIGHT;
  const start = timelineStart != null ? timelineStart : TIMELINE_START;
  const top = ((startMin - start) / 60) * hh;
  const minBlock = Math.min(52, Math.max(18, hh * 0.75));
  const height = Math.max(minBlock, ((endMin - startMin) / 60) * hh);
  return 'top:' + top + 'px;height:' + height + 'px';
}

function formatHourLabel(h) {
  if (h === 0) return '12am';
  if (h < 12) return h + 'am';
  if (h === 12) return '12pm';
  return h - 12 + 'pm';
}

function defaultTimelineBounds() {
  return { timelineStartMinutes: TIMELINE_START, timelineEndMinutes: TIMELINE_END };
}

function renderHourLabels(bounds, hourHeight) {
  bounds = bounds || defaultTimelineBounds();
  const hh = hourHeight != null ? hourHeight : HOUR_HEIGHT;
  const firstHour = Math.floor(bounds.timelineStartMinutes / 60);
  const lastHour = Math.ceil(bounds.timelineEndMinutes / 60);
  let html = '';
  for (let h = firstHour; h < lastHour; h++) {
    const hourMin = h * 60;
    if (hourMin >= bounds.timelineEndMinutes) break;
    if (hourMin + 60 <= bounds.timelineStartMinutes) continue;
    const labelTop = hourMin < bounds.timelineStartMinutes ? 0 : ((hourMin - bounds.timelineStartMinutes) / 60) * hh;
    html +=
      '<div class="studio-cal__hour-label" style="top:' +
      labelTop +
      'px">' +
      esc(formatHourLabel(h)) +
      '</div>';
  }
  return html;
}

function renderHourGrid(hourHeight, bounds) {
  const hh = hourHeight != null ? hourHeight : HOUR_HEIGHT;
  bounds = bounds || defaultTimelineBounds();
  const durationHours = timelineDurationHours(bounds);
  let html = '<div class="studio-cal__gridlines" aria-hidden="true">';
  const fullHours = Math.floor(durationHours);
  for (let i = 0; i <= fullHours; i++) {
    html += '<div class="studio-cal__gridline" style="top:' + i * hh + 'px"></div>';
  }
  if (durationHours - fullHours > 0.001) {
    html += '<div class="studio-cal__gridline" style="top:' + durationHours * hh + 'px"></div>';
  }
  html += '</div>';
  return html;
}

function renderNowLine(date, hourHeight, bounds) {
  if (!isToday(date)) return '';
  bounds = bounds || defaultTimelineBounds();
  const hh = hourHeight != null ? hourHeight : HOUR_HEIGHT;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMin < bounds.timelineStartMinutes || nowMin > bounds.timelineEndMinutes) return '';
  const top = ((nowMin - bounds.timelineStartMinutes) / 60) * hh;
  const label = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    '<div class="studio-cal__nowline" style="top:' +
    top +
    'px"><span class="studio-cal__nowtime">' +
    esc(label) +
    '</span></div>'
  );
}

function renderTimelineLayers(dateKeyStr, events, opts) {
  opts = opts || {};
  const hh = opts.hourHeight != null ? opts.hourHeight : HOUR_HEIGHT;
  const bounds = opts.bounds || defaultTimelineBounds();
  const timelineStart = bounds.timelineStartMinutes;
  const timelineEnd = bounds.timelineEndMinutes;
  const showClosedOverlays = !!opts.showClosedOverlays;
  const date = parseDateKey(dateKeyStr);
  const hours = store.bookingHours;
  let html = '';

  overlaysForDate(dateKeyStr).forEach(function (o) {
    if (o.kind === 'booking') return;
    if (o.kind === 'closed' && !showClosedOverlays) return;
    if (o.endMinutes <= timelineStart || o.startMinutes >= timelineEnd) return;
    const clipStart = Math.max(o.startMinutes, timelineStart);
    const clipEnd = Math.min(o.endMinutes, timelineEnd);
    const cls = o.kind === 'block' ? 'studio-cal__overlay--block' : 'studio-cal__overlay--closed';
    html +=
      '<div class="studio-cal__overlay ' +
      cls +
      '" style="' +
      esc(posStyle(clipStart, clipEnd, hh, timelineStart)) +
      '"></div>';
  });

  events.forEach(function (ev) {
    if (ev.endMinutes <= timelineStart || ev.startMinutes >= timelineEnd) return;
    const clipStart = Math.max(ev.startMinutes, timelineStart);
    const clipEnd = Math.min(ev.endMinutes, timelineEnd);
    const colors = getCalendarEventColors({
      styleId: ev.styleId,
      title: ev.title,
      completed: ev.completed,
    });
    html +=
      '<a class="studio-cal__event" href="' +
      esc(eventHref(ev.appointmentId)) +
      '" style="' +
      esc(posStyle(clipStart, clipEnd, hh, timelineStart)) +
      ';background:' +
      esc(colors.fill) +
      ';border-color:' +
      esc(colors.border) +
      '"><strong>' +
      esc(ev.title) +
      '</strong><span class="studio-cal__event-time">' +
      esc(formatMinutesLabel(ev.startMinutes)) +
      ' – ' +
      esc(formatMinutesLabel(ev.endMinutes)) +
      '</span></a>';
  });

  if (opts.draft) {
    const err = validateRangeSelection(opts.draft.start, opts.draft.end, date, hours, overlaysForDate(dateKeyStr));
    html +=
      '<div class="studio-cal__draft' +
      (err ? ' is-conflict' : '') +
      '" style="' +
      esc(posStyle(opts.draft.start, opts.draft.end, hh, timelineStart)) +
      '"></div>';
  }

  return html;
}

function weekStripHtml(activeDate) {
  const days = weekDaysFrom(activeDate);
  return days
    .map(function (d) {
      const key = toDateKey(d);
      const closed = isWeekdayClosed(d, store.bookingHours);
      return (
        '<a href="#" class="studio-cal__daypill' +
        (sameDay(d, activeDate) ? ' is-selected' : '') +
        (closed ? ' is-closed' : '') +
        '" data-cal-day="' +
        esc(key) +
        '"><strong>' +
        esc(d.toLocaleDateString(undefined, { weekday: 'short' })) +
        '</strong><small>' +
        esc(d.getDate()) +
        '</small></a>'
      );
    })
    .join('');
}

function toolbarHtml() {
  const title =
    viewMode === 'month'
      ? selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  return (
    '<div class="studio-cal__toolbar">' +
    '<div class="studio-cal__nav">' +
    '<button type="button" data-cal-nav="prev">‹</button>' +
    '<div class="studio-cal__title">' +
    esc(title) +
    '</div>' +
    '<button type="button" data-cal-nav="next">›</button>' +
    '<button type="button" data-cal-nav="today">Today</button>' +
    '</div>' +
    '<div class="studio-cal__views">' +
    ['day', 'week', 'month']
      .map(function (m) {
        return (
          '<button type="button" data-cal-view="' +
          m +
          '" class="' +
          (viewMode === m ? 'is-active' : '') +
          '">' +
          m.charAt(0).toUpperCase() +
          m.slice(1) +
          '</button>'
        );
      })
      .join('') +
    '</div>' +
    '<div class="studio-cal__actions">' +
    '<a href="/studio/calendar/schedule">+ New appointment</a>' +
    '<a href="/studio/calendar/schedule?mode=block">Block time</a>' +
    '</div></div>'
  );
}

function calendarHeaderDateLabel() {
  if (viewMode === 'month') {
    return selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  if (viewMode === 'week') {
    const days = weekDaysFrom(selectedDate);
    const start = days[0];
    const end = days[6];
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const endLabel = end.toLocaleDateString(undefined, {
      month: sameMonth ? undefined : 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return startLabel + ' – ' + endLabel;
  }
  return selectedDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function calendarHeaderHtml() {
  const viewButtons = ['day', 'week', 'month']
    .map(function (mode) {
      const label = mode.charAt(0).toUpperCase() + mode.slice(1);
      return (
        '<button type="button" class="studio-cal__view-btn' +
        (viewMode === mode ? ' is-active' : '') +
        '" data-cal-view="' +
        mode +
        '" role="tab" aria-selected="' +
        (viewMode === mode ? 'true' : 'false') +
        '">' +
        label +
        '</button>'
      );
    })
    .join('');

  return (
    '<div class="studio-cal__head">' +
    '<div class="studio-cal__view-switch" role="tablist" aria-label="Calendar view">' +
    viewButtons +
    '</div>' +
    '<div class="studio-cal__head-actions">' +
    '<button type="button" class="studio-cal__pill-btn" data-cal-nav="today">Today</button>' +
    '<div class="studio-cal__date-switch">' +
    '<button type="button" class="studio-cal__date-switch-btn" data-cal-nav="prev" aria-label="Previous">‹</button>' +
    '<span class="studio-cal__date-switch-label">' +
    esc(calendarHeaderDateLabel()) +
    '</span>' +
    '<button type="button" class="studio-cal__date-switch-btn" data-cal-nav="next" aria-label="Next">›</button>' +
    '</div>' +
    '<a class="studio-cal__pill-btn studio-cal__pill-btn--accent" href="/studio/calendar/schedule">+ New</a>' +
    '</div></div>'
  );
}

function renderDayView() {
  const key = toDateKey(selectedDate);
  const events = getCalendarEventsForDateKey(store.snapshot.calendarEvents, key);
  const bounds = dayTimelineBounds(selectedDate);
  const hourHeight = getHourHeight();
  let notice = '';

  if (bounds.isClosedDay) {
    notice = '<div class="studio-cal__box-notice">Closed today — matches your site booking hours.</div>';
  }

  return (
    '<div class="studio-cal__day-layout">' +
    notice +
    '<div class="studio-cal__day-scroll" id="cal-scroll" style="' +
    esc(dayScrollStyle(bounds)) +
    '">' +
    '<div class="studio-cal__day-scroll-row">' +
    '<div class="studio-cal__hours-rail">' +
    '<div class="studio-cal__hours">' +
    renderHourLabels(bounds, hourHeight) +
    '</div></div>' +
    '<div class="studio-cal__box studio-cal__box--day">' +
    '<div class="studio-cal__track-wrap">' +
    '<div class="studio-cal__track" id="cal-track">' +
    renderHourGrid(hourHeight, bounds) +
    renderTimelineLayers(key, events, {
      hourHeight: hourHeight,
      bounds: bounds,
    }) +
    '</div>' +
    renderNowLine(selectedDate, hourHeight, bounds) +
    '</div></div></div></div></div>'
  );
}

function renderWeekColumnEvents(key, events, bounds, hourHeight) {
  const hh = hourHeight != null ? hourHeight : HOUR_HEIGHT;
  const timelineStart = bounds.timelineStartMinutes;
  const timelineEnd = bounds.timelineEndMinutes;
  let html = renderHourGrid(hh, bounds);
  events.forEach(function (ev) {
    if (ev.endMinutes <= timelineStart || ev.startMinutes >= timelineEnd) return;
    const clipStart = Math.max(ev.startMinutes, timelineStart);
    const clipEnd = Math.min(ev.endMinutes, timelineEnd);
    const colors = getCalendarEventColors({
      styleId: ev.styleId,
      title: ev.title,
      completed: ev.completed,
    });
    html +=
      '<a class="studio-cal__event studio-cal__event--week" href="' +
      esc(eventHref(ev.appointmentId)) +
      '" style="' +
      esc(posStyle(clipStart, clipEnd, hh, timelineStart)) +
      ';background:' +
      esc(colors.fill) +
      ';border-color:' +
      esc(colors.border) +
      '"><strong>' +
      esc(ev.title) +
      '</strong><span class="studio-cal__event-time">' +
      esc(formatMinutesLabel(ev.startMinutes)) +
      ' – ' +
      esc(formatMinutesLabel(ev.endMinutes)) +
      '</span></a>';
  });
  return html;
}

function renderWeekNowLine(bounds, hourHeight) {
  const days = weekDaysFrom(selectedDate);
  if (!days.some(function (d) {
    return isToday(d);
  })) {
    return '';
  }
  const hh = hourHeight != null ? hourHeight : HOUR_HEIGHT;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMin < bounds.timelineStartMinutes || nowMin > bounds.timelineEndMinutes) return '';
  const top = ((nowMin - bounds.timelineStartMinutes) / 60) * hh;
  const label = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return (
    '<div class="studio-cal__nowline studio-cal__nowline--week" style="top:' +
    top +
    'px"><span class="studio-cal__nowtime">' +
    esc(label) +
    '</span></div>'
  );
}

function renderWeekView() {
  const days = weekDaysFrom(selectedDate);
  const bounds = weekTimelineBounds(days);
  const hourHeight = getHourHeight();

  const headCols = days
    .map(function (d) {
      const key = toDateKey(d);
      const closed = isWeekdayClosed(d, store.bookingHours);
      return (
        '<button type="button" class="studio-cal__week-col-head' +
        (closed ? ' is-closed' : '') +
        (isToday(d) ? ' is-today' : '') +
        (sameDay(d, selectedDate) ? ' is-selected' : '') +
        '" data-cal-day="' +
        esc(key) +
        '"><span class="studio-cal__week-col-weekday">' +
        esc(d.toLocaleDateString(undefined, { weekday: 'short' })) +
        '</span><span class="studio-cal__week-col-date">' +
        esc(String(d.getDate())) +
        '</span></button>'
      );
    })
    .join('');

  const bodyCols = days
    .map(function (d) {
      const key = toDateKey(d);
      const events = getCalendarEventsForDateKey(store.snapshot.calendarEvents, key);
      const closed = isWeekdayClosed(d, store.bookingHours);
      return (
        '<div class="studio-cal__week-col' +
        (closed ? ' is-closed' : '') +
        (isToday(d) ? ' is-today' : '') +
        '"><div class="studio-cal__week-col-track"><div class="studio-cal__track">' +
        renderWeekColumnEvents(key, events, bounds, hourHeight) +
        '</div></div></div>'
      );
    })
    .join('');

  return (
    '<div class="studio-cal__week-layout">' +
    '<div class="studio-cal__week-scroll" id="cal-scroll" style="' +
    esc(dayScrollStyle(bounds)) +
    '">' +
    '<div class="studio-cal__week-scroll-inner">' +
    '<div class="studio-cal__week-head-row">' +
    '<div class="studio-cal__week-head-spacer"></div>' +
    '<div class="studio-cal__week-head-cols">' +
    headCols +
    '</div></div>' +
    '<div class="studio-cal__week-body-row">' +
    '<div class="studio-cal__hours-rail"><div class="studio-cal__hours">' +
    renderHourLabels(bounds, hourHeight) +
    '</div></div>' +
    '<div class="studio-cal__week-cols-wrap">' +
    '<div class="studio-cal__week-cols">' +
    bodyCols +
    '</div></div>' +
    renderWeekNowLine(bounds, hourHeight) +
    '</div></div></div></div></div>'
  );
}

function renderMonthEventPreviews(events) {
  const maxPreview = 3;
  const sorted = events.slice().sort(function (a, b) {
    return a.startMinutes - b.startMinutes;
  });
  const preview = sorted.slice(0, maxPreview);
  const remaining = sorted.length - preview.length;

  let html = preview
    .map(function (ev) {
      const colors = getCalendarEventColors({
        styleId: ev.styleId,
        title: ev.title,
        completed: ev.completed,
      });
      return (
        '<a class="studio-cal__month-event" href="' +
        esc(eventHref(ev.appointmentId)) +
        '" style="background:' +
        esc(colors.fill) +
        ';border-color:' +
        esc(colors.border) +
        '" title="' +
        esc(formatMinutesLabel(ev.startMinutes) + ' – ' + ev.title) +
        '"><span class="studio-cal__month-event-time">' +
        esc(formatMinutesLabel(ev.startMinutes)) +
        '</span><span class="studio-cal__month-event-title">' +
        esc(ev.title) +
        '</span></a>'
      );
    })
    .join('');

  if (remaining > 0) {
    html += '<span class="studio-cal__month-more">' + esc(String(remaining) + ' more') + '</span>';
  }

  return html;
}

function renderMonthView() {
  const y = selectedDate.getFullYear();
  const m = selectedDate.getMonth();
  const cells = monthGrid(y, m);
  const head = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    .map(function (d) {
      return '<span>' + d + '</span>';
    })
    .join('');

  const body = cells
    .map(function (d) {
      const key = toDateKey(d);
      const muted = d.getMonth() !== m;
      const closed = isWeekdayClosed(d, store.bookingHours);
      const events = getCalendarEventsForDateKey(store.snapshot.calendarEvents, key);
      return (
        '<div class="studio-cal__month-cell' +
        (muted ? ' is-muted' : '') +
        (sameDay(d, selectedDate) ? ' is-selected' : '') +
        (isToday(d) ? ' is-today' : '') +
        (closed ? ' is-closed' : '') +
        '" data-cal-day="' +
        esc(key) +
        '" role="button" tabindex="0" aria-label="' +
        esc(d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })) +
        '">' +
        '<div class="studio-cal__month-cell-top">' +
        '<span class="studio-cal__month-cell-day">' +
        esc(d.getDate()) +
        '</span></div>' +
        '<div class="studio-cal__month-events">' +
        renderMonthEventPreviews(events) +
        '</div></div>'
      );
    })
    .join('');

  return (
    '<div class="studio-cal__month-layout">' +
    '<div class="studio-cal__month">' +
    '<div class="studio-cal__month-head">' +
    head +
    '</div>' +
    '<div class="studio-cal__month-grid">' +
    body +
    '</div></div></div>'
  );
}

function renderHome() {
  const setupCta =
    !ctx.subdomain && !ctx.sitePublish?.subdomain
      ? '<div class="studio-cal__banner"><a href="/studio/website/edit" style="color:var(--pink)">Complete site setup</a> to take online bookings.</div>'
      : '';

  var body = '';
  if (viewMode === 'week') {
    body = renderWeekView();
  } else if (viewMode === 'month') {
    body = renderMonthView();
  } else {
    body = renderDayView();
  }

  return (
    '<div class="studio-cal studio-cal--home">' +
    setupCta +
    calendarHeaderHtml() +
    body +
    '</div>'
  );
}

function renderSchedule() {
  const key = toDateKey(selectedDate);
  const events = getCalendarEventsForDateKey(store.snapshot.calendarEvents, key);
  const blocks = store.blockedIntervals;
  const bounds = scheduleTimelineBounds(selectedDate);
  const closedDay = bounds.isClosedDay;
  const hourCount = timelineDurationHours(bounds);
  const timelineStyle =
    '--studio-cal-hour-count:' +
    hourCount +
    ';--studio-cal-hour-height:' +
    HOUR_HEIGHT +
    'px;--studio-cal-timeline-height:' +
    hourCount * HOUR_HEIGHT +
    'px';

  const blockList =
    blocks.length === 0
      ? '<div class="studio-empty">No blocked times yet.</div>'
      : '<ul class="studio-cal__block-list">' +
        blocks
          .map(function (b) {
            const start = b.starts_at ? new Date(b.starts_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—';
            const end = b.ends_at ? new Date(b.ends_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
            return (
              '<li><span>' +
              esc(start) +
              ' – ' +
              esc(end) +
              (b.note ? ' · ' + esc(b.note) : '') +
              '</span><button type="button" class="studio-btn studio-btn--ghost" data-remove-block="' +
              esc(b.id) +
              '">Remove</button></li>'
            );
          })
          .join('') +
        '</ul>';

  return (
    '<div class="studio-cal">' +
    '<a class="studio-back-link" href="/studio/calendar">← Calendar</a>' +
    '<div class="studio-cal__toolbar"><div><strong>Schedule</strong><div style="color:var(--white-dim);font-size:0.82rem">Drag on the timeline to book or block</div></div></div>' +
    '<div class="studio-cal__weekstrip">' +
    weekStripHtml(selectedDate) +
    '</div>' +
    (closedDay
      ? '<div class="studio-cal__banner">Closed on this day — you can still block the full day.</div>'
      : '') +
    '<div class="studio-cal__timeline-wrap"><div class="studio-cal__timeline-scroll" id="sched-scroll">' +
    '<div class="studio-cal__timeline" style="' +
    timelineStyle +
    '"><div class="studio-cal__hours">' +
    renderHourLabels(bounds, HOUR_HEIGHT) +
    '</div><div class="studio-cal__track" id="sched-track" data-sched-track="1">' +
    renderHourGrid(HOUR_HEIGHT, bounds) +
    renderTimelineLayers(key, events, { draft: scheduleDraft, bounds: bounds, showClosedOverlays: closedDay }) +
    '</div>' +
    renderNowLine(selectedDate, HOUR_HEIGHT, bounds) +
    '</div></div></div>' +
    '<p class="studio-cal__legend">Tip: click once for start, click again for end · or drag to select · snaps to 30 min</p>' +
    '<section class="studio-section"><div class="studio-section__head"><h2>Blocked times (' +
    blocks.length +
    ')</h2></div>' +
    blockList +
    '</section></div>'
  );
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'studio-cal__toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 2600);
}

function showChoiceModal(startMin, endMin) {
  const key = toDateKey(selectedDate);
  const rangeLabel = formatMinutesLabel(startMin) + ' – ' + formatMinutesLabel(endMin);
  const backdrop = document.createElement('div');
  backdrop.className = 'studio-cal__modal-backdrop';
  backdrop.innerHTML =
    '<div class="studio-cal__modal"><h3>' +
    esc(rangeLabel) +
    '</h3><p style="color:var(--white-muted);margin:0">' +
    esc(parseDateKey(key).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })) +
    '</p><div class="studio-cal__modal-actions">' +
    '<button type="button" class="studio-btn studio-btn--primary" id="cal-choice-book">New appointment</button>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="cal-choice-block">Block time</button>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="cal-choice-cancel">Cancel</button></div></div>';
  document.body.appendChild(backdrop);

  backdrop.querySelector('#cal-choice-cancel').addEventListener('click', function () {
    scheduleDraft = null;
    backdrop.remove();
    paint();
  });
  backdrop.querySelector('#cal-choice-block').addEventListener('click', function () {
    backdrop.remove();
    showBlockModal(startMin, endMin);
  });
  backdrop.querySelector('#cal-choice-book').addEventListener('click', function () {
    backdrop.remove();
    showComposerModal(startMin, endMin);
  });
}

function isoRange(startMin, endMin) {
  const d = parseDateKey(toDateKey(selectedDate));
  const start = new Date(d);
  start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
  const end = new Date(d);
  end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
  return { starts_at: start.toISOString(), ends_at: end.toISOString(), duration: endMin - startMin };
}

function showBlockModal(startMin, endMin) {
  const range = isoRange(startMin, endMin);
  const backdrop = document.createElement('div');
  backdrop.className = 'studio-cal__modal-backdrop';
  backdrop.innerHTML =
    '<div class="studio-cal__modal"><h3>Block time</h3><p style="color:var(--white-muted)">' +
    esc(formatMinutesLabel(startMin) + ' – ' + formatMinutesLabel(endMin)) +
    '</p><label style="display:grid;gap:0.35rem;font-size:0.82rem">Note (optional)<textarea class="studio-field" rows="2" id="block-note"></textarea></label>' +
    '<div class="studio-cal__modal-actions">' +
    '<button type="button" class="studio-btn studio-btn--primary" id="block-save">Block time</button>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="block-day">Block entire day</button>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="block-cancel">Cancel</button></div></div>';
  document.body.appendChild(backdrop);

  backdrop.querySelector('#block-cancel').addEventListener('click', function () {
    scheduleDraft = null;
    backdrop.remove();
    paint();
  });

  backdrop.querySelector('#block-day').addEventListener('click', function () {
    const d = parseDateKey(toDateKey(selectedDate));
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 0, 0);
    store
      .addBlock({ starts_at: dayStart.toISOString(), ends_at: dayEnd.toISOString(), note: 'Blocked day' })
      .then(function () {
        scheduleDraft = null;
        backdrop.remove();
        showToast('Day blocked');
        paint();
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not block day.');
      });
  });

  backdrop.querySelector('#block-save').addEventListener('click', function () {
    const note = backdrop.querySelector('#block-note').value;
    store
      .addBlock({ starts_at: range.starts_at, ends_at: range.ends_at, note: note })
      .then(function () {
        scheduleDraft = null;
        backdrop.remove();
        showToast('Time blocked');
        paint();
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not block time.');
      });
  });
}

function showComposerModal(startMin, endMin) {
  const range = isoRange(startMin, endMin);
  const services = store.catalogServices;
  const clients = store.snapshot.bookings.reduce(function (acc, b) {
    const key = (b.phone || b.email || b.full_name).toLowerCase();
    if (!acc[key]) acc[key] = b;
    return acc;
  }, {});
  const clientOptions = Object.values(clients)
    .map(function (c) {
      return '<option value="' + esc(c.full_name + '|' + c.phone + '|' + c.email) + '">' + esc(c.full_name) + '</option>';
    })
    .join('');

  const serviceOptions = services
    .map(function (s, i) {
      return (
        '<option value="' +
        esc(s.id) +
        '" data-price="' +
        s.price +
        '" data-duration="' +
        s.durationMinutes +
        '" data-title="' +
        esc(s.title) +
        '" data-venue="' +
        esc(s.venue) +
        '"' +
        (i === 0 ? ' selected' : '') +
        '>' +
        esc(s.title) +
        ' · $' +
        Math.round(s.price) +
        '</option>'
      );
    })
    .join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'studio-cal__modal-backdrop';
  backdrop.innerHTML =
    '<div class="studio-cal__modal" style="width:min(32rem,100%)"><h3>New appointment</h3>' +
    '<p style="color:var(--white-muted);margin:0 0 0.75rem">' +
    esc(formatMinutesLabel(startMin) + ' – ' + formatMinutesLabel(endMin)) +
    '</p>' +
    '<div class="studio-cal__form-grid">' +
    '<label>Service<select class="studio-field" id="appt-service">' +
    (serviceOptions || '<option value="">No services — add styles in Settings</option>') +
    '</select></label>' +
    (clientOptions ? '<label>Existing client (optional)<select class="studio-field" id="appt-client"><option value="">New client</option>' + clientOptions + '</select></label>' : '') +
    '<label>Full name<input class="studio-field" id="appt-name" required></label>' +
    '<label>Phone<input class="studio-field" id="appt-phone" type="tel"></label>' +
    '<label>Email<input class="studio-field" id="appt-email" type="email"></label>' +
    '<label id="appt-address-wrap" hidden>Address<input class="studio-field" id="appt-address"></label>' +
    '<label>Hair length<input class="studio-field" id="appt-hair"></label>' +
    '<label>Notes<textarea class="studio-field" rows="2" id="appt-notes"></textarea></label>' +
    '<label><input type="checkbox" id="appt-placeholder"> Placeholder slot</label>' +
    '</div><div class="studio-cal__modal-actions">' +
    '<button type="button" class="studio-btn studio-btn--primary" id="appt-save">Save appointment</button>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="appt-cancel">Cancel</button></div></div>';
  document.body.appendChild(backdrop);

  const serviceEl = backdrop.querySelector('#appt-service');
  const addressWrap = backdrop.querySelector('#appt-address-wrap');

  function syncVenue() {
    const opt = serviceEl.options[serviceEl.selectedIndex];
    const venue = opt ? opt.getAttribute('data-venue') : '';
    addressWrap.hidden = venue !== 'house';
  }
  serviceEl.addEventListener('change', syncVenue);
  syncVenue();

  const clientEl = backdrop.querySelector('#appt-client');
  if (clientEl) {
    clientEl.addEventListener('change', function () {
      const raw = clientEl.value;
      if (!raw) return;
      const parts = raw.split('|');
      backdrop.querySelector('#appt-name').value = parts[0] || '';
      backdrop.querySelector('#appt-phone').value = parts[1] || '';
      backdrop.querySelector('#appt-email').value = parts[2] || '';
    });
  }

  backdrop.querySelector('#appt-cancel').addEventListener('click', function () {
    scheduleDraft = null;
    backdrop.remove();
    paint();
  });

  backdrop.querySelector('#appt-save').addEventListener('click', function () {
    const opt = serviceEl.options[serviceEl.selectedIndex];
    if (!opt || !opt.value) {
      window.alert('Choose a service first.');
      return;
    }
    const name = backdrop.querySelector('#appt-name').value.trim();
    if (!name) {
      window.alert('Client name is required.');
      return;
    }
    let notes = backdrop.querySelector('#appt-notes').value.trim();
    if (backdrop.querySelector('#appt-placeholder').checked) {
      notes = (notes ? notes + ' · ' : '') + 'Placeholder slot';
    }
    const d = parseDateKey(toDateKey(selectedDate));
    const start = new Date(d);
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);

    store
      .createBooking({
        full_name: name,
        phone: backdrop.querySelector('#appt-phone').value.trim(),
        email: backdrop.querySelector('#appt-email').value.trim(),
        style_id: opt.value,
        style_name: opt.getAttribute('data-title') || opt.textContent,
        service_address: backdrop.querySelector('#appt-address').value.trim(),
        hair_length: backdrop.querySelector('#appt-hair').value.trim(),
        notes: notes,
        appointment_starts_at: start.toISOString(),
        appointment_date: toDateKey(selectedDate),
        duration_minutes: Number(opt.getAttribute('data-duration')) || range.duration || 120,
        estimated_total: Number(opt.getAttribute('data-price')) || 0,
      })
      .then(function () {
        scheduleDraft = null;
        backdrop.remove();
        showToast('Appointment created');
        window.location.href = '/studio/calendar';
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not create appointment.');
      });
  });
}

function minutesFromPointer(track, clientY) {
  const rect = track.getBoundingClientRect();
  const bounds = scheduleTimelineBounds(selectedDate);
  const min = bounds.timelineStartMinutes;
  const max = bounds.timelineEndMinutes - SNAP_MINUTES;
  const y = clampMinutes(
    snapMinutes(Math.round(((clientY - rect.top) / HOUR_HEIGHT) * 60) + min),
    min,
    max,
  );
  return y;
}

function finishRangeSelection(startMin, endMin) {
  if (endMin <= startMin) {
    const tmp = startMin;
    startMin = endMin;
    endMin = tmp;
  }
  if (endMin - startMin < SNAP_MINUTES) endMin = startMin + SNAP_MINUTES;
  const date = parseDateKey(toDateKey(selectedDate));
  const err = validateRangeSelection(startMin, endMin, date, store.bookingHours, overlaysForDate(toDateKey(selectedDate)));
  scheduleDraft = { start: startMin, end: endMin };
  paint();
  if (err) {
    window.alert(err);
    scheduleDraft = null;
    paint();
    return;
  }
  showChoiceModal(startMin, endMin);
}

function bindScheduleDrag() {
  const track = document.getElementById('sched-track');
  if (!track) return;

  let dragging = false;
  let dragStart = null;
  let moved = false;

  track.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    dragStart = minutesFromPointer(track, e.clientY);
    scheduleDraft = { start: dragStart, end: dragStart + SNAP_MINUTES };
    track.setPointerCapture(e.pointerId);
    paint();
  });

  track.addEventListener('pointermove', function (e) {
    if (!dragging || dragStart == null) return;
    moved = true;
    let end = minutesFromPointer(track, e.clientY);
    if (end <= dragStart) end = dragStart + SNAP_MINUTES;
    scheduleDraft = { start: dragStart, end: end };
    paint();
  });

  track.addEventListener('pointerup', function () {
    if (!dragging || dragStart == null) return;
    dragging = false;
    const end = scheduleDraft ? scheduleDraft.end : dragStart + SNAP_MINUTES;
    if (moved) {
      finishRangeSelection(dragStart, end);
    }
    dragStart = null;
  });

  track.addEventListener('click', function (e) {
    if (moved) {
      moved = false;
      return;
    }
    const min = minutesFromPointer(track, e.clientY);
    if (clickAnchor == null) {
      clickAnchor = min;
      scheduleDraft = { start: min, end: min + SNAP_MINUTES };
      paint();
      return;
    }
    finishRangeSelection(clickAnchor, min);
    clickAnchor = null;
  });
}

function bindEvents(routeInfo) {
  document.querySelectorAll('[data-cal-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      viewMode = btn.getAttribute('data-cal-view') || 'day';
      paint();
    });
  });

  document.querySelectorAll('[data-cal-nav]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const action = btn.getAttribute('data-cal-nav');
      if (action === 'today') {
        selectedDate = new Date();
      } else if (viewMode === 'month') {
        selectedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + (action === 'next' ? 1 : -1), 1);
      } else if (viewMode === 'week') {
        selectedDate.setDate(selectedDate.getDate() + (action === 'next' ? 7 : -7));
      } else {
        selectedDate.setDate(selectedDate.getDate() + (action === 'next' ? 1 : -1));
      }
      paint();
    });
  });

  document.querySelectorAll('[data-cal-day]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      if (e.target.closest('.studio-cal__month-event')) return;
      e.preventDefault();
      selectedDate = parseDateKey(el.getAttribute('data-cal-day'));
      if (viewMode === 'month' || viewMode === 'week') viewMode = 'day';
      paint();
    });
  });

  document.querySelectorAll('.studio-cal__month-event').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  });

  document.querySelectorAll('[data-remove-block]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-remove-block');
      if (!window.confirm('Remove this blocked time?')) return;
      store.removeBlock(id).then(function () {
        showToast('Block removed');
        paint();
      });
    });
  });

  if (routeInfo.view === 'schedule') {
    bindScheduleDrag();
    const params = new URLSearchParams(window.location.search);
    if (params.get('mode') === 'block') {
      scheduleDraft = { start: 10 * 60, end: 11 * 60 };
    }
  }
}

function paint() {
  const main = document.getElementById('studio-main');
  if (!main || !store) return;
  fittedHourHeight = null;
  homeDayFitAttempts = 0;
  const routeInfo = parseCalendarRoute(route);
  const content = document.querySelector('.studio-content');
  if (content) {
    content.classList.toggle('studio-content--calendar-home', isCalendarHomeRoute(route));
  }
  const topbar = document.getElementById('studio-topbar');
  if (topbar) topbar.hidden = isCalendarHomeRoute(route);
  const banner = main.querySelector('.studio-banner');
  const bannerHtml = banner ? banner.outerHTML : '';
  const body = routeInfo.view === 'schedule' ? renderSchedule() : renderHome();
  main.innerHTML = bannerHtml + body;
  bindEvents(routeInfo);
  if (isHomeTimelineView()) {
    requestAnimationFrame(function () {
      syncHomeDayFit();
      observeHomeDayFit();
    });
  } else {
    disconnectHomeDayFit();
  }
}

export async function mountCalendar(mountCtx, mountRoute) {
  ctx = mountCtx;
  route = mountRoute || '/studio/calendar';
  clickAnchor = null;
  scheduleDraft = null;

  const params = new URLSearchParams(window.location.search);
  const dayParam = params.get('day');
  if (dayParam) selectedDate = parseDateKey(dayParam);

  const main = document.getElementById('studio-main');
  if (!main) return;

  if (store) {
    store.dispose();
    store = null;
  }

  const banner = main.querySelector('.studio-banner');
  main.innerHTML = (banner ? banner.outerHTML : '') + '<div class="studio-cal"><div class="studio-empty">Loading calendar…</div></div>';

  store = await createCalendarStore(ctx, function () {
    paint();
  });

  await paint();
}

export function disposeCalendar() {
  disconnectHomeDayFit();
  fittedHourHeight = null;
  if (store) {
    store.dispose();
    store = null;
  }
}
