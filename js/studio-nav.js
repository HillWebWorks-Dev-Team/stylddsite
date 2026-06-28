/**
 * Studio navigation structure — grouped for sidebar layout.
 */
export const STUDIO_NAV_GROUPS = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/studio/dashboard', icon: 'grid', desc: 'Today & bookings' },
      { id: 'calendar', label: 'Calendar', path: '/studio/calendar', icon: 'calendar', desc: 'Schedule & hours' },
      { id: 'clients', label: 'Clients', path: '/studio/clients', icon: 'users', desc: 'CRM & outreach' },
    ],
  },
  {
    id: 'grow',
    label: 'Grow',
    items: [
      { id: 'analytics', label: 'Analytics', path: '/studio/analytics', icon: 'chart', desc: 'Traffic & revenue' },
      { id: 'website', label: 'Website', path: '/studio/website', icon: 'globe', desc: 'Your booking site' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'settings', label: 'Settings', path: '/studio/settings', icon: 'settings', desc: 'Business setup' },
    ],
  },
];

/** Flat list — same order as mobile nav + legacy imports */
export const STUDIO_NAV = STUDIO_NAV_GROUPS.flatMap(function (g) {
  return g.items;
});

export const STUDIO_ICONS = {
  grid:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M14.5 20c.3-2.2 1.8-4 4.5-4"/></svg>',
  chart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M4 19V5M10 19V9M16 19v-6M22 19V3"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  external:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M14 5h5v5M10 14L19 5M19 14v5H5V5h5"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 17.5l-4 1 1-4L16.5 3.5z"/></svg>',
  menu:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
};
