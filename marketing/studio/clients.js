/**
 * Web Studio Clients — Part 5.
 */
import { fmtMoney, getClientById } from '/js/site-data.js';
import {
  CLIENT_EMAIL_TEMPLATES,
  applyPlaceholders,
  buildClientMergeContext,
  isValidClientEmail,
} from '/js/client-email.js';
import {
  DEFAULT_CLIENT_REMINDER_RULES,
  REMINDER_OFFSET_PRESETS,
  loadClientReminderSettings,
  sampleReminderPreview,
  saveClientReminderSettings,
} from '/js/client-reminders.js';
import { getCalendarEventColors } from '/js/style-event-colors.js';
import { createBookingsStore, styleCoverUrl } from '/js/studio-bookings.js';
import { sendClientContactEmail } from '/js/studio-clients-api.js';
import { liveSiteUrl } from '/js/studio-access.js';

const AVATAR_PALETTE = ['#fce7f3', '#dbeafe', '#dcfce7', '#fef3c7', '#ede9fe', '#ffedd5'];
const AVATAR_INK = ['#be185d', '#1d4ed8', '#15803d', '#b45309', '#6d28d9', '#c2410c'];
const PLACEHOLDERS = ['{firstName}', '{clientName}', '{styleName}', '{businessName}', '{appointmentDate}', '{appointmentTime}', '{siteUrl}'];

let store = null;
let ctx = null;
let route = '/studio/clients';
let searchOpen = false;
let searchQuery = '';
let selectMode = false;
let selectedIds = new Set();
let historyFilter = 'all';
let reminderSettings = null;
let savingReminders = false;

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseClientsRoute(pathname) {
  const clean = String(pathname || '').replace(/\/$/, '');
  if (clean === '/studio/clients/reminders') return { view: 'reminders' };
  const detail = clean.match(/^\/studio\/clients\/([^/]+)$/);
  if (detail && detail[1] !== 'reminders') {
    return { view: 'detail', clientId: decodeURIComponent(detail[1]) };
  }
  return { view: 'list' };
}

export function isClientsRoute(r) {
  const path = String(r || '');
  return path === '/studio/clients' || path.startsWith('/studio/clients/');
}

export function isClientsHomeRoute(r) {
  const clean = String(r || '').replace(/\/$/, '');
  return clean === '/studio/clients';
}

export function clientsPageTitle(r) {
  const info = parseClientsRoute(r);
  if (info.view === 'reminders') return 'Reminders';
  if (info.view === 'detail') return 'Client';
  return 'Clients';
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initials(name) {
  const parts = String(name || 'C').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || 'C').toUpperCase();
}

function avatarStyle(clientId) {
  const i = hashString(clientId) % AVATAR_PALETTE.length;
  return 'background:' + AVATAR_PALETTE[i] + ';color:' + AVATAR_INK[i];
}

function clientHref(id) {
  return '/studio/clients/' + encodeURIComponent(id);
}

function businessMeta() {
  const name =
    ctx.profile?.business_name || ctx.profile?.full_name || ctx.session?.user?.email || 'Your business';
  const slug = ctx.subdomain?.subdomain || ctx.sitePublish?.subdomain || '';
  const siteUrl = slug ? liveSiteUrl(slug, ctx.rootDomain) : '';
  return { businessName: name, siteUrl: siteUrl || '' };
}

function filteredClients() {
  const q = searchQuery.trim().toLowerCase();
  let list = store.snapshot.clients || [];
  if (q) {
    list = list.filter(function (c) {
      return c.name.toLowerCase().includes(q);
    });
  }
  return list;
}

function statusLabel(status) {
  const map = {
    completed: 'Completed',
    upcoming: 'Upcoming',
    pending: 'Pending',
    cancelled: 'Cancelled',
    in_progress: 'In session',
  };
  return map[status] || status;
}

function statusClass(status) {
  const map = {
    completed: 'studio-status--completed',
    upcoming: 'studio-status--awaiting',
    pending: 'studio-status--pending',
    cancelled: 'studio-status--cancelled',
    in_progress: 'studio-status--active',
  };
  return 'studio-status ' + (map[status] || '');
}

function filterPastBookings(bookings, filter) {
  if (filter === 'all') return bookings;
  if (filter === 'upcoming') {
    return bookings.filter(function (b) {
      return b.status === 'upcoming' || b.status === 'in_progress';
    });
  }
  if (filter === 'pending') return bookings.filter(function (b) {
    return b.status === 'pending';
  });
  if (filter === 'completed') return bookings.filter(function (b) {
    return b.status === 'completed';
  });
  if (filter === 'cancelled') return bookings.filter(function (b) {
    return b.status === 'cancelled';
  });
  return bookings;
}

function renderList() {
  const clients = filteredClients();
  const total = (store.snapshot.clients || []).length;
  const hasSite = !!(ctx.subdomain?.subdomain || ctx.sitePublish?.subdomain);
  const countLabel = hasSite ? total + ' client' + (total === 1 ? '' : 's') : 'Link a site to load clients';

  let searchBar = '';
  if (searchOpen) {
    searchBar =
      '<input class="studio-clients__search studio-field" type="search" id="clients-search" placeholder="Search clients" value="' +
      esc(searchQuery) +
      '">';
  }

  let selectBar = '';
  if (selectMode) {
    const selected = clients.filter(function (c) {
      return selectedIds.has(c.id);
    });
    const withEmail = selected.filter(function (c) {
      return isValidClientEmail(c.email);
    });
    selectBar =
      '<div class="studio-clients__select-bar"><span>' +
      selected.length +
      ' selected · ' +
      withEmail.length +
      ' with email</span>' +
      (withEmail.length
        ? '<button type="button" class="studio-clients__pill-btn studio-clients__pill-btn--accent" id="clients-compose">Compose</button>'
        : '') +
      '<button type="button" class="studio-clients__pill-btn" id="clients-cancel-select">Done</button></div>';
  }

  let listBody = '';
  if (!hasSite) {
    listBody = '<div class="studio-clients__empty">No linked site yet</div>';
  } else if (!total) {
    listBody = '<div class="studio-clients__empty">No clients yet</div>';
  } else if (!clients.length) {
    listBody = '<div class="studio-clients__empty">No results</div>';
  } else {
    const listHead =
      '<div class="studio-clients__list-head' +
      (selectMode ? ' studio-clients__list-head--select' : '') +
      '">' +
      (selectMode ? '<span></span>' : '') +
      '<span>Client</span><span>Bookings</span><span>Spent</span></div>';

    listBody =
      listHead +
      clients
        .map(function (c) {
          const checked = selectedIds.has(c.id);
          const validEmail = isValidClientEmail(c.email);
          const rowClass =
            'studio-client-row' +
            (selectMode ? ' studio-client-row--select' : '') +
            (validEmail || !selectMode ? '' : ' is-muted');
          const rowInner =
            (selectMode
              ? '<input type="checkbox" class="studio-client-row__check" data-client-check="' +
                esc(c.id) +
                '"' +
                (checked ? ' checked' : '') +
                (validEmail ? '' : ' disabled') +
                '>'
              : '') +
            '<span class="studio-client-row__identity">' +
            '<span class="studio-client-avatar" style="' +
            esc(avatarStyle(c.id)) +
            '">' +
            esc(initials(c.name)) +
            '</span>' +
            '<span class="studio-client-row__name">' +
            esc(c.name) +
            '</span></span>' +
            '<span class="studio-client-row__bookings">' +
            esc(String(c.totalBookings)) +
            '</span>' +
            '<span class="studio-client-row__spent">' +
            esc(fmtMoney(c.totalSpent)) +
            '</span>';

          if (selectMode) {
            return (
              '<div class="' +
              rowClass +
              '" data-client-row="' +
              esc(c.id) +
              '">' +
              rowInner +
              '</div>'
            );
          }
          return (
            '<a class="' +
            rowClass +
            '" href="' +
            esc(clientHref(c.id)) +
            '">' +
            rowInner +
            '</a>'
          );
        })
        .join('');
  }

  return (
    '<div class="studio-clients studio-clients--home">' +
    '<div class="studio-clients__toolbar">' +
    '<span class="studio-clients__count">' +
    esc(countLabel) +
    '</span>' +
    '<div class="studio-clients__toolbar-actions">' +
    '<button type="button" class="studio-clients__pill-btn' +
    (searchOpen ? ' is-active' : '') +
    '" id="clients-search-toggle">Search</button>' +
    '<button type="button" class="studio-clients__pill-btn' +
    (selectMode ? ' is-active' : '') +
    '" id="clients-email-mode">Email</button>' +
    '<a class="studio-clients__pill-btn" href="/studio/clients/reminders">Reminders</a>' +
    '</div></div>' +
    searchBar +
    selectBar +
    '<div class="studio-clients__panel">' +
    listBody +
    '</div></div>'
  );
}

function renderDetail(client) {
  const hairLine = client.hairTypes.length ? client.hairTypes[0] : '';
  const avgSpend = client.totalBookings ? Math.round(client.totalSpent / client.totalBookings) : 0;
  const bookings = filterPastBookings(client.pastBookings, historyFilter);

  const overviewRows = [
    ['Bookings', String(client.totalBookings)],
    ['Total spent', fmtMoney(client.totalSpent)],
    ['Avg. spend', fmtMoney(avgSpend)],
    ['Client since', client.memberSince],
  ];
  if (client.avgSessionMinutes > 0) overviewRows.push(['Avg. session', client.avgSessionMinutes + ' min']);
  if (client.totalTips > 0) overviewRows.push(['Total tips', fmtMoney(client.totalTips)]);

  const overviewHtml = overviewRows
    .map(function (row) {
      return (
        '<div class="studio-detail-row"><span>◦</span><span class="studio-detail-row__label">' +
        esc(row[0]) +
        '</span><span class="studio-detail-row__value">' +
        esc(row[1]) +
        '</span></div>'
      );
    })
    .join('');

  const emailHtml = isValidClientEmail(client.email)
    ? '<a href="mailto:' + esc(client.email) + '">' + esc(client.email) + '</a>'
    : '<span style="color:var(--white-dim)">—</span>';
  const phoneHtml = client.phone
    ? '<a href="tel:' + esc(client.phone) + '">' + esc(client.phone) + '</a>'
    : '<span style="color:var(--white-dim)">—</span>';

  const favHtml =
    client.favoriteOrders.length === 0
      ? '<div class="studio-empty" style="padding:0 1rem 1rem">No favorites yet</div>'
      : '<div class="studio-fav-grid">' +
        client.favoriteOrders
          .map(function (f) {
            const cover = f.styleId ? store.coverForStyle(f.styleId) : null;
            const thumb = cover
              ? '<img class="studio-fav-item__thumb" src="' + esc(styleCoverUrl(cover)) + '" alt="">'
              : (function () {
                  const colors = getCalendarEventColors({ styleId: f.styleId, title: f.service });
                  return (
                    '<span class="studio-fav-item__initial" style="background:' +
                    colors.fill +
                    ';color:' +
                    colors.accent +
                    '">' +
                    esc((f.service || 'S').charAt(0).toUpperCase()) +
                    '</span>'
                  );
                })();
            return (
              '<div class="studio-fav-item">' +
              thumb +
              '<span>' +
              esc(f.service) +
              ' ×' +
              f.count +
              '</span></div>'
            );
          })
          .join('') +
        '</div>';

  const historyHtml =
    bookings.length === 0
      ? '<div class="studio-empty">No bookings in this filter</div>'
      : bookings
          .map(function (b) {
            const colors = getCalendarEventColors({
              styleId: b.styleId,
              title: b.service,
              completed: b.status === 'completed',
            });
            const meta =
              esc(b.date) +
              (b.time ? ' · ' + esc(b.time) : '') +
              (b.hairType ? ' · ' + esc(b.hairType) : '') +
              (b.productCount ? ' · ' + b.productCount + ' product(s)' : '');
            return (
              '<a class="studio-history-row" href="/studio/dashboard/appointments/' +
              encodeURIComponent(b.id) +
              '"><span class="studio-history-row__accent" style="background:' +
              esc(colors.accent) +
              '"></span><span><strong>' +
              esc(b.service) +
              '</strong><div class="studio-history-row__meta"><span class="' +
              statusClass(b.status) +
              '">' +
              esc(statusLabel(b.status)) +
              '</span> · ' +
              meta +
              '</div></span><span class="studio-history-row__amount">' +
              esc(fmtMoney(b.amount)) +
              ' ›</span></a>'
            );
          })
          .join('');

  const notesSection =
    client.notes && client.notes !== 'No notes yet.'
      ? '<section class="studio-section"><div class="studio-section__head"><h2>Notes</h2></div><div style="padding:0.85rem 1rem;line-height:1.55">' +
        esc(client.notes) +
        '</div></section>'
      : '';

  const filters = ['all', 'upcoming', 'pending', 'completed', 'cancelled']
    .map(function (f) {
      return (
        '<button type="button" data-history-filter="' +
        f +
        '" class="' +
        (historyFilter === f ? 'is-active' : '') +
        '">' +
        f.charAt(0).toUpperCase() +
        f.slice(1) +
        '</button>'
      );
    })
    .join('');

  return (
    '<div class="studio-clients">' +
    '<a class="studio-back-link" href="/studio/clients">← Clients</a>' +
    '<section class="studio-section" style="padding:0;overflow:hidden">' +
    '<div class="studio-client-hero">' +
    '<span class="studio-client-avatar" style="' +
    esc(avatarStyle(client.id)) +
    '">' +
    esc(initials(client.name)) +
    '</span><div><h2>' +
    esc(client.name) +
    '</h2><p>' +
    client.totalBookings +
    ' booking' +
    (client.totalBookings === 1 ? '' : 's') +
    (hairLine ? ' · ' + esc(hairLine) : '') +
    '</p></div></div>' +
    '<div class="studio-section__head" style="border-bottom:1px solid rgba(255,255,255,0.06)"><h2>Overview</h2></div>' +
    overviewHtml +
    '</section>' +
    '<section class="studio-section" style="padding:0;overflow:hidden">' +
    '<div class="studio-section__head"><h2>Contact</h2></div>' +
    '<div class="studio-detail-row"><span>✉</span><span class="studio-detail-row__label">Email</span><span class="studio-detail-row__value">' +
    emailHtml +
    '</span></div>' +
    '<div class="studio-detail-row"><span>☎</span><span class="studio-detail-row__label">Phone</span><span class="studio-detail-row__value">' +
    phoneHtml +
    '</span></div></section>' +
    '<section class="studio-section" style="padding:0;overflow:hidden">' +
    '<div class="studio-section__head"><h2>Favorite services</h2></div>' +
    favHtml +
    '</section>' +
    (client.hairTypes.length
      ? '<section class="studio-section"><div class="studio-section__head"><h2>Hair profile</h2></div><p style="padding:0 1rem 1rem;margin:0">' +
        esc(client.hairTypes.join(' · ')) +
        '</p></section>'
      : '') +
    notesSection +
    '<section class="studio-section" style="padding:0;overflow:hidden">' +
    '<div class="studio-section__head"><h2>Booking history</h2></div>' +
    '<div class="studio-history-filters">' +
    filters +
    '</div>' +
    historyHtml +
    '</section></div>'
  );
}

function renderReminders() {
  const rules = reminderSettings?.rules || DEFAULT_CLIENT_REMINDER_RULES;
  const previewCtx = Object.assign({}, businessMeta(), { businessName: businessMeta().businessName });

  const body = rules
    .map(function (rule, index) {
      const preview = applyPlaceholders(rule.message, sampleReminderPreview(previewCtx));
      const presetBtns = REMINDER_OFFSET_PRESETS.map(function (p) {
        return (
          '<button type="button" data-rule-offset="' +
          index +
          '" data-hours="' +
          p.hours +
          '" class="' +
          (rule.offsetHours === p.hours ? 'is-active' : '') +
          '">' +
          esc(p.label) +
          '</button>'
        );
      }).join('');

      return (
        '<div class="studio-reminder-rule" data-rule-index="' +
        index +
        '"><div class="studio-reminder-rule__head"><strong>' +
        esc(rule.label) +
        '</strong><label><input type="checkbox" data-rule-enabled="' +
        index +
        '"' +
        (rule.enabled ? ' checked' : '') +
        '> Enabled</label></div>' +
        '<div style="display:flex;gap:0.5rem;font-size:0.82rem;margin-bottom:0.5rem">' +
        '<label><input type="radio" name="timing-' +
        index +
        '" value="before_booking" data-rule-timing="' +
        index +
        '"' +
        (rule.timing === 'before_booking' ? ' checked' : '') +
        '> Before appointment</label>' +
        '<label><input type="radio" name="timing-' +
        index +
        '" value="after_booking" data-rule-timing="' +
        index +
        '"' +
        (rule.timing === 'after_booking' ? ' checked' : '') +
        '> After appointment</label></div>' +
        '<div class="studio-reminder-presets">' +
        presetBtns +
        '</div>' +
        '<label style="display:grid;gap:0.25rem;font-size:0.78rem;color:var(--white-dim)">Subject<input class="studio-field" data-rule-subject="' +
        index +
        '" value="' +
        esc(rule.subject) +
        '"></label>' +
        '<div class="studio-placeholder-bar">' +
        PLACEHOLDERS.map(function (ph) {
          return '<button type="button" data-insert-placeholder="' + index + '" data-ph="' + esc(ph) + '">' + esc(ph) + '</button>';
        }).join('') +
        '</div>' +
        '<label style="display:grid;gap:0.25rem;font-size:0.78rem;color:var(--white-dim);margin-top:0.5rem">Message<textarea class="studio-field" rows="4" data-rule-message="' +
        index +
        '">' +
        esc(rule.message) +
        '</textarea></label>' +
        '<div class="studio-reminder-preview">' +
        esc(preview) +
        '</div></div>'
      );
    })
    .join('');

  return (
    '<div class="studio-clients">' +
    '<a class="studio-back-link" href="/studio/clients">← Clients</a>' +
    '<div class="studio-clients__head"><div><h1>Email reminders</h1><p class="studio-clients__sub">Automated emails are sent by Styld on your schedule. Edit rules here.</p></div>' +
    '<button type="button" class="studio-btn studio-btn--primary" id="reminders-save"' +
    (savingReminders ? ' disabled' : '') +
    '>' +
    (savingReminders ? 'Saving…' : 'Save rules') +
    '</button></div>' +
    '<section class="studio-section" style="padding:0;overflow:hidden">' +
    body +
    '</section></div>'
  );
}

function showComposeModal() {
  const selected = (store.snapshot.clients || []).filter(function (c) {
    return selectedIds.has(c.id) && isValidClientEmail(c.email);
  });
  if (!selected.length) return;

  const meta = businessMeta();
  const templateOptions = CLIENT_EMAIL_TEMPLATES.map(function (t) {
    return '<option value="' + esc(t.id) + '">' + esc(t.label) + '</option>';
  }).join('');

  const backdrop = document.createElement('div');
  backdrop.className = 'studio-compose-backdrop';
  backdrop.innerHTML =
    '<div class="studio-compose-panel"><h3>Email ' +
    selected.length +
    ' client' +
    (selected.length === 1 ? '' : 's') +
    '</h3>' +
    '<div class="studio-compose-grid">' +
    '<label>Template<select class="studio-field" id="compose-template">' +
    templateOptions +
    '</select></label>' +
    '<label>Subject<input class="studio-field" id="compose-subject"></label>' +
    '<label>Message<textarea class="studio-field" rows="6" id="compose-message"></textarea></label>' +
    '</div>' +
    '<div class="studio-compose-grid" style="margin-top:0.75rem">' +
    '<button type="button" class="studio-btn studio-btn--primary" id="compose-send">Send email</button>' +
    '<button type="button" class="studio-btn studio-btn--ghost" id="compose-cancel">Cancel</button></div></div>';
  document.body.appendChild(backdrop);

  const templateEl = backdrop.querySelector('#compose-template');
  const subjectEl = backdrop.querySelector('#compose-subject');
  const messageEl = backdrop.querySelector('#compose-message');

  function applyTemplate(id) {
    const t = CLIENT_EMAIL_TEMPLATES.find(function (x) {
      return x.id === id;
    });
    if (!t) return;
    const sample = buildClientMergeContext(selected[0], meta.businessName, meta.siteUrl);
    subjectEl.value = applyPlaceholders(t.defaultSubject, sample);
    messageEl.value = applyPlaceholders(t.defaultMessage, sample);
  }

  applyTemplate(templateEl.value);
  templateEl.addEventListener('change', function () {
    applyTemplate(templateEl.value);
  });

  backdrop.querySelector('#compose-cancel').addEventListener('click', function () {
    backdrop.remove();
  });

  backdrop.querySelector('#compose-send').addEventListener('click', function () {
    const subject = subjectEl.value.trim();
    const message = messageEl.value.trim();
    if (!subject || !message) {
      window.alert('Subject and message are required.');
      return;
    }
    const btn = backdrop.querySelector('#compose-send');
    btn.disabled = true;
    sendClientContactEmail(ctx, {
      templateId: templateEl.value,
      subject: subject,
      message: message,
      clients: selected,
    })
      .then(function (res) {
        backdrop.remove();
        selectMode = false;
        selectedIds = new Set();
        const sent = res && (res.sent != null ? res.sent : selected.length);
        window.alert('Sent to ' + sent + ' client(s).');
        paint();
      })
      .catch(function (err) {
        window.alert(err && err.message ? err.message : 'Could not send email.');
        btn.disabled = false;
      });
  });
}

function collectReminderRulesFromDom() {
  const rules = (reminderSettings?.rules || []).map(function (r) {
    return Object.assign({}, r);
  });
  document.querySelectorAll('[data-rule-index]').forEach(function (el) {
    const index = Number(el.getAttribute('data-rule-index'));
    const enabled = el.querySelector('[data-rule-enabled="' + index + '"]');
    const subject = el.querySelector('[data-rule-subject="' + index + '"]');
    const message = el.querySelector('[data-rule-message="' + index + '"]');
    const timing = el.querySelector('[data-rule-timing="' + index + '"]:checked');
    if (!rules[index]) return;
    rules[index].enabled = enabled ? enabled.checked : rules[index].enabled;
    rules[index].subject = subject ? subject.value : rules[index].subject;
    rules[index].message = message ? message.value : rules[index].message;
    rules[index].timing = timing ? timing.value : rules[index].timing;
  });
  return rules;
}

function bindListEvents() {
  const searchToggle = document.getElementById('clients-search-toggle');
  if (searchToggle) {
    searchToggle.addEventListener('click', function () {
      searchOpen = !searchOpen;
      if (!searchOpen) searchQuery = '';
      paint();
    });
  }

  const searchInput = document.getElementById('clients-search');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value;
      paint();
    });
  }

  document.getElementById('clients-email-mode')?.addEventListener('click', function () {
    selectMode = !selectMode;
    if (!selectMode) selectedIds = new Set();
    paint();
  });

  document.getElementById('clients-cancel-select')?.addEventListener('click', function () {
    selectMode = false;
    selectedIds = new Set();
    paint();
  });

  document.getElementById('clients-compose')?.addEventListener('click', showComposeModal);

  document.querySelectorAll('[data-client-check]').forEach(function (el) {
    el.addEventListener('change', function () {
      const id = el.getAttribute('data-client-check');
      if (el.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      paint();
    });
  });

  document.querySelectorAll('[data-client-row]').forEach(function (row) {
    row.addEventListener('click', function (e) {
      if (e.target.matches('input')) return;
      const id = row.getAttribute('data-client-row');
      const cb = row.querySelector('[data-client-check="' + id + '"]');
      if (cb && !cb.disabled) {
        cb.checked = !cb.checked;
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        paint();
      }
    });
  });
}

function bindDetailEvents() {
  document.querySelectorAll('[data-history-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      historyFilter = btn.getAttribute('data-history-filter') || 'all';
      paint();
    });
  });
}

function bindReminderEvents() {
  document.querySelectorAll('[data-rule-offset]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const index = Number(btn.getAttribute('data-rule-offset'));
      const hours = Number(btn.getAttribute('data-hours'));
      if (reminderSettings?.rules[index]) {
        reminderSettings.rules[index].offsetHours = hours;
        paint();
      }
    });
  });

  document.querySelectorAll('[data-insert-placeholder]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const index = btn.getAttribute('data-insert-placeholder');
      const ph = btn.getAttribute('data-ph');
      const ta = document.querySelector('[data-rule-message="' + index + '"]');
      if (ta) {
        ta.value += ph;
        if (reminderSettings?.rules[index]) reminderSettings.rules[index].message = ta.value;
        paint();
      }
    });
  });

  document.getElementById('reminders-save')?.addEventListener('click', function () {
    const rules = collectReminderRulesFromDom();
    savingReminders = true;
    paint();
    saveClientReminderSettings(ctx.session.user.id, { rules: rules })
      .then(function () {
        reminderSettings = { rules: rules };
        savingReminders = false;
        window.alert('Reminder settings saved.');
        paint();
      })
      .catch(function (err) {
        savingReminders = false;
        window.alert(err && err.message ? err.message : 'Could not save settings.');
        paint();
      });
  });
}

async function paint() {
  const main = document.getElementById('studio-main');
  if (!main || !store) return;
  const routeInfo = parseClientsRoute(route);
  const content = document.querySelector('.studio-content');
  if (content) {
    content.classList.toggle('studio-content--clients-home', isClientsHomeRoute(route));
  }
  const topbar = document.getElementById('studio-topbar');
  if (topbar) topbar.hidden = isClientsHomeRoute(route);
  const banner = main.querySelector('.studio-banner');
  const bannerHtml = banner ? banner.outerHTML : '';

  let body = '';
  if (routeInfo.view === 'reminders') {
    if (!reminderSettings) {
      reminderSettings = await loadClientReminderSettings(ctx.session.user.id);
    }
    body = renderReminders();
  } else if (routeInfo.view === 'detail') {
    const client = getClientById(store.snapshot, routeInfo.clientId);
    body = client
      ? renderDetail(client)
      : '<a class="studio-back-link" href="/studio/clients">← Clients</a><section class="studio-section"><div class="studio-empty">Client not found.</div></section>';
  } else {
    body = renderList();
  }

  main.innerHTML = bannerHtml + body;

  if (routeInfo.view === 'list') bindListEvents();
  else if (routeInfo.view === 'detail') bindDetailEvents();
  else if (routeInfo.view === 'reminders') bindReminderEvents();
}

export async function mountClients(mountCtx, mountRoute) {
  ctx = mountCtx;
  route = mountRoute || '/studio/clients';

  if (parseClientsRoute(route).view !== 'reminders') {
    reminderSettings = null;
  }
  if (parseClientsRoute(route).view === 'list') {
    historyFilter = 'all';
  }

  const main = document.getElementById('studio-main');
  if (!main) return;

  if (store) {
    store.dispose();
    store = null;
  }

  const banner = main.querySelector('.studio-banner');
  main.innerHTML = (banner ? banner.outerHTML : '') + '<div class="studio-clients"><div class="studio-empty">Loading clients…</div></div>';

  store = await createBookingsStore(ctx, function () {
    paint();
  });

  await paint();
}

export function disposeClients() {
  if (store) {
    store.dispose();
    store = null;
  }
}
