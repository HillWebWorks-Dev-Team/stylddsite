/** Web Studio — client bulk email API. */
import { invokeFunction } from './studio-api.js';
import { applyPlaceholders, buildClientMergeContext, isValidClientEmail } from './client-email.js';

export async function sendClientContactEmail(ctx, options) {
  const businessName =
    ctx.profile?.business_name || ctx.profile?.full_name || ctx.session?.user?.email || 'Your business';
  const slug = ctx.subdomain?.subdomain || ctx.sitePublish?.subdomain || '';
  const root = ctx.rootDomain || 'styldd.com';
  const siteUrl = slug ? 'https://' + slug + '.' + root : '';

  const recipients = (options.clients || [])
    .filter(function (c) {
      return isValidClientEmail(c.email);
    })
    .map(function (c) {
      const merge = buildClientMergeContext(c, businessName, siteUrl);
      return {
        email: c.email,
        name: c.name,
        merge: Object.assign({}, merge, { businessName: businessName, siteUrl: siteUrl }),
      };
    });

  if (!recipients.length) throw new Error('No recipients with valid email addresses.');

  return invokeFunction('client-contact-email', {
    templateId: options.templateId || 'custom',
    subject: options.subject,
    message: options.message,
    recipients: recipients,
  });
}
