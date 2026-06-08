-- Log of transactional emails sent to clients / salon owners (Resend, etc.).
-- Written by Supabase edge functions (service role). Admin dashboard reads via service role.

create table if not exists public.styld_sent_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  template_key text not null,
  recipient_email text not null,
  recipient_name text,
  subject text,
  preview_text text,
  html_body text,
  text_body text,
  booking_id uuid,
  client_email text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'queued', 'bounced')),
  provider text,
  provider_message_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists styld_sent_emails_user_created_idx
  on public.styld_sent_emails (user_id, created_at desc);

create index if not exists styld_sent_emails_recipient_idx
  on public.styld_sent_emails (lower(recipient_email), created_at desc);

create index if not exists styld_sent_emails_booking_idx
  on public.styld_sent_emails (booking_id)
  where booking_id is not null;

create index if not exists styld_sent_emails_template_idx
  on public.styld_sent_emails (template_key, created_at desc);

alter table public.styld_sent_emails enable row level security;

-- No public policies: only service role / security definer functions should access.
