-- Per-tenant site analytics (profile + booking page views).
-- Run in Supabase SQL Editor or via supabase db push.

create table if not exists public.styld_site_page_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subdomain text not null,
  path text not null default '/',
  page_type text not null default 'other' check (page_type in ('profile', 'booking', 'other')),
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists styld_site_page_views_user_created_idx
  on public.styld_site_page_views (user_id, created_at desc);

create index if not exists styld_site_page_views_subdomain_created_idx
  on public.styld_site_page_views (subdomain, created_at desc);

-- Resolve user_id server-side from published subdomain (client never sends user_id).
create or replace function public.styld_site_page_views_set_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select s.user_id
    into new.user_id
  from public.styld_site_subdomains s
  where s.subdomain = new.subdomain
    and s.published_at is not null
  limit 1;

  if new.user_id is null then
    raise exception 'unknown or unpublished subdomain';
  end if;

  return new;
end;
$$;

drop trigger if exists styld_site_page_views_set_user_id on public.styld_site_page_views;

create trigger styld_site_page_views_set_user_id
  before insert on public.styld_site_page_views
  for each row
  execute function public.styld_site_page_views_set_user_id();

alter table public.styld_site_page_views enable row level security;

drop policy if exists styld_site_page_views_anon_insert on public.styld_site_page_views;
create policy styld_site_page_views_anon_insert
  on public.styld_site_page_views
  for insert
  to anon
  with check (
    exists (
      select 1
      from public.styld_site_subdomains s
      where s.subdomain = subdomain
        and s.published_at is not null
    )
  );

drop policy if exists styld_site_page_views_owner_select on public.styld_site_page_views;
create policy styld_site_page_views_owner_select
  on public.styld_site_page_views
  for select
  to authenticated
  using (user_id = auth.uid());

-- App dashboard: call via supabase.rpc('get_site_analytics_summary', { p_days: 7 })
create or replace function public.get_site_analytics_summary(p_days integer default 7)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 90)));
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  return (
    select json_build_object(
      'period_days', greatest(1, least(p_days, 90)),
      'total_views', count(*)::int,
      'profile_views', count(*) filter (where page_type = 'profile')::int,
      'booking_views', count(*) filter (where page_type = 'booking')::int,
      'daily', coalesce((
        select json_agg(json_build_object('day', d.day, 'views', d.views) order by d.day)
        from (
          select created_at::date as day, count(*)::int as views
          from public.styld_site_page_views v2
          where v2.user_id = uid
            and v2.created_at >= since
          group by 1
        ) d
      ), '[]'::json),
      'top_pages', coalesce((
        select json_agg(json_build_object('path', t.path, 'page_type', t.page_type, 'views', t.views) order by t.views desc)
        from (
          select path, page_type, count(*)::int as views
          from public.styld_site_page_views v3
          where v3.user_id = uid
            and v3.created_at >= since
          group by path, page_type
          order by views desc
          limit 10
        ) t
      ), '[]'::json)
    )
    from public.styld_site_page_views v
    where v.user_id = uid
      and v.created_at >= since
  );
end;
$$;

grant execute on function public.get_site_analytics_summary(integer) to authenticated;
