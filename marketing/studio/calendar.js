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
  getDayOpenCloseBoundaries,
  isWeekdayClosed,
  monthGrid,
  overlayFromBlock,
  parseDateKey,
  snapMinutes,
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

function posStyle(startMin, endMin) {
  const top = ((startMin - TIMELINE_START) / 60) * HOUR_HEIGHT;
  const height = Math.max(52, ((endMin - startMin) / 60) * HOUR_HEIGHT);
  return 'top:' + top + 'px;height:' + height + 'px';
}

function renderHourLabels() {
  let html = '';
  for (let h = 0; h < 24; h++) {
    const label =
      h === 0
        ? '12 AM'
        : h < 12
          ? h + ' AM'
          : h === 12
            ? '12 PM'
            : h - 12 + ' PM';
    html += '<div class="studio-cal__hour-label">' + esc(label) + '</div>';
  }
  return html;
}

function renderTimelineLayers(dateKeyStr, events, opts) {
  opts = opts || {};
  const date = parseDateKey(dateKeyStr);
  const hours = store.bookingHours;
  const closed = isWeekdayClosed(date, hours);
  let html = '';

  overlaysForDate(dateKeyStr).forEach(function (o) {
    const cls = o.kind === 'block' ? 'studio-cal__overlay--block' : 'studio-cal__overlay--closed';
    html +=
      '<div class="studio-cal__overlay ' +
      cls +
      '" style="' +
      esc(posStyle(o.startMinutes, o.endMinutes)) +
      '"></div>';
  });

  if (!closed) {
    const b = getDayOpenCloseBoundaries(date, hours);
    html +=
      '<div class="studio-cal__boundary" style="top:' +
      ((b.openMinutes / 60) * HOUR_HEIGHT) +
      'px"></div>';
    html +=
      '<div class="studio-cal__boundary" style="top:' +
      ((b.closeMinutes / 60) * HOUR_HEIGHT) +
      'px"></div>';
  }

  events.forEach(function (ev) {
    const colors = getCalendarEventColors({
      styleId: ev.styleId,
      title: ev.title,
      completed: ev.completed,
    });
    html +=
      '<a class="studio-cal__event" href="' +
      esc(eventHref(ev.appointmentId)) +
      '" style="' +
      esc(posStyle(ev.startMinutes, ev.endMinutes)) +
      ';background:' +
      esc(colors.fill) +
      ';border-color:' +
      esc(colors.border) +
      '"><strong>' +
      esc(ev.title) +
      '</strong>' +
      esc(formatMinutesLabel(ev.startMinutes)) +
      ' – ' +
      esc(formatMinutesLabel(ev.endMinutes)) +
      '</a>';
  });

  if (opts.draft) {
    const err = validateRangeSelection(opts.draft.start, opts.draft.end, date, hours, overlaysForDate(dateKeyStr));
    html +=
      '<div class="studio-cal__draft' +
      (err ? ' is-conflict' : '') +
      '" style="' +
      esc(posStyle(opts.draft.start, opts.draft.end)) +
      '"></div>';
  }

  if (isToday(date)) {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    html += '<div class="studio-cal__nowline" style="top:' + ((nowMin / 60) * HOUR_HEIGHT) + 'px"></div>';
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

function renderDayView() {
  const key = toDateKey(selectedDate);
  const events = getCalendarEventsForDateKey(store.snapshot.calendarEvents, key);
  const closed = isWeekdayClosed(selectedDate, store.bookingHours);
  let body = '';

  if (closed) {
    body += '<div class="studio-cal__banner">Closed today — matches your site booking hours.</div>';
  } else if (!events.length) {
    body += '<div class="studio-cal__banner" style="border-color:var(--border);background:rgba(255,255,255,0.03)">No bookings on this day. Blocked times appear as red tint.</div>';
  }

  body +=
    '<div class="studio-cal__legend">Lines = business hours · Red tint = blocked time</div>' +
    '<div class="studio-cal__weekstrip">' +
    weekStripHtml(selectedDate) +
    '</div>' +
    '<div class="studio-cal__timeline-wrap"><div class="studio-cal__timeline-scroll" id="cal-scroll">' +
    '<div class="studio-cal__timeline"><div class="studio-cal__hours">' +
    renderHourLabels() +
    '</div><div class="studio-cal__track" id="cal-track">' +
    renderTimelineLayers(key, events) +
    '</div></div></div></div>';

  return body;
}

function renderWeekView() {
  const days = weekDaysFrom(selectedDate);
  const cols = days
    .map(function (d) {
      const key = toDateKey(d);
      const events = getCalendarEventsForDateKey(store.snapshot.calendarEvents, key);
      const closed = isWeekdayClosed(d, store.bookingHours);
      const chips = events
        .map(function (ev) {
          const colors = getCalendarEventColors({
            styleId: ev.styleId,
            title: ev.title,
            completed: ev.completed,
          });
          return (
            '<a class="studio-cal__chip" href="' +
            esc(eventHref(ev.appointmentId)) +
            '" style="background:' +
            esc(colors.fill) +
            ';border-color:' +
            esc(colors.border) +
            '">' +
            esc(formatMinutesLabel(ev.startMinutes)) +
            ' ' +
            esc(ev.title) +
            '</a>'
          );
        })
        .join('');
      return (
        '<div class="studio-cal__week-col"><div class="studio-cal__week-col-head' +
        (closed ? ' is-closed' : '') +
        '">' +
        esc(d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) +
        '</div>' +
        (chips || '<div class="studio-empty" style="padding:0.5rem;font-size:0.78rem">—</div>') +
        '</div>'
      );
    })
    .join('');

  return '<div class="studio-cal__week-grid">' + cols + '</div>';
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
      const dots = events
        .slice(0, 3)
        .map(function (ev) {
          const colors = getCalendarEventColors({ styleId: ev.styleId, title: ev.title, completed: ev.completed });
          return '<span class="studio-cal__dot" style="background:' + esc(colors.accent) + '"></span>';
        })
        .join('');
      return (
        '<button type="button" class="studio-cal__month-cell' +
        (muted ? ' is-muted' : '') +
        (sameDay(d, selectedDate) ? ' is-selected' : '') +
        (closed ? ' is-closed' : '') +
        '" data-cal-day="' +
        esc(key) +
        '"><div>' +
        esc(d.getDate()) +
        '</div><div>' +
        dots +
        (events.length > 3 ? '<small>+' + (events.length - 3) + '</small>' : '') +
        '</div></button>'
      );
    })
    .join('');

  return (
    '<div class="studio-cal__month"><div class="studio-cal__month-head">' +
    head +
    '</div><div class="studio-cal__month-grid">' +
    body +
    '</div></div>'
  );
}

function renderHome() {
  let viewBody = '';
  if (viewMode === 'week') viewBody = renderWeekView();
  else if (viewMode === 'month') viewBody = renderMonthView();
  else viewBody = renderDayView();

  const setupCta =
    !ctx.subdomain && !ctx.sitePublish?.subdomain
      ? '<div class="studio-cal__banner"><a href="/studio/website/edit" style="color:var(--pink)">Complete site setup</a> to take online bookings.</div>'
      : '';

  return '<div class="studio-cal">' + setupCta + toolbarHtml() + viewBody + '</div>';
}

function renderSchedule() {
  const key = toDateKey(selectedDate);
  const events = getCalendarEventsForDateKey(store.snapshot.calendarEvents, key);
  const blocks = store.blockedIntervals;

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
    (isWeekdayClosed(selectedDate, store.bookingHours)
      ? '<div class="studio-cal__banner">Closed on this day — you can still block the full day.</div>'
      : '') +
    '<div class="studio-cal__timeline-wrap"><div class="studio-cal__timeline-scroll" id="sched-scroll">' +
    '<div class="studio-cal__timeline"><div class="studio-cal__hours">' +
    renderHourLabels() +
    '</div><div class="studio-cal__track" id="sched-track" data-sched-track="1">' +
    renderTimelineLayers(key, events, { draft: scheduleDraft }) +
    '</div></div></div></div>' +
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
  const y = clampMinutes(
    snapMinutes(Math.round(((clientY - rect.top) / HOUR_HEIGHT) * 60) + TIMELINE_START),
    TIMELINE_START,
    TIMELINE_END - SNAP_MINUTES,
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
      e.preventDefault();
      selectedDate = parseDateKey(el.getAttribute('data-cal-day'));
      if (viewMode === 'month') viewMode = 'day';
      paint();
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

  if (viewMode === 'day' && routeInfo.view === 'home') {
    const scroll = document.getElementById('cal-scroll');
    if (scroll && isToday(selectedDate)) {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      scroll.scrollTop = Math.max(0, (nowMin / 60) * HOUR_HEIGHT - scroll.clientHeight / 3);
    }
  }
}

function paint() {
  const main = document.getElementById('studio-main');
  if (!main || !store) return;
  const routeInfo = parseCalendarRoute(route);
  const banner = main.querySelector('.studio-banner');
  const bannerHtml = banner ? banner.outerHTML : '';
  const body = routeInfo.view === 'schedule' ? renderSchedule() : renderHome();
  main.innerHTML = bannerHtml + body;
  bindEvents(routeInfo);
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
  if (store) {
    store.dispose();
    store = null;
  }
}
