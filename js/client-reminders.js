/** Client reminder settings (port of clientReminders.ts). */
import { loadSiteSetting, saveSiteSetting } from './studio-api.js';

export const DEFAULT_CLIENT_REMINDER_RULES = [
  {
    id: 'before-24h',
    enabled: true,
    label: '24 hours before appointment',
    timing: 'before_booking',
    offsetHours: 24,
    subject: 'Reminder: your appointment tomorrow',
    message:
      'Hi {firstName},\n\nThis is a friendly reminder about your upcoming appointment on {appointmentDate} at {appointmentTime}.\n\nSee you soon,\n{businessName}',
  },
  {
    id: 'after-thankyou',
    enabled: false,
    label: 'Thank you after visit',
    timing: 'after_booking',
    offsetHours: 24,
    subject: 'Thank you for your visit',
    message:
      'Hi {firstName},\n\nThank you for visiting {businessName}. We hope you loved your service.\n\nBook again anytime: {siteUrl}',
  },
];

export const REMINDER_OFFSET_PRESETS = [
  { label: '1 hour', hours: 1 },
  { label: '24 hours', hours: 24 },
  { label: '2 days', hours: 48 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
];

function normalizeRules(rules) {
  if (!Array.isArray(rules)) return DEFAULT_CLIENT_REMINDER_RULES.slice();
  return rules.map(function (r) {
    return {
      id: r.id || crypto.randomUUID(),
      enabled: r.enabled !== false,
      label: r.label || 'Reminder',
      timing: r.timing === 'after_booking' ? 'after_booking' : 'before_booking',
      offsetHours: Number(r.offsetHours) || 24,
      subject: r.subject || '',
      message: r.message || '',
    };
  });
}

export function normalizeClientReminderSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { rules: DEFAULT_CLIENT_REMINDER_RULES.slice() };
  }
  const rules = raw.rules != null ? raw.rules : raw;
  return { rules: normalizeRules(rules) };
}

export async function loadClientReminderSettings(userId) {
  const raw = await loadSiteSetting(userId, 'client_reminder_settings');
  return normalizeClientReminderSettings(raw);
}

export async function saveClientReminderSettings(userId, settings) {
  await saveSiteSetting(userId, 'client_reminder_settings', normalizeClientReminderSettings(settings));
}

export function sampleReminderPreview(ctx) {
  return {
    firstName: 'Alex',
    clientName: 'Alex Johnson',
    styleName: 'Silk Press',
    businessName: ctx.businessName || 'Your salon',
    appointmentDate: 'Sat, Jun 28',
    appointmentTime: '2:00 PM',
    siteUrl: ctx.siteUrl || 'https://yoursite.styldd.com',
  };
}
