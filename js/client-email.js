/** Client email templates (port of clientEmailTemplates.ts). */

export const CLIENT_EMAIL_TEMPLATES = [
  {
    id: 'book_again',
    label: 'Book again',
    defaultSubject: 'Ready for your next appointment, {firstName}?',
    defaultMessage:
      'Hi {firstName},\n\nIt has been a while since your last visit. Book your next {styleName} appointment anytime:\n\n{siteUrl}\n\nSee you soon,\n{businessName}',
  },
  {
    id: 'thank_you',
    label: 'Thank you',
    defaultSubject: 'Thank you for visiting {businessName}',
    defaultMessage:
      'Hi {firstName},\n\nThank you for choosing us for your recent appointment. We hope you loved your {styleName} service.\n\n{businessName}',
  },
  {
    id: 'promo',
    label: 'Special offer',
    defaultSubject: 'A special offer for you, {firstName}',
    defaultMessage:
      'Hi {firstName},\n\nWe have a special offer just for you. Book your next appointment here:\n\n{siteUrl}\n\n{businessName}',
  },
  {
    id: 'check_in',
    label: 'Check in',
    defaultSubject: 'Checking in, {firstName}',
    defaultMessage:
      'Hi {firstName},\n\nJust checking in to see if you need to schedule your next appointment. Reply anytime or book online:\n\n{siteUrl}\n\n{businessName}',
  },
  {
    id: 'custom',
    label: 'Custom message',
    defaultSubject: 'Message from {businessName}',
    defaultMessage: 'Hi {firstName},\n\n',
  },
];

export function firstName(fullName) {
  const parts = String(fullName || 'there').trim().split(/\s+/);
  return parts[0] || 'there';
}

export function applyPlaceholders(text, ctx) {
  if (!text) return '';
  return String(text).replace(/\{(\w+)\}/g, function (_m, key) {
    return ctx[key] != null ? String(ctx[key]) : '';
  });
}

export function buildClientMergeContext(client, businessName, siteUrl) {
  const upcoming = (client.pastBookings || []).find(function (b) {
    return b.status === 'upcoming' || b.status === 'in_progress' || b.status === 'pending';
  });
  const recent = (client.pastBookings || [])[0];
  const ref = upcoming || recent;
  const favorite = (client.favoriteOrders || [])[0];

  return {
    firstName: firstName(client.name),
    clientName: client.name,
    styleName: (ref && ref.service) || (favorite && favorite.service) || 'your service',
    businessName: businessName || 'Your stylist',
    appointmentDate: (ref && ref.date) || '',
    appointmentTime: (ref && ref.time) || '',
    siteUrl: siteUrl || '',
  };
}

export function isValidClientEmail(email) {
  const e = String(email || '').trim();
  return !!e && e !== '—' && e.includes('@');
}
