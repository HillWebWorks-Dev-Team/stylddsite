import {
  bootstrapStudio,
  loadSiteEditorState,
  marketingCfg,
  requireSession,
  signOut,
} from '/js/studio-api.js';
import {
  STUDIO_NAV,
  STUDIO_NAV_GROUPS,
  STUDIO_ICONS,
} from '/js/studio-nav.js';
import {
  liveSiteUrl,
  marketingHomeUrl,
  studioRoutePath,
} from '/js/studio-access.js';
import {
  dashboardPageTitle,
  disposeDashboard,
  isAppointmentRoute,
  isDashboardHomeRoute,
  isDashboardRoute,
  mountDashboard,
} from '/marketing/studio/dashboard.js';
import {
  calendarPageTitle,
  disposeCalendar,
  isCalendarHomeRoute,
  isCalendarRoute,
  mountCalendar,
} from '/marketing/studio/calendar.js';
import {
  clientsPageTitle,
  disposeClients,
  isClientsRoute,
  isClientsHomeRoute,
  mountClients,
} from '/marketing/studio/clients.js';
import {
  disposeSettings,
  isSettingsRoute,
  mountSettings,
  settingsPageTitle,
} from '/marketing/studio/settings.js';
import {
  analyticsPageTitle,
  disposeAnalytics,
  isAnalyticsHomeRoute,
  isAnalyticsRoute,
  mountAnalytics,
} from '/marketing/studio/analytics.js';
import {
  disposeSubscribe,
  isSubscribeRoute,
  mountSubscribe,
} from '/marketing/studio/subscribe.js';
import { buildSitePreviewHtml } from '/js/site-preview.js';
import { startSubscriptionSiteSync, stopSubscriptionSiteSync } from '/js/subscription-sync.js';
import { subscriptionLabel } from '/js/studio-subscription.js';

let studioCtx = null;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function businessLabel(ctx) {
  return (
    ctx.profile?.business_name ||
    ctx.profile?.full_name ||
    ctx.session?.user?.email ||
    'Your business'
  );
}

function businessInitials(ctx) {
  const name = businessLabel(ctx);
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || 'S').toUpperCase();
}

function navItemActive(item, activePath) {
  return (
    activePath === item.path ||
    (item.id === 'website' && activePath.startsWith('/studio/website')) ||
    (item.id === 'dashboard' && isDashboardRoute(activePath)) ||
    (item.id === 'calendar' && isCalendarRoute(activePath)) ||
    (item.id === 'clients' && isClientsRoute(activePath)) ||
    (item.id === 'analytics' && isAnalyticsRoute(activePath)) ||
    (item.id === 'settings' && isSettingsRoute(activePath))
  );
}

function visibleNavGroups(accessPhase) {
  return STUDIO_NAV_GROUPS.map(function (group) {
    const items = group.items.filter(function (item) {
      if (accessPhase === 'build_site') {
        return item.id === 'website' || item.id === 'settings';
      }
      return true;
    });
    return { id: group.id, label: group.label, items: items };
  }).filter(function (g) {
    return g.items.length;
  });
}

function navLinkHtml(item, activePath, locked) {
  const active = navItemActive(item, activePath) ? ' is-active' : '';
  const disabled = locked && item.id !== 'settings' ? ' aria-disabled="true"' : '';
  const icon = STUDIO_ICONS[item.icon] || STUDIO_ICONS.grid;
  return (
    '<a href="' +
    esc(item.path) +
    '" class="studio-nav__link' +
    active +
    '" data-nav-id="' +
    esc(item.id) +
    '" data-studio-nav' +
    disabled +
    ' aria-label="' +
    esc(item.label) +
    '" title="' +
    esc(item.label) +
    '"><span class="studio-nav__icon">' +
    icon +
    '</span></a>'
  );
}

function navHtml(activePath, accessPhase) {
  const locked = accessPhase === 'paywall';
  const groups = visibleNavGroups(accessPhase);
  const flatItems = groups.flatMap(function (g) {
    return g.items;
  });
  const sidebar = flatItems
    .map(function (item) {
      return navLinkHtml(item, activePath, locked);
    })
    .join('');
  const mobile = flatItems
    .map(function (item) {
      const active = navItemActive(item, activePath) ? ' is-active' : '';
      const icon = STUDIO_ICONS[item.icon] || STUDIO_ICONS.grid;
      return (
        '<a href="' +
        esc(item.path) +
        '" class="studio-mobile-nav__link' +
        active +
        '" data-nav-id="' +
        esc(item.id) +
        '" data-studio-nav' +
        (locked && item.id !== 'settings' ? ' aria-disabled="true"' : '') +
        ' aria-label="' +
        esc(item.label) +
        '" title="' +
        esc(item.label) +
        '"><span class="studio-mobile-nav__icon">' +
        icon +
        '</span></a>'
      );
    })
    .join('');

  return { sidebar: sidebar, mobile: mobile };
}

function pageTitle(activePath) {
  if (isDashboardRoute(activePath)) return dashboardPageTitle(activePath);
  if (isCalendarRoute(activePath)) return calendarPageTitle(activePath);
  if (isClientsRoute(activePath)) return clientsPageTitle(activePath);
  if (isSettingsRoute(activePath)) return settingsPageTitle(activePath);
  if (isAnalyticsRoute(activePath)) return analyticsPageTitle(activePath);
  if (isWebsiteRoute(activePath)) return websitePageTitle(activePath);
  if (isSubscribeRoute(activePath)) return 'Subscribe';
  if (isAppointmentRoute(activePath)) {
    return activePath.includes('/session') ? 'Session' : 'Appointment';
  }
  const navItem = STUDIO_NAV.find(function (n) {
    return (
      n.path === activePath ||
      (n.id === 'website' && activePath.startsWith('/studio/website')) ||
      (n.id === 'analytics' && isAnalyticsRoute(activePath))
    );
  });
  return navItem ? navItem.label : 'Studio';
}

function topbarHtml(ctx, activePath) {
  const title = pageTitle(activePath);
  const liveUrl =
    ctx.publishedAt && ctx.subdomain
      ? liveSiteUrl(ctx.subdomain.subdomain || ctx.subdomain, ctx.rootDomain)
      : null;
  const statusClass = ctx.publishedAt ? 'studio-status-pill--live' : 'studio-status-pill--draft';
  const statusLabel = ctx.publishedAt ? 'Live' : 'Draft';
  const sub = subscriptionLabel(ctx.subscription || {});

  return (
    '<div class="studio-topbar__start">' +
    '<button type="button" class="studio-icon-btn studio-menu-btn" id="studio-menu-toggle" aria-label="Open menu">' +
    STUDIO_ICONS.menu +
    '</button>' +
    '<div class="studio-topbar__titles">' +
    '<div class="studio-topbar__crumb">Studio <span aria-hidden="true">/</span> ' +
    esc(title) +
    '</div>' +
    '<div class="studio-topbar__meta">' +
    esc(businessLabel(ctx)) +
    ' · <span class="studio-status-pill ' +
    statusClass +
    '">' +
    esc(statusLabel) +
    '</span></div></div></div>' +
    '<div class="studio-topbar__actions">' +
    (isDashboardRoute(activePath)
      ? '<button type="button" class="studio-icon-btn" title="Notifications (coming soon)" aria-label="Notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M15 17H9l-6 3V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11l-6-3z"/></svg></button>'
      : '') +
    '<a class="studio-btn studio-btn--ghost studio-btn--icon" href="/studio/website/edit" title="Edit website">' +
    STUDIO_ICONS.edit +
    '<span class="studio-btn__text">Edit site</span></a>' +
    (liveUrl
      ? '<a class="studio-btn studio-btn--primary studio-btn--icon" href="' +
        esc(liveUrl) +
        '" target="_blank" rel="noopener noreferrer" title="View live site">' +
        STUDIO_ICONS.external +
        '<span class="studio-btn__text">Live site</span></a>'
      : '') +
    '<div class="studio-user-menu">' +
    '<button type="button" class="studio-user-menu__trigger" id="studio-user-toggle" aria-expanded="false">' +
    '<span class="studio-user-menu__avatar">' +
    esc(businessInitials(ctx)) +
    '</span><span class="studio-user-menu__name">' +
    esc(businessLabel(ctx).split(' ')[0] || 'Account') +
    '</span></button>' +
    '<div class="studio-user-menu__panel" id="studio-user-panel" hidden>' +
    '<div class="studio-user-menu__head"><strong>' +
    esc(businessLabel(ctx)) +
    '</strong><span>' +
    esc(sub) +
    '</span></div>' +
    '<a href="/studio/settings/account">Account settings</a>' +
    '<a href="/studio/settings">Business settings</a>' +
    '<a href="/studio/subscribe">Subscription</a>' +
    '<button type="button" id="studio-signout">Sign out</button></div></div></div>'
  );
}

function sidebarQuickLinks(ctx) {
  const liveUrl =
    ctx.publishedAt && ctx.subdomain
      ? liveSiteUrl(ctx.subdomain.subdomain || ctx.subdomain, ctx.rootDomain)
      : null;
  return (
    '<div class="studio-sidebar__quick">' +
    '<a class="studio-quick-link studio-quick-link--icon" href="/studio/website/edit" aria-label="Edit website" title="Edit website">' +
    STUDIO_ICONS.edit +
    '</a>' +
    (liveUrl
      ? '<a class="studio-quick-link studio-quick-link--icon studio-quick-link--accent" href="' +
        esc(liveUrl) +
        '" target="_blank" rel="noopener noreferrer" aria-label="View live site" title="View live site">' +
        STUDIO_ICONS.external +
        '</a>'
      : '') +
    '</div>'
  );
}

function sidebarUserCard(ctx, route) {
  const active = route.startsWith('/studio/settings/account') ? ' is-active' : '';
  return (
    '<a href="/studio/settings/account" class="studio-user-card studio-user-card--icon' +
    active +
    '" data-studio-nav data-nav-id="account" aria-label="Account settings" title="' +
    esc(businessLabel(ctx)) +
    '">' +
    '<span class="studio-user-card__avatar">' +
    esc(businessInitials(ctx)) +
    '</span></a>'
  );
}

function bannerHtml(ctx) {
  if (ctx.accessPhase === 'build_site') {
    return (
      '<div class="studio-banner"><p>Your booking site isn&rsquo;t live yet. Set up your site to start taking bookings.</p>' +
      '<a class="studio-btn studio-btn--primary" href="/studio/website/edit">Set up your site</a></div>'
    );
  }
  if (ctx.accessPhase === 'paywall') {
    return (
      '<div class="studio-banner"><p>Your subscription has lapsed. Resubscribe to restore your booking site and studio.</p>' +
      '<a class="studio-btn studio-btn--primary" href="/studio/subscribe">Subscribe to Styld Pro</a></div>'
    );
  }
  return '';
}

function sectionPlaceholder(title, part) {
  return (
    '<section class="studio-panel">' +
    '<h2>' +
    esc(title) +
    '</h2>' +
    '<p class="studio-placeholder">This section is planned for ' +
    esc(part) +
    '. The studio shell and navigation are ready.</p>' +
    '</section>'
  );
}

function isStudioSpaPath(path) {
  const clean = String(path || '').split('?')[0].split('#')[0].replace(/\/$/, '') || '/studio';
  if (!clean.startsWith('/studio')) return false;
  if (clean.startsWith('/studio/website/edit')) return false;
  return true;
}

function shellExists() {
  return !!document.querySelector('.studio-shell');
}

function syncNavActive(route) {
  document.querySelectorAll('[data-studio-nav]').forEach(function (el) {
    const id = el.getAttribute('data-nav-id');
    const item = id ? STUDIO_NAV.find(function (n) { return n.id === id; }) : null;
    if (item) {
      el.classList.toggle('is-active', navItemActive(item, route));
    }
  });
  const userCard = document.querySelector('.studio-user-card');
  if (userCard) {
    userCard.classList.toggle('is-active', route.startsWith('/studio/settings/account'));
  }
}

function mountRouteModule(ctx, route) {
  if (isAppointmentRoute(route)) {
    disposeCalendar();
    disposeClients();
    disposeSettings();
    disposeAnalytics();
    disposeWebsite();
    disposeSubscribe();
    mountDashboard(ctx, route).catch(handleMountError(ctx));
    return;
  }

  if (isSettingsRoute(route)) {
    disposeDashboard();
    disposeCalendar();
    disposeClients();
    disposeAnalytics();
    disposeWebsite();
    disposeSubscribe();
    mountSettings(ctx, route).catch(handleMountError(ctx));
    return;
  }

  if (isAnalyticsRoute(route)) {
    disposeDashboard();
    disposeCalendar();
    disposeClients();
    disposeSettings();
    disposeWebsite();
    disposeSubscribe();
    mountAnalytics(ctx, route).catch(handleMountError(ctx));
    return;
  }

  if (isWebsiteHomeRoute(route)) {
    disposeDashboard();
    disposeCalendar();
    disposeClients();
    disposeSettings();
    disposeAnalytics();
    disposeSubscribe();
    mountWebsite(ctx, route).catch(handleMountError(ctx));
    return;
  }

  if (isClientsRoute(route)) {
    disposeDashboard();
    disposeCalendar();
    disposeSettings();
    disposeAnalytics();
    disposeWebsite();
    disposeSubscribe();
    mountClients(ctx, route).catch(handleMountError(ctx));
    return;
  }

  if (isCalendarRoute(route)) {
    disposeDashboard();
    disposeClients();
    disposeSettings();
    disposeAnalytics();
    disposeWebsite();
    disposeSubscribe();
    mountCalendar(ctx, route).catch(handleMountError(ctx));
    return;
  }

  if (isDashboardRoute(route)) {
    disposeCalendar();
    disposeClients();
    disposeSettings();
    disposeAnalytics();
    disposeWebsite();
    disposeSubscribe();
    mountDashboard(ctx, route).catch(handleMountError(ctx));
    return;
  }

  disposeDashboard();
  disposeCalendar();
  disposeClients();
  disposeSettings();
  disposeAnalytics();
  disposeWebsite();
  disposeSubscribe();
}

function updateMain(ctx, route) {
  const main = document.getElementById('studio-main');
  if (!main) return;
  const html = bannerHtml(ctx) + renderMain(ctx, route);
  const inner = main.querySelector(':scope > .studio-main__inner');
  if (inner) {
    inner.innerHTML = html;
  } else {
    main.innerHTML = html;
  }
}

function updateTopbar(ctx, route) {
  const topbar = document.getElementById('studio-topbar');
  const content = document.querySelector('.studio-content');
  if (content) {
    content.classList.toggle('studio-content--calendar-home', isCalendarHomeRoute(route));
    content.classList.toggle('studio-content--clients-home', isClientsHomeRoute(route));
    content.classList.toggle('studio-content--analytics-home', isAnalyticsHomeRoute(route));
    content.classList.toggle('studio-content--website-home', isWebsiteHomeRoute(route));
    content.classList.toggle('studio-content--dashboard-home', isDashboardHomeRoute(route));
  }
  if (!topbar) return;
  if (
    isCalendarHomeRoute(route) ||
    isClientsHomeRoute(route) ||
    isAnalyticsHomeRoute(route) ||
    isWebsiteHomeRoute(route) ||
    isDashboardHomeRoute(route)
  ) {
    topbar.hidden = true;
    return;
  }
  topbar.hidden = false;
  topbar.innerHTML = topbarHtml(ctx, route);
}

function navigateStudio(path, options) {
  options = options || {};
  if (!studioCtx) return;
  const next = studioRoutePath(path);
  const current = studioRoutePath(window.location.pathname);
  if (next === current && !options.force) return;

  if (options.replace) {
    history.replaceState({ studio: next }, '', next);
  } else {
    history.pushState({ studio: next }, '', next);
  }
  updateStudioRoute(studioCtx, next);
}

function updateStudioRoute(ctx, route) {
  route = studioRoutePath(route);

  if (ctx.accessPhase === 'paywall' && !isSubscribeRoute(route)) {
    window.location.replace('/studio/subscribe');
    return;
  }

  syncNavActive(route);
  updateTopbar(ctx, route);
  updateMain(ctx, route);
  mountRouteModule(ctx, route);
  document.title = pageTitle(route) + ' — Styld Studio';

  const sidebar = document.getElementById('studio-sidebar');
  const backdrop = document.getElementById('studio-backdrop');
  if (sidebar) sidebar.classList.remove('is-open');
  if (backdrop) backdrop.hidden = true;
  document.body.classList.remove('studio-nav-open');
}

function renderMain(ctx, route) {
  if (ctx.accessPhase === 'paywall' && !isSubscribeRoute(route)) {
    window.location.replace('/studio/subscribe');
    return '<div class="studio-empty">Redirecting…</div>';
  }

  if (isSubscribeRoute(route)) {
    return '<div id="studio-paywall-root"></div>';
  }

  if (isDashboardRoute(route)) {
    if (isDashboardHomeRoute(route)) {
      return '<div class="dash dash--home"><div class="dash-loading">Loading bookings…</div></div>';
    }
    return '<div class="dash"><div class="dash-loading">Loading bookings…</div></div>';
  }

  if (isCalendarRoute(route)) {
    return '<div class="studio-cal"><div class="studio-empty">Loading calendar…</div></div>';
  }

  if (isAppointmentRoute(route)) {
    return '<div class="studio-dash"><div class="studio-empty">Loading appointment…</div></div>';
  }

  if (isClientsRoute(route)) {
    return '<div class="studio-clients"><div class="studio-empty">Loading clients…</div></div>';
  }

  if (isSettingsRoute(route)) {
    return '<div class="studio-settings"><div class="studio-empty">Loading settings…</div></div>';
  }

  if (isAnalyticsRoute(route)) {
    if (isAnalyticsHomeRoute(route)) {
      return '<div class="studio-analytics studio-analytics--home"><div class="studio-empty">Loading analytics…</div></div>';
    }
    return '<div class="studio-analytics"><div class="studio-empty">Loading analytics…</div></div>';
  }

  if (isWebsiteHomeRoute(route)) {
    return '<div class="studio-website studio-website--home"><div class="studio-empty">Loading your site…</div></div>';
  }

  switch (route) {
    case '/studio/settings/account':
      return '<div class="studio-settings"><div class="studio-empty">Loading settings…</div></div>';
    default:
      if (isDashboardRoute(route)) {
        if (isDashboardHomeRoute(route)) {
          return '<div class="dash dash--home"><div class="dash-loading">Loading bookings…</div></div>';
        }
        return '<div class="dash"><div class="dash-loading">Loading bookings…</div></div>';
      }
      if (isCalendarRoute(route)) {
        return '<div class="studio-cal"><div class="studio-empty">Loading calendar…</div></div>';
      }
      if (isClientsRoute(route)) {
        return '<div class="studio-clients"><div class="studio-empty">Loading clients…</div></div>';
      }
      if (isSettingsRoute(route)) {
        return '<div class="studio-settings"><div class="studio-empty">Loading settings…</div></div>';
      }
      if (isAnalyticsRoute(route)) {
        if (isAnalyticsHomeRoute(route)) {
          return '<div class="studio-analytics studio-analytics--home"><div class="studio-empty">Loading analytics…</div></div>';
        }
        return '<div class="studio-analytics"><div class="studio-empty">Loading analytics…</div></div>';
      }
      if (isWebsiteHomeRoute(route)) {
        return '<div class="studio-website studio-website--home"><div class="studio-empty">Loading your site…</div></div>';
      }
      return sectionPlaceholder('Dashboard', 'Part 3');
  }
}

function renderPaywallOnly(ctx) {
  const root = document.getElementById('studio-app');
  root.innerHTML = '<div id="studio-paywall-root"></div>';
  mountSubscribe(ctx).catch(handleMountError(ctx));
}

function renderShell(ctx) {
  studioCtx = ctx;
  const route = studioRoutePath(window.location.pathname);
  const path = window.location.pathname.replace(/\/$/, '') || '/studio';

  if (ctx.accessPhase === 'paywall') {
    if (!isSubscribeRoute(path)) {
      window.location.replace('/studio/subscribe');
      return;
    }
    stopSubscriptionSiteSync();
    renderPaywallOnly(ctx);
    return;
  }

  if (isSubscribeRoute(path)) {
    renderPaywallOnly(ctx);
    return;
  }

  if (shellExists()) {
    updateStudioRoute(ctx, route);
    return;
  }

  const nav = navHtml(route, ctx.accessPhase);

  const root = document.getElementById('studio-app');
  root.innerHTML =
    '<div class="studio-shell">' +
    '<div class="studio-backdrop" id="studio-backdrop" hidden></div>' +
    '<aside class="studio-sidebar" id="studio-sidebar">' +
    '<div class="studio-sidebar__inner">' +
    '<a href="' +
    esc(marketingHomeUrl(ctx.rootDomain)) +
    '" class="studio-brand" aria-label="Styld marketing site" title="Styld home">' +
    '<img src="/assets/styld-icon.png" width="36" height="36" alt="Styld">' +
    '</a>' +
    sidebarQuickLinks(ctx) +
    '<nav class="studio-nav" aria-label="Studio">' +
    nav.sidebar +
    '</nav>' +
    '<div class="studio-sidebar__foot">' +
    sidebarUserCard(ctx, route) +
    '</div></div></aside>' +
    '<div class="studio-content">' +
    '<header class="studio-topbar" id="studio-topbar">' +
    topbarHtml(ctx, route) +
    '</header>' +
    '<main class="studio-main" id="studio-main">' +
    '<div class="studio-main__inner">' +
    bannerHtml(ctx) +
    renderMain(ctx, route) +
    '</div></main></div>' +
    '<nav class="studio-mobile-nav" aria-label="Studio mobile" id="studio-mobile-nav">' +
    nav.mobile +
    '</nav></div>';

  bindShellEvents(ctx);
  updateTopbar(ctx, route);
  startSubscriptionSiteSync(ctx);
  document.title = pageTitle(route) + ' — Styld Studio';
  mountRouteModule(ctx, route);
}

function handleMountError(ctx) {
  return function (err) {
    const main = document.getElementById('studio-main');
    if (!main) return;
    const html =
      bannerHtml(ctx) +
      '<section class="studio-panel"><h2>Could not load</h2><p>' +
      esc(err && err.message ? err.message : 'Something went wrong.') +
      '</p></section>';
    const inner = main.querySelector(':scope > .studio-main__inner');
    if (inner) {
      inner.innerHTML = html;
    } else {
      main.innerHTML = html;
    }
  };
}

function bindShellEvents(ctx) {
  const root = document.getElementById('studio-app');
  if (root && root.dataset.studioNavBound !== '1') {
    root.dataset.studioNavBound = '1';
    root.addEventListener('click', function (e) {
      const menuBtn = e.target.closest('#studio-menu-toggle');
      if (menuBtn) {
        const sidebar = document.getElementById('studio-sidebar');
        const backdrop = document.getElementById('studio-backdrop');
        if (sidebar && backdrop) {
          const open = sidebar.classList.toggle('is-open');
          backdrop.hidden = !open;
          document.body.classList.toggle('studio-nav-open', open);
        }
        return;
      }

      if (e.target.closest('#studio-signout')) {
        signOut().finally(function () {
          window.location.href = '/login';
        });
        return;
      }

      const userToggle = e.target.closest('#studio-user-toggle');
      const userPanel = document.getElementById('studio-user-panel');
      if (userToggle && userPanel) {
        e.stopPropagation();
        const open = userPanel.hidden;
        userPanel.hidden = !open;
        userToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }

      const link = e.target.closest('a[href^="/studio"]');
      if (link && !link.target && link.getAttribute('aria-disabled') !== 'true') {
        const path = (link.getAttribute('href') || '').split('?')[0].split('#')[0];
        if (isStudioSpaPath(path)) {
          e.preventDefault();
          navigateStudio(path);
          return;
        }
      }

      if (e.target.closest('#studio-paywall-cta')) {
        e.preventDefault();
        window.location.href = '/studio/subscribe';
      }

      if (e.target.closest('.studio-notify-btn')) {
        e.preventDefault();
        window.alert('Push notifications arrive in Part 8.');
      }
    });

    document.addEventListener('click', function () {
      const userPanel = document.getElementById('studio-user-panel');
      const userToggle = document.getElementById('studio-user-toggle');
      if (userPanel && !userPanel.hidden) {
        userPanel.hidden = true;
        if (userToggle) userToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.querySelectorAll('[data-studio-nav][aria-disabled="true"]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
    });
  });

  const sidebar = document.getElementById('studio-sidebar');
  const backdrop = document.getElementById('studio-backdrop');
  function closeMobileNav() {
    if (sidebar) sidebar.classList.remove('is-open');
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('studio-nav-open');
  }
  if (sidebar && backdrop) {
    backdrop.addEventListener('click', closeMobileNav);
    sidebar.querySelectorAll('a[data-studio-nav]').forEach(function (link) {
      link.addEventListener('click', closeMobileNav);
    });
  }
}

const WEBSITE_HERO_LAYOUT_LABELS = {
  stack: 'Photo Stack',
  split: 'Split Hero',
  cover: 'Cover Hero',
  'image-below': 'Image Below',
  minimal: 'Minimal',
};

const WEBSITE_PREVIEW_PAGES = [
  { id: 'home', label: 'Home', path: '/' },
  { id: 'book', label: 'Book', path: '/booking' },
  { id: 'products', label: 'Shop', path: '/products', section: 'products' },
  { id: 'portfolio', label: 'Portfolio', path: '/portfolio', section: 'portfolio' },
];

let websiteCtx = null;
let websiteRoute = '/studio/website';
let websiteSiteState = null;
let websitePreviewView = 'desktop';

function isWebsiteRoute(r) {
  const clean = String(r || '').replace(/\/$/, '');
  return clean === '/studio/website';
}

function isWebsiteHomeRoute(r) {
  return isWebsiteRoute(r);
}

function websitePageTitle() {
  return 'Website';
}

function websiteSlug() {
  return (
    websiteCtx?.subdomain?.subdomain ||
    websiteCtx?.sitePublish?.subdomain ||
    websiteSiteState?.subdomain?.subdomain ||
    ''
  );
}

function websiteLiveBase() {
  const s = websiteSlug();
  return websiteCtx?.publishedAt && s ? liveSiteUrl(s, websiteCtx.rootDomain) : null;
}

function websiteLayoutLabel() {
  const layout = websiteSiteState?.theme?.heroLayout || 'split';
  return WEBSITE_HERO_LAYOUT_LABELS[layout] || 'Custom layout';
}

function websiteStatusLabel() {
  const s = websiteSlug();
  if (websiteCtx?.publishedAt && s) return 'Live · ' + s + '.' + websiteCtx.rootDomain;
  if (s) return 'Draft · ' + s + '.' + websiteCtx.rootDomain;
  return 'Draft · subdomain not set';
}

function websiteVisiblePreviewPages() {
  const hidden = websiteSiteState?.content?.hiddenSections || [];
  if (!websiteLiveBase()) {
    return [{ id: 'home', label: 'Home preview', path: '/' }];
  }
  return WEBSITE_PREVIEW_PAGES.filter(function (page) {
    if (!page.section) return true;
    return hidden.indexOf(page.section) === -1;
  });
}

function websitePreviewUrl(path) {
  const base = websiteLiveBase();
  if (!base) return '';
  if (!path || path === '/') return base;
  return base.replace(/\/$/, '') + path;
}

function websiteBrowserBarUrl(path) {
  const s = websiteSlug() || 'yourname';
  const host = s + '.' + (websiteCtx?.rootDomain || 'styldd.com');
  if (!path || path === '/') return host;
  return host + path;
}

function websitePreviewBrowserHtml(page, options) {
  options = options || {};
  const mobileClass = websitePreviewView === 'mobile' ? ' is-mobile' : '';
  const live = websiteLiveBase();
  const pageUrl = websitePreviewUrl(page.path);
  const inner =
    '<div class="studio-website-preview__browser">' +
    '<div class="studio-website-preview__bar">' +
    '<span class="studio-website-preview__dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
    '<span class="studio-website-preview__url">' +
    esc(websiteBrowserBarUrl(page.path)) +
    '</span></div>' +
    '<div class="studio-website-preview__viewport" data-website-viewport>' +
    (live
      ? '<iframe src="' +
        esc(pageUrl) +
        '" title="' +
        esc(page.label + ' preview') +
        '" loading="lazy" tabindex="-1"></iframe>'
      : '<iframe data-website-srcdoc title="' +
        esc(page.label + ' preview') +
        '" tabindex="-1"></iframe>') +
    '</div></div>' +
    '<div class="studio-website-preview__caption">' +
    '<span class="studio-website-preview__type">' +
    esc(page.id === 'home' && !live ? websiteLayoutLabel() : page.label) +
    '</span>' +
    (page.id === 'home' && live
      ? '<span class="studio-website-preview__hint">' + esc(websiteLayoutLabel()) + '</span>'
      : '') +
    '</div>';

  if (live && !options.noLink) {
    return (
      '<a class="studio-website-preview' +
      mobileClass +
      '" href="' +
      esc(pageUrl) +
      '" target="_blank" rel="noopener noreferrer" aria-label="Open ' +
      esc(page.label) +
      ' page">' +
      inner +
      '</a>'
    );
  }

  return '<article class="studio-website-preview' + mobileClass + '">' + inner + '</article>';
}

function websiteToolbarHtml() {
  const live = websiteLiveBase();
  return (
    '<div class="studio-website__toolbar">' +
    '<span class="studio-website__status">' +
    esc(websiteStatusLabel()) +
    '</span>' +
    '<div class="studio-website__toolbar-actions">' +
    '<button type="button" class="studio-website__pill-btn' +
    (websitePreviewView === 'desktop' ? ' is-active' : '') +
    '" data-website-view="desktop">Desktop</button>' +
    '<button type="button" class="studio-website__pill-btn' +
    (websitePreviewView === 'mobile' ? ' is-active' : '') +
    '" data-website-view="mobile">Mobile</button>' +
    '<a class="studio-website__pill-btn studio-website__pill-btn--accent" href="/studio/website/edit">Edit site</a>' +
    (live
      ? '<a class="studio-website__pill-btn" href="' +
        esc(live) +
        '" target="_blank" rel="noopener noreferrer">View live</a>'
      : '') +
    (websiteCtx?.publishedAt
      ? '<a class="studio-website__pill-btn" href="/studio/analytics">Analytics</a>'
      : '') +
    '</div></div>'
  );
}

function renderWebsiteHome() {
  const pages = websiteVisiblePreviewPages();
  const previews = pages
    .map(function (page) {
      return websitePreviewBrowserHtml(page);
    })
    .join('');

  return (
    '<div class="studio-website studio-website--home">' +
    websiteToolbarHtml() +
    '<div class="studio-website__panel">' +
    '<div class="studio-website__previews">' +
    previews +
    '</div>' +
    '<p class="studio-website__footnote">' +
    (websiteLiveBase()
      ? 'Tap a preview to open that page on your live site.'
      : 'Draft preview from your current editor content — publish to share your link.') +
    '</p></div></div>'
  );
}

function applyWebsiteDraftPreviews() {
  if (websiteLiveBase()) return;
  const cfg = marketingCfg();
  const html = buildSitePreviewHtml({
    content: websiteSiteState.content,
    theme: websiteSiteState.theme,
    styles: websiteSiteState.styles || [],
    supabaseUrl: cfg.supabaseUrl || '',
  });
  document.querySelectorAll('[data-website-srcdoc]').forEach(function (frame) {
    frame.srcdoc = html;
  });
}

function bindWebsiteEvents() {
  document.querySelectorAll('[data-website-view]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      websitePreviewView = btn.getAttribute('data-website-view') === 'mobile' ? 'mobile' : 'desktop';
      paintWebsite();
    });
  });
}

function paintWebsite() {
  const main = document.getElementById('studio-main');
  if (!main || !websiteSiteState) return;
  const content = document.querySelector('.studio-content');
  if (content) {
    content.classList.toggle('studio-content--website-home', isWebsiteHomeRoute(websiteRoute));
  }
  const topbar = document.getElementById('studio-topbar');
  if (topbar) topbar.hidden = isWebsiteHomeRoute(websiteRoute);
  const banner = main.querySelector('.studio-banner');
  const bannerHtml = banner ? banner.outerHTML : '';
  main.innerHTML = bannerHtml + renderWebsiteHome();
  applyWebsiteDraftPreviews();
  bindWebsiteEvents();
}

async function mountWebsite(mountCtx, mountRoute) {
  websiteCtx = mountCtx;
  websiteRoute = mountRoute || '/studio/website';

  const main = document.getElementById('studio-main');
  if (!main) return;

  main.innerHTML =
    (main.querySelector('.studio-banner')?.outerHTML || '') +
    '<div class="studio-website studio-website--home"><div class="studio-empty">Loading your site…</div></div>';

  websiteSiteState = await loadSiteEditorState(websiteCtx.session.user.id);
  paintWebsite();
}

function disposeWebsite() {
  websiteCtx = null;
  websiteSiteState = null;
  websitePreviewView = 'desktop';
}

async function init() {
  const root = document.getElementById('studio-app');
  try {
    await requireSession('/login');
    const ctx = await bootstrapStudio();

    if (ctx.accessPhase === 'account_onboarding') {
      window.location.replace('/onboarding');
      return;
    }

    renderShell(ctx);

    window.addEventListener('popstate', function () {
      if (!studioCtx) return;
      updateStudioRoute(studioCtx, window.location.pathname);
    });
  } catch (err) {
    if (String(err && err.message) === 'redirecting') return;
    if (!root) return;
    root.innerHTML =
      '<div class="studio-gate"><span class="tag">Studio</span><h1>Could not load studio</h1><p>' +
      esc(err && err.message ? err.message : 'Something went wrong.') +
      '</p><div class="studio-gate__actions"><a class="studio-btn studio-btn--primary" href="/login">Back to login</a></div></div>';
  }
}

init().catch(function (err) {
  var root = document.getElementById('studio-app');
  if (!root) return;
  root.innerHTML =
    '<div class="studio-gate"><span class="tag">Studio</span><h1>Could not load studio</h1><p>' +
    esc(err && err.message ? err.message : 'Module failed to load.') +
    '</p><div class="studio-gate__actions"><a class="studio-btn studio-btn--primary" href="/login">Back to login</a></div></div>';
});
